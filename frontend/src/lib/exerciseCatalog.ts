import type { SupabaseClient } from '@supabase/supabase-js'
import type { Exercise } from './types'

const EXERCISE_COLUMNS =
  'id, external_id, source, user_id, name, normalized_name, primary_muscle, secondary_muscles, body_part, equipment, movement_category, instructions, image_url, animation_url, thumbnail_url, is_custom, is_active, logging_mode'
const PAGE_SIZE = 1000

/** Load the full visible catalog; a later-page failure must not return partial data. */
export async function loadExerciseCatalog(client: SupabaseClient) {
  const exercises: Exercise[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from('exercises')
      .select(EXERCISE_COLUMNS)
      .eq('is_active', true)
      .order('name')
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) return { data: null, error }
    exercises.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return { data: exercises, error: null }
  }
}
