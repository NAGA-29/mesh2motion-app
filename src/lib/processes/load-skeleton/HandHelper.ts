import { type Object3D } from 'three'
import { HandSkeletonType } from '../../enums/SkeletonType'

export class HandHelper {
  public modify_hand_skeleton (armature: Object3D, hand_type: HandSkeletonType): void {
    const bones_to_remove: Object3D[] = []

    armature.traverse((child: Object3D) => {
      if (child.type === 'Bone') {
        const bone = child
        const bone_name: string = (bone.name ?? '').toLowerCase()

        // bone is not part of hand, we can just skip it
        // we also always keep the palm of the hand
        if (!this.is_hand_bone(bone_name) || this.is_palm_bone(bone_name)) {
          return
        }

        // remove bones on mesh based on hand type selected on UI
        switch (hand_type) {
          case HandSkeletonType.ThumbAndIndex:
            // Remove all finger bones except thumb and index finger
            if (!this.is_thumb_bone(bone_name) &&
                !this.is_middle_finger_bone(bone_name)) {
              bones_to_remove.push(bone)
            }

            // also remove tip bones since we want something simplified
            if (this.is_end_tip_bone(bone_name)) {
              bones_to_remove.push(bone)
            }
            break

          case HandSkeletonType.SimplifiedHand:
            // Remove all finger/feet tip bones (bones ending with 'tip')
            if (this.is_end_tip_bone(bone_name)) {
              bones_to_remove.push(bone)
            }
            break

          case HandSkeletonType.SingleBone:
            // Remove all non-middle finger bones, keeping one line of bones
            if (!this.is_middle_finger_bone(bone_name)) {
              bones_to_remove.push(bone)
              break
            }

            // remove all tip bones
            if (this.is_end_tip_bone(bone_name) || bone_name.includes('03') || bone_name.includes('04') || bone_name.includes('02')) {
              bones_to_remove.push(bone)
            }

            break
        }
      }
    })

    // Remove the identified bones
    bones_to_remove.forEach(bone => {
      if (bone.parent != null) {
        bone.parent.remove(bone)
      }
    })
  }

  private is_hand_bone (bone_name: string): boolean {
    const hand_patterns = ['hand', 'finger', 'thumb', 'index', 'middle', 'ring', 'pinky']
    return hand_patterns.some(pattern => bone_name.includes(pattern))
  }

  private is_palm_bone (bone_name: string): boolean {
    const hand_patterns = ['hand']
    return hand_patterns.some(pattern => bone_name.includes(pattern))
  }

  private is_thumb_bone (bone_name: string): boolean {
    return bone_name.includes('thumb')
  }

  private is_middle_finger_bone (bone_name: string): boolean {
    return bone_name.includes('middle')
  }

  // "tip" bones are the last bone at the end of the fingers and feet
  // they have the word 'tip' in the bone name
  private is_end_tip_bone (bone_name: string): boolean {
    // Look for bones that are finger tips - usually end with 'tip', 'end', or numbers like '3'
    return bone_name.toLowerCase().includes('leaf')
  }
}
