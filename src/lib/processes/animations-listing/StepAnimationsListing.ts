import { UI } from '../../UI.ts'
import { AnimationPlayer } from './AnimationPlayer.ts'

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import {
  type AnimationClip, AnimationMixer, type SkinnedMesh, type AnimationAction
} from 'three'

import { AnimationUtility } from './AnimationUtility.ts'

import { SkeletonType } from '../../enums/SkeletonType.ts'
import { Utility } from '../../Utilities.ts'
import { type ThemeManager } from '../../ThemeManager.ts'
import { AnimationSearch } from './AnimationSearch.ts'
import { type TransformedAnimationClipPair } from './interfaces/TransformedAnimationClipPair.ts'


// Note: EventTarget is a built-ininterface and do not need to import it
export class StepAnimationsListing extends EventTarget {
  private readonly theme_manager: ThemeManager
  private readonly ui: UI
  private readonly animation_player: AnimationPlayer
  private animation_clips_loaded: TransformedAnimationClipPair[] = []
  private gltf_animation_loader: GLTFLoader = new GLTFLoader()

  private animation_mixer: AnimationMixer = new AnimationMixer()
  private skinned_meshes_to_animate: SkinnedMesh[] = []
  private current_playing_index: number = 0
  private skeleton_type: SkeletonType = SkeletonType.Human

  private animations_file_path: string = 'animations/'

  // retrieved from load skeleton step
  // we will use this to scale all position animation keyframes (uniform scale)
  private skeleton_scale: number = 1.0

  private _added_event_listeners: boolean = false

  // enable status for mirroring animations
  public mirror_animations_enabled: boolean = false

  // Animation search functionality
  public animation_search: AnimationSearch | null = null

  public set_animations_file_path (path: string): void {
    this.animations_file_path = path
  }

  /**
   * The amount to raise the arms.
   */
  private warp_arm_amount: number = 0.0

  private has_added_event_listeners: boolean = false

  constructor (theme_manager: ThemeManager) {
    super()
    this.ui = UI.getInstance()
    this.animation_player = new AnimationPlayer()
    this.theme_manager = theme_manager
  }

  public begin (skeleton_type: SkeletonType, skeleton_scale: number): void {
    this.skeleton_scale = skeleton_scale

    if (this.ui.dom_current_step_index != null) {
      this.ui.dom_current_step_index.innerHTML = '4'
    }

    if (this.ui.dom_current_step_element != null) {
      this.ui.dom_current_step_element.innerHTML = 'Test animations'
    }

    if (this.ui.dom_skinned_mesh_tools != null) {
      this.ui.dom_skinned_mesh_tools.style.display = 'flex'
    }

    if (this.ui.dom_skinned_mesh_animation_tools != null) {
      this.ui.dom_skinned_mesh_animation_tools.style.display = 'flex'
    }

    this.reset_step_data()

    this.skeleton_type = skeleton_type

    // if we are navigating back to this step, we don't want to add the event listeners again
    if (!this._added_event_listeners) {
      this.add_event_listeners()
      this._added_event_listeners = true
    }

    this.update_download_button_enabled()
  }

  public reset_step_data (): void {
    // reset previous state if we are re-entering this step
    // this will happen if we are reskinning the mesh after changes
    this.animation_clips_loaded = []
    this.skinned_meshes_to_animate = []
    this.animation_mixer = new AnimationMixer()
    this.current_playing_index = 0
    this.animation_player.clear_animation()
  }

  public mixer (): AnimationMixer {
    return this.animation_mixer
  }

  // setup in the bootstrap.ts file and only called if we are actively
  // on this step
  public frame_change (delta_time: number): void {
    this.mixer().update(delta_time)
    this.animation_player.update(delta_time)
  }

  /**
   * Returns a list of all of the currently-displayed animation clips. 
   */
  public animation_clips (): AnimationClip[] {
    return this.animation_clips_loaded.map(clip => clip.display_animation_clip)
  }

  public load_and_apply_default_animation_to_skinned_mesh (final_skinned_meshes: SkinnedMesh[]): void {
    this.skinned_meshes_to_animate = final_skinned_meshes

    let animations_to_load_filepaths: string[] = []
    switch (this.skeleton_type) {
      case SkeletonType.Human:
        animations_to_load_filepaths = [this.animations_file_path + 'human-base-animations.glb', 
          this.animations_file_path + 'human-addon-animations.glb']
        break
      case SkeletonType.Quadraped:
        animations_to_load_filepaths = [this.animations_file_path + 'quad-creature-animations.glb']
        break
      case SkeletonType.Bird:
        animations_to_load_filepaths = [this.animations_file_path + 'bird-animations.glb']
        break
      case SkeletonType.Dragon:
        animations_to_load_filepaths = [this.animations_file_path + 'dragon-animations.glb']
        break
      default:
        console.error('Unknown skeleton type for loading animations. Add GLB file to animation listing process')
    }

    // if we call this load animations externally (like marketing page)
    // we might need to modify the location paths for these to reference the correct part


    this.gltf_animation_loader = new GLTFLoader()

    // The GLTF loader doesn't return a promise, so we need some way
    // to know when all the animations are loaded
    let remaining_loads: number = animations_to_load_filepaths.length

    this.animation_clips_loaded = [] // reset the animation clips loaded
    // Create an animation mixer to do the playback. Play the first by default
    this.animation_mixer = new AnimationMixer()

    animations_to_load_filepaths.forEach((filepath) => {
      this.gltf_animation_loader.load(filepath, (gltf: any) => {
        // load the animation clips into a new array
        // then, remove the animation position keyframes. That will mess up the skinning
        // process since we will be offsetting and moving the bone root positions
        const cloned_anims: AnimationClip[] = AnimationUtility.deep_clone_animation_clips(gltf.animations)

        // only keep position tracks
        // this mutates the cloned_anims, so no need for returning anything
        AnimationUtility.clean_track_data(cloned_anims, true)

        // apply scaling to position keyframes if we scaled skeleton up or down
        AnimationUtility.apply_skeleton_scale_to_position_keyframes(cloned_anims, this.skeleton_scale)

        // we did all the processing needed, so add them
        // to the full list of animation clips
        this.animation_clips_loaded.push(...cloned_anims.map(clip => ({
          original_animation_clip: clip,
          display_animation_clip: AnimationUtility.deep_clone_animation_clip(clip)
        })))

        remaining_loads--
        if (remaining_loads === 0) {
          this.onAllAnimationsLoaded()
        }
      })
    })
  }

  private onAllAnimationsLoaded (): void {
    // sort all animation names alphabetically
    this.animation_clips_loaded.sort((a: TransformedAnimationClipPair, b: TransformedAnimationClipPair) => {
      if (a.display_animation_clip.name < b.display_animation_clip.name) { return -1 }
      if (a.display_animation_clip.name > b.display_animation_clip.name) { return 1 }
      return 0
    })

    // create user interface with all available animation clips
    this.build_animation_clip_ui(
      this.animation_clips_loaded.map(clip => clip.display_animation_clip),
      this.theme_manager
    )

    // add event listener to listem for checkbox changes when we change
    // the amount of animations to export
    this.animation_search?.addEventListener('export-options-changed', () => {
      // update the count for the download button
      this.ui.dom_animation_count.innerHTML = this.animation_search?.get_selected_animation_indices().length.toString() ?? '0'
    })

    // add event listener to listen for filtered animations listing
    this.update_filtered_animation_listing_ui()
    this.animation_search?.addEventListener('filtered-animations-listing', () => {
      this.update_filtered_animation_listing_ui()
    })

    this.play_animation(0) // play the first animation by default
  }

  private update_filtered_animation_listing_ui (): void {
    const animation_length_string: string = this.animation_search?.filtered_animations().length.toString() ?? '0'
    this.ui.dom_animations_listing_count.innerHTML = animation_length_string + ' animations'
  }

 
  /**
   * Rebuilds all of the warped animations by applying the specified warps.
   */
  private rebuild_warped_animations (): void {
    // Reset all of the warped clips to the corresponding original clip.
    this.animation_clips_loaded.forEach((warped_clip: TransformedAnimationClipPair) => {
      warped_clip.display_animation_clip = AnimationUtility.deep_clone_animation_clip(warped_clip.original_animation_clip)
    })
    /// Apply the arm extension warp:
    AnimationUtility.apply_arm_extension_warp(this.animation_clips_loaded, this.warp_arm_amount)
  }

  private play_animation (index: number = 0): void {
    this.current_playing_index = index

    // animation mixer has internal cache with animations. doing this helps clear it
    // otherwise modifications like arm extension will not update
    this.animation_mixer = new AnimationMixer()

    const all_animation_actions: AnimationAction[] = []

    this.skinned_meshes_to_animate.forEach((skinned_mesh) => {
      const clip_to_play: AnimationClip = this.animation_clips_loaded[this.current_playing_index].display_animation_clip
      const anim_action: AnimationAction = this.animation_mixer.clipAction(clip_to_play, skinned_mesh)

      anim_action.stop()
      anim_action.play()

      // Collect all animation actions for the animation player
      all_animation_actions.push(anim_action)
    })

    // Update the animation player with the current animation and all actions
    if (all_animation_actions.length > 0) {
      const clip_to_play: AnimationClip = this.animation_clips_loaded[this.current_playing_index].display_animation_clip
      this.animation_player.set_animation(clip_to_play, all_animation_actions)
    }
  }

  private update_download_button_enabled (): void {
    // see if any of the "export" checkboxes are active. if not we need to disable the "Download" button
    const animation_checkboxes = this.get_animated_selected_elements()
    const is_any_checkbox_checked: boolean = Array.from(animation_checkboxes).some((checkbox) => {
      return checkbox.checked === true
    })
    this.ui.dom_export_button.disabled = !is_any_checkbox_checked
  }

  private add_event_listeners (): void {
    // make sure to only add the event listeners once
    // this could be potentially called multiple times when going back and forth
    // between editing skeleton and this step
    if (this.has_added_event_listeners) {
      console.info('Event listeners already added to animation step. Skipping.')
      return
    }

    // event listener for animation clip list with changing the current animation
    if (this.ui.dom_animation_clip_list != null) {
      this.ui.dom_animation_clip_list.addEventListener('click', (event) => {
        this.update_download_button_enabled()

        if ((event.target != null) && event.target.tagName === 'BUTTON') {
          const animation_index: number = event.target.getAttribute('data-index')
          this.play_animation(animation_index)
        }
      })
    }

    // A-Pose arm extension event listener
    this.ui.dom_extend_arm_numeric_input?.addEventListener('input', (event) => {
      const extend_arm_value: number = Utility.parse_input_number(this.ui.dom_extend_arm_numeric_input?.value)
      if (this.ui.dom_extend_arm_range_input !== null) {
        // Copy the value from the numeric onto the slider input.
        this.ui.dom_extend_arm_range_input.value = extend_arm_value.toString()
      }
      this.warp_arm_amount = extend_arm_value

      this.rebuild_warped_animations()
      this.play_animation(this.current_playing_index)
    })
    this.ui.dom_extend_arm_range_input?.addEventListener('input', (event) => {
      const extend_arm_value: number = Utility.parse_input_number(this.ui.dom_extend_arm_range_input?.value)
      if (this.ui.dom_extend_arm_numeric_input !== null) {
        // Copy the value from the slider onto the numeric input.
        this.ui.dom_extend_arm_numeric_input.value = extend_arm_value.toString()
      }
      this.warp_arm_amount = extend_arm_value

      this.rebuild_warped_animations()
      this.play_animation(this.current_playing_index)
    })

    // check for changes to mirror animations checkbox
    this.ui.dom_mirror_animations_checkbox?.addEventListener('change', (event) => {
      const is_checked: boolean = this.ui.dom_mirror_animations_checkbox?.checked ?? false
      this.mirror_animations_enabled = is_checked
    })

    // helps ensure we don't add event listeners multiple times
    this.has_added_event_listeners = true
  }

  public build_animation_clip_ui (animation_clips_to_load: AnimationClip[], theme_manager: ThemeManager): void {
    // Initialize AnimationSearch if not already done
    // we could switch skeleton types using navigation, so need to re-create in case this happens
    this.animation_search = new AnimationSearch('animation-filter', 'animations-items', theme_manager, this.skeleton_type)

    // Use the animation search class to handle the UI
    this.animation_search.initialize_animations(animation_clips_to_load)
  }

  public get_animated_selected_elements (): NodeListOf<Element> {
    // this needs to be called ad-hoc as selections might change
    return document.querySelectorAll('#animations-items input[type="checkbox"]')
  }

  public get_animation_indices_to_export (): number[] {
    if (this.animation_search === null) {
      return []
    }
    return this.animation_search.get_selected_animation_indices()
  }
}
