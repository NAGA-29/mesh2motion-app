import { Group, Mesh, PlaneGeometry, MeshBasicMaterial, type Scene, DoubleSide } from 'three'

const preview_plane_group_name: string = 'preview_plane_group'

/**
 * Add a preview 3D plane to the scene at the origin
 * The plane can be adjusted in height for later use in the skinning process
 * @param root The main scene
 * @param height The height position of the plane (Y coordinate)
 * @param size The size of the plane (width and depth)
 * @returns The created plane mesh
 */
export function add_preview_plane (
  root: Scene,
  height: number = 0.0,
  size: number = 5.0
): Mesh {
  // Remove existing preview plane if it exists
  remove_preview_plane(root)

  // Create new preview plane group
  const preview_plane_group = new Group()
  preview_plane_group.name = preview_plane_group_name
  
  // Store current plane info for future reference
  preview_plane_group.userData.height = height
  preview_plane_group.userData.size = size

  // Create plane geometry and material
  const geometry = new PlaneGeometry(size, size)
  const material = new MeshBasicMaterial({
    color: 0x00ff00, // Green color for visibility
    transparent: true,
    opacity: 0.3,
    side: DoubleSide, // Make it visible from both sides
    wireframe: false
  })

  // Create the plane mesh
  const plane_mesh = new Mesh(geometry, material)
  plane_mesh.name = 'preview_plane'
  
  // Position the plane at the specified height
  plane_mesh.position.set(0, height, 0)
  
  // Rotate the plane to be horizontal (lying flat)
  plane_mesh.rotation.x = -Math.PI / 2

  // Add plane to the group and group to scene
  preview_plane_group.add(plane_mesh)
  root.add(preview_plane_group)

  return plane_mesh
}

/**
 * Update the height of the existing preview plane
 * @param root The main scene
 * @param height The new height position for the plane
 */
export function update_preview_plane_height (root: Scene, height: number): void {
  const preview_plane_group = root.getObjectByName(preview_plane_group_name) as Group | undefined
  
  if (preview_plane_group !== undefined) {
    const plane_mesh = preview_plane_group.getObjectByName('preview_plane') as Mesh
    if (plane_mesh !== undefined) {
      plane_mesh.position.y = height
      preview_plane_group.userData.height = height
    }
  }
}

/**
 * Update the size of the existing preview plane
 * @param root The main scene
 * @param size The new size for the plane
 */
export function update_preview_plane_size (root: Scene, size: number): void {
  const preview_plane_group = root.getObjectByName(preview_plane_group_name) as Group | undefined
  
  if (preview_plane_group !== undefined) {
    const plane_mesh = preview_plane_group.getObjectByName('preview_plane') as Mesh
    if (plane_mesh !== undefined) {
      // Update the geometry with new size
      const new_geometry = new PlaneGeometry(size, size)
      plane_mesh.geometry.dispose() // Clean up old geometry
      plane_mesh.geometry = new_geometry
      preview_plane_group.userData.size = size
    }
  }
}

/**
 * Get the current height of the preview plane
 * @param root The main scene
 * @returns The current height of the plane, or null if no plane exists
 */
export function get_preview_plane_height (root: Scene): number | null {
  const preview_plane_group = root.getObjectByName(preview_plane_group_name) as Group | undefined
  
  if (preview_plane_group !== undefined) {
    return preview_plane_group.userData.height ?? 0.0
  }
  
  return null
}

/**
 * Get the current size of the preview plane
 * @param root The main scene
 * @returns The current size of the plane, or null if no plane exists
 */
export function get_preview_plane_size (root: Scene): number | null {
  const preview_plane_group = root.getObjectByName(preview_plane_group_name) as Group | undefined
  
  if (preview_plane_group !== undefined) {
    return preview_plane_group.userData.size ?? 5.0
  }
  
  return null
}

/**
 * Check if preview plane exists in the scene
 * @param root The main scene
 * @returns True if preview plane exists, false otherwise
 */
export function preview_plane_exists (root: Scene): boolean {
  const preview_plane_group = root.getObjectByName(preview_plane_group_name)
  return preview_plane_group !== undefined
}

/**
 * Remove the preview plane from the scene
 * @param root The main scene
 */
export function remove_preview_plane (root: Scene): void {
  const preview_plane_group = root.getObjectByName(preview_plane_group_name)
  if (preview_plane_group?.parent != null) {
    // Clean up geometry and material before removing
    const plane_mesh = preview_plane_group.getObjectByName('preview_plane') as Mesh
    if (plane_mesh !== undefined) {
      plane_mesh.geometry.dispose()
      if (plane_mesh.material instanceof MeshBasicMaterial) {
        plane_mesh.material.dispose()
      }
    }
    
    preview_plane_group.parent.remove(preview_plane_group)
  }
}
