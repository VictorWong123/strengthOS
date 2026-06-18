export type Exercise = {
  id: string
  external_id: string
  source: string
  user_id: string | null
  name: string
  normalized_name: string
  primary_muscle: string | null
  secondary_muscles: string[]
  body_part: string | null
  equipment: string | null
  movement_category: string | null
  instructions: string[]
  image_url: string | null
  animation_url: string | null
  thumbnail_url: string | null
  is_custom: boolean
  is_active: boolean
}

export type Workout = {
  id: string
  user_id: string
  name: string
  started_at: string
  completed_at: string | null
  notes: string | null
}

export type WorkoutExercise = {
  id: string
  workout_id: string
  exercise_id: string
  exercise_order: number
}

export type WorkoutSet = {
  id: string
  workout_exercise_id: string
  set_order: number
  reps: number | null
  weight: number | null
  is_completed: boolean
  notes: string | null
  completed_at: string | null
}

export type Routine = {
  id: string
  user_id: string
  name: string
  notes: string | null
}
