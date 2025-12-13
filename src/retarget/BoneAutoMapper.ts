/**
 * BoneAutoMapper - Handles automatic bone mapping between source and target skeletons
 * Uses string comparison and pattern matching to suggest bone mappings
 */
export class BoneAutoMapper {
  /**
   * Attempts to automatically map source bones to target bones
   * @param source_bone_names - Array of bone names from the source skeleton
   * @param target_bone_names - Array of bone names from the target skeleton
   * @returns Map of target bone name -> source bone name
   */
  public static auto_map_bones (source_bone_names: string[], target_bone_names: string[]): Map<string, string> {
    const mappings = new Map<string, string>()

    for (const target_bone of target_bone_names) {
      const best_match = this.find_best_match(target_bone, source_bone_names)
      if (best_match !== null) {
        mappings.set(target_bone, best_match)
      }
    }

    return mappings
  }

  /**
   * Find the best matching source bone for a given target bone
   * @param target_bone - Target bone name to match
   * @param source_bones - Array of source bone names to search
   * @returns Best matching source bone name, or null if no good match found
   */
  private static find_best_match (target_bone: string, source_bones: string[]): string | null {
    const normalized_target = this.normalize_bone_name(target_bone)
    let best_match: string | null = null
    let best_score = 0

    for (const source_bone of source_bones) {
      const normalized_source = this.normalize_bone_name(source_bone)
      const score = this.calculate_similarity(normalized_target, normalized_source)

      // Require a minimum threshold for matching
      if (score > best_score && score >= 0.6) {
        best_score = score
        best_match = source_bone
      }
    }

    return best_match
  }

  /**
   * Normalize bone names for comparison by:
   * - Converting to lowercase
   * - Removing common prefixes/suffixes
   * - Standardizing separators
   */
  private static normalize_bone_name (bone_name: string): string {
    let normalized = bone_name.toLowerCase()

    // Replace various separators with underscores
    normalized = normalized.replace(/[-.\s]/g, '_')

    // Remove common prefixes
    normalized = normalized.replace(/^(mixamorig|mixamorig_|rig_|bone_|jnt_|joint_)/i, '')

    // Standardize left/right notation
    normalized = normalized.replace(/\bleft\b/g, 'l')
    normalized = normalized.replace(/\bright\b/g, 'r')
    normalized = normalized.replace(/^l_/g, 'left_')
    normalized = normalized.replace(/^r_/g, 'right_')
    normalized = normalized.replace(/_l$/g, '_left')
    normalized = normalized.replace(/_r$/g, '_right')

    return normalized
  }

  /**
   * Calculate similarity score between two normalized bone names
   * Uses a combination of exact match, contains, and Levenshtein distance
   */
  private static calculate_similarity (name1: string, name2: string): number {
    // Exact match
    if (name1 === name2) {
      return 1.0
    }

    // One contains the other
    if (name1.includes(name2) || name2.includes(name1)) {
      const longer = Math.max(name1.length, name2.length)
      const shorter = Math.min(name1.length, name2.length)
      return 0.8 + (shorter / longer) * 0.2
    }

    // Use Levenshtein distance for fuzzy matching
    const distance = this.levenshtein_distance(name1, name2)
    const max_length = Math.max(name1.length, name2.length)
    const similarity = 1 - (distance / max_length)

    return similarity
  }

  /**
   * Calculate Levenshtein distance between two strings
   * (minimum number of single-character edits required to change one string into another)
   */
  private static levenshtein_distance (str1: string, str2: string): number {
    const len1 = str1.length
    const len2 = str2.length
    const matrix: number[][] = []

    // Initialize matrix
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j
    }

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost // substitution
        )
      }
    }

    return matrix[len1][len2]
  }
}
