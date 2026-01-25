import {
  Vector3, Group, Raycaster, type Bone, Mesh,
  MeshBasicMaterial, DoubleSide,
  BufferAttribute
} from 'three'

import { Utility } from '../Utilities.js'
import { SkeletonType } from '../enums/SkeletonType.js'
import { AbstractAutoSkinSolver } from './AbstractAutoSkinSolver.js'
import { Generators } from '../Generators.js'
import { HeadWeightCorrector } from './HeadWeightCorrector.js'

/**
 * SolverDistanceChildTargeting
 * This works very similar to the normal distance + child solver
  * This adds extra logic to target ares in the arms and hips to help with assigning weights
 */
export default class SolverDistanceChildTargeting extends AbstractAutoSkinSolver {
  // Head weight correction properties
  private use_head_weight_correction: boolean = false
  private preview_plane_height: number = 1.4

  public calculate_indexes_and_weights (): number[][] {
    // There can be multiple objects that need skinning, so
    // this will make sure we have a clean slate by putting it in function
    const skin_indices: number[] = []
    const skin_weights: number[] = []

    // create cached items for all the vertex calculations later
    // this.cached_bone_positions = this.get_bone_master_data().map(b => Utility.world_position_from_object(b))
    this.cached_median_child_bone_positions = this.get_bone_master_data().map(b => this.midpoint_to_child(b))

    this.get_bone_master_data().forEach((b, idx) => this.bone_object_to_index.set(b, idx))
    this.distance_to_bottom_of_hip = this.calculate_distance_to_bottom_of_hip()

    console.time('calculate_closest_bone_weights')
    this.calculate_median_bone_weights(skin_indices, skin_weights)
    this.smooth_bone_weight_boundaries(skin_indices, skin_weights)
    console.timeEnd('calculate_closest_bone_weights')

    if (this.show_debug) {
      this.debugging_scene_object.add(this.objects_to_show_for_debugging(skin_indices))
      this.points_to_show_for_debugging.length = 0 // Clear the points after adding to the scene
    }

    // find out if any weights aren't adding up to 1.0
    // go through each incorrect weight influence. Fill in the 0.00 weight with the remaining weght so
    // all the weights add up to 1.0
    this.normalize_weights_with_incorrect_vertices(skin_weights)

    // Apply head weight correction if enabled
    if (this.use_head_weight_correction) {
      const head_weight_corrector = new HeadWeightCorrector(
        this.geometry,
        this.get_bone_master_data(),
        this.preview_plane_height
      )
      console.log('applying the head weight correction...')
      head_weight_corrector.apply_head_weight_correction(skin_indices, skin_weights)
    }

    console.log('do we have any leftover incorrect weights ', this.find_vertices_with_incorrect_weight_sum(skin_weights))

    return [skin_indices, skin_weights]
  }

  /**
   * Enable or disable head weight correction
   */
  public set_head_weight_correction_enabled (enabled: boolean): void {
    this.use_head_weight_correction = enabled
  }

  /**
   * Set the preview plane height for head weight correction
   */
  public set_preview_plane_height (height: number): void {
    this.preview_plane_height = height
  }

  /**
   * Returns an array of vertex indices whose weights do not sum to 1.0 (within a small epsilon).
   */
  private find_vertices_with_incorrect_weight_sum (skin_weights: number[]): number[] {
    const epsilon: number = 1e-4 // very small number to signify close enough to 0
    const incorrect_vertices: number[] = []
    const vertex_count = this.geometry_vertex_count()
    for (let i = 0; i < vertex_count; i++) {
      const offset = i * 4
      const sum = skin_weights[offset] + skin_weights[offset + 1] + skin_weights[offset + 2] + skin_weights[offset + 3]
      if (Math.abs(sum - 1.0) > epsilon) {
        incorrect_vertices.push(i)
      }
    }
    return incorrect_vertices
  }

  private readonly points_to_show_for_debugging: Vector3[] = []

  // cache objects to help speed up calculations
  // private cached_bone_positions: Vector3[] = [] // bone positions don't change
  private cached_median_child_bone_positions: Vector3[] = [] // position between bone and its child

  private readonly bone_object_to_index = new Map<Bone, number>() // map to get the index of the bone object
  private distance_to_bottom_of_hip: number = 0 // distance to the bottom of the hip bone

  // each index will be a bone index. the value will be a list of vertex indices that belong to that bone
  private readonly bones_vertex_segmentation: number[][] = []

  /**
   * Builds a spatial adjacency map for the mesh vertices using geometry's index (faces).
   * Returns an array of Sets, where each Set contains the indices of neighboring vertices.
   * This is important for operations like smoothing
   */
  private build_vertex_adjacency (): Array<Set<number>> {
    const vertex_count = this.geometry_vertex_count()

    // Initialize adjacency list
    // Each vertex will have a set of neighboring vertices
    const adjacency: Array<Set<number>> = Array.from({ length: vertex_count }, () => new Set<number>())

    const index_attribute: BufferAttribute | null = this.geometry.index // This contains list of a faces
    if (index_attribute === null) return adjacency // No faces, fallback to empty adjacency

    const indices = index_attribute.array
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i]; const b = indices[i + 1]; const c = indices[i + 2]
      adjacency[a].add(b); adjacency[a].add(c)
      adjacency[b].add(a); adjacency[b].add(c)
      adjacency[c].add(a); adjacency[c].add(b)
    }
    return adjacency
  }

  /**
     * Smooths skin weights at the boundary between bone influences using spatial adjacency.
     * When a joint change occurs, it is a sharp transition since first skinning pass only assigns 100% to one bone.
     * For each vertex, if a (spatial) neighbor has a different primary bone and both have 100% influence,
     * blend their weights to 50/50 between the two bones.
     */
  private smooth_bone_weight_boundaries (skin_indices: number[], skin_weights: number[]): void {
    const vertex_count = this.geometry_vertex_count()
    const adjacency = this.build_vertex_adjacency()
    const visited = new Set<string>()

    // Build a map of shared vertices (those with identical positions)
    const position_to_indices = new Map<string, number[]>()
    for (let i = 0; i < vertex_count; i++) {
      const pos = this.geometry.attributes.position
      const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i)
      const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`
      if (!position_to_indices.has(key)) position_to_indices.set(key, [])
      position_to_indices.get(key)!.push(i)
    }

    // Iterate through each vertex and its neighbors
    // looking for rigid 100% weight vertices that are next to other rigid 100% weight vertices
    // and blend their weights to 50/50 between the two bones
    // poor man's blending by the joint areas so it is less rigid
    for (let i = 0; i < vertex_count; i++) {
      const offsetA = i * 4
      const boneA = skin_indices[offsetA]
      const weightA = skin_weights[offsetA]
      if (weightA !== 1.0) continue
      for (const j of adjacency[i]) {
        const offsetB = j * 4
        const boneB = skin_indices[offsetB]
        const weightB = skin_weights[offsetB]
        if (boneA === boneB || weightB !== 1.0) continue
        // Only blend once per pair
        const key = i < j ? `${i},${j}` : `${j},${i}`
        if (visited.has(key)) continue
        visited.add(key)

        // Find all shared vertices for i and j
        const posA = this.geometry.attributes.position
        const xA = posA.getX(i); const yA = posA.getY(i); const zA = posA.getZ(i)
        const shared_keyA = `${xA.toFixed(6)},${yA.toFixed(6)},${zA.toFixed(6)}`
        const sharedA = position_to_indices.get(shared_keyA) || [i]

        const xB = posA.getX(j); const yB = posA.getY(j); const zB = posA.getZ(j)
        const shared_keyB = `${xB.toFixed(6)},${yB.toFixed(6)},${zB.toFixed(6)}`
        const sharedB = position_to_indices.get(shared_keyB) || [j]

        // Blend all shared vertices for i and j
        for (const idx of sharedA) {
          const off = idx * 4
          skin_indices[off + 0] = boneA
          skin_indices[off + 1] = boneB
          skin_weights[off + 0] = 0.5
          skin_weights[off + 1] = 0.5
          skin_indices[off + 2] = 0
          skin_indices[off + 3] = 0
          skin_weights[off + 2] = 0
          skin_weights[off + 3] = 0
        }
        for (const idx of sharedB) {
          const off = idx * 4
          skin_indices[off + 0] = boneB
          skin_indices[off + 1] = boneA
          skin_weights[off + 0] = 0.5
          skin_weights[off + 1] = 0.5
          skin_indices[off + 2] = 0
          skin_indices[off + 3] = 0
          skin_weights[off + 2] = 0
          skin_weights[off + 3] = 0
        }
      }
    }
  }

  private normalize_weights_with_incorrect_vertices (all_skin_weights: number[]): void {
    const vertices_that_do_not_have_influences_adding_to_one: number[] = this.find_vertices_with_incorrect_weight_sum(all_skin_weights)
    for (const vertex_index of vertices_that_do_not_have_influences_adding_to_one) {
      const offset = vertex_index * 4

      // if the weight is 0.00, then we can assign the remaining weights to the other bones
      const weights = [
        all_skin_weights[offset],
        all_skin_weights[offset + 1],
        all_skin_weights[offset + 2],
        all_skin_weights[offset + 3]
      ]
      const weight_sum = weights.reduce((a, b) => a + b, 0)
      const weight_per_index: number = (1 - weight_sum) / 3.0
      console.log(weight_per_index)

      // assign the weights all at once
      for (let i = 0; i < 4; i++) {
        if (weights[i] !== 0) {
          all_skin_weights[offset + i] += weight_per_index
        }
      }
    }
  }

  private midpoint_to_child (bone: Bone): Vector3 {
    const bone_position = Utility.world_position_from_object(bone)
    if (bone.children.length === 0) {
      return bone_position.clone()
    }
    // Assume first child is the relevant one
    const child = bone.children[0] as Bone
    const child_position = Utility.world_position_from_object(child)
    return new Vector3().lerpVectors(bone_position, child_position, 0.5)
  }

  // every vertex checks to see if it is below the hips area,
  // so do this calculation once and cache it for the lookup later
  private calculate_distance_to_bottom_of_hip (): number {
    const hip_bone_object: Bone | undefined = this.get_bone_master_data().find(b => {
      const name = b.name.toLowerCase()
      return name.includes('hips') || name.includes('pelvis')
    })
    if (hip_bone_object === undefined) {
      throw new Error('Hip bone not found')
    }
    const intesection_point: Vector3 | null = this.cast_intersection_ray_down_from_bone(hip_bone_object)

    // get the distance from the bone point to the intersection point
    const bone_index = this.get_bone_master_data().findIndex(b => b === hip_bone_object)
    const bone_position: Vector3 = this.cached_median_child_bone_positions[bone_index]

    let distance_to_bottom: number = intesection_point?.distanceTo(bone_position) ?? 0
    distance_to_bottom *= 1.1 // buffer zone to make sure to include vertices at intersection

    return distance_to_bottom
  }

  /**
   * This function will assign the closest bone to each vertex
   * It returns void, but it will modify the skin_indices and skin_weights arrays
   * This function mutates the arrays passed in as arguments
   * @param skin_indices
   * @param skin_weights
   */
  private calculate_median_bone_weights (skin_indices: number[], skin_weights: number[]): void {
    for (let i = 0; i < this.geometry_vertex_count(); i++) {
      const vertex_position: Vector3 = new Vector3().fromBufferAttribute(this.geometry.attributes.position, i)
      let closest_bone_distance: number = 1000 // arbitrary large number to start with
      let closest_bone_index: number = 0

      this.get_bone_master_data().forEach((bone, idx) => {
        // The root bone is only for global transform changes, so we won't assign it to any vertices
        if (bone.name === 'root') {
          return // skip the root bone and continue to the next bone
        }

        // hip bones should have custom logic for distance. If the distance is too far away we should ignore it
        // This will help with hips when left/right legs could be closer than knee bones
        if (this.skeleton_type === SkeletonType.Human &&
          (bone.name.includes('hips') || bone.name.includes('pelvis'))) {
          // if the intersection point is lower than the vertex position, that means the vertex is below
          // the hips area, and is part of the left or right leg...ignore that result
          if (this.distance_to_bottom_of_hip !== null && this.distance_to_bottom_of_hip < vertex_position.y) {
            return// this vertex is below our crotch area, so it cannot be part of our hips
          }
        }

        const distance: number = this.cached_median_child_bone_positions[idx].distanceTo(vertex_position)
        if (distance < closest_bone_distance) {
          // closest_bone = bone.bone_object
          closest_bone_distance = distance
          closest_bone_index = idx
        }
      })

      this.bones_vertex_segmentation[closest_bone_index] ??= [] // Initialize the array if it doesn't exist
      this.bones_vertex_segmentation[closest_bone_index].push(i)

      // assign to final weights. closest bone is always 100% weight
      skin_indices.push(closest_bone_index, 0, 0, 0)
      skin_weights.push(1.0, 0, 0, 0)
    }
  }

  private objects_to_show_for_debugging (skin_indices: number[]): Group {
    const weight_painted_mesh = Generators.create_weight_painted_mesh(skin_indices, this.geometry)
    const wireframe_mesh = Generators.create_wireframe_mesh_from_geometry(this.geometry)

    const group = new Group()
    group.add(weight_painted_mesh)
    group.add(wireframe_mesh)
    group.name = 'DebuggingNormalGroup'

    return group
  }

  private cast_intersection_ray_down_from_bone (bone: Bone): Vector3 | null {
    const raycaster = new Raycaster()

    // Set the ray's origin to the bone's world position
    const bone_index = this.get_bone_master_data().findIndex(b => b === bone)
    const bone_position = this.cached_median_child_bone_positions[bone_index]

    // Direction is straight down to find the pevlis "gap"
    raycaster.set(bone_position, new Vector3(0, -1, 0))

    // Create a temporary mesh from this.geometry for raycasting
    const temp_mesh = new Mesh(this.geometry, new MeshBasicMaterial())
    temp_mesh.material.side = DoubleSide // DoubleSide is a THREE.js constant

    // Perform the intersection test
    const recursive_check_child_objects: boolean = false
    const intersections = raycaster.intersectObject(temp_mesh, recursive_check_child_objects)

    if (intersections.length > 0) {
      // Return the position of the first intersection
      return intersections[0].point
    }

    // Return null if no intersection is found
    return null
  }
}
