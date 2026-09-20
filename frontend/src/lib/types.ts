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
  logging_mode: LoggingMode
}

export type LoggingMode = 'weight_reps' | 'bodyweight_reps' | 'weighted_bodyweight' | 'assisted_bodyweight' | 'duration'
export type SetType = 'warmup' | 'working' | 'failure' | 'drop'

export type Workout = {
  id: string
  user_id: string
  name: string
  started_at: string
  completed_at: string | null
  notes: string | null
  revision: number
  duration_seconds: number | null
  paused_at: string | null
  accumulated_pause_seconds: number
  source: string
  external_id: string | null
  import_hash: string | null
}

export type WorkoutExercise = {
  id: string
  workout_id: string
  exercise_id: string
  exercise_order: number
  notes: string | null
  logging_mode: LoggingMode
  target_sets: number | null
  target_reps: string | null
  target_rpe: number | null
  rest_seconds: number | null
  timer_enabled: boolean
  session_notes: string | null
  superset_group: string | null
  source_name: string | null
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
  set_type: SetType
  duration_seconds: number | null
  assistance_weight: number | null
  bodyweight: number | null
  rpe: number | null
  operation_id: string | null
}

export type Routine = {
  id: string
  user_id: string
  name: string
  notes: string | null
  created_at: string
  updated_at: string
}

export type RoutineExercise = {
  id: string
  routine_id: string
  exercise_id: string
  exercise_order: number
  target_sets: number | null
  target_reps: string | null
  notes: string | null
  created_at: string
  target_rpe: number | null
  rest_seconds: number | null
  timer_enabled: boolean
  superset_group: string | null
}

export type BodyMeasurement = {
  id: string
  user_id: string
  measured_at: string
  bodyweight: number | null
  neck: number | null
  shoulders: number | null
  chest: number | null
  waist: number | null
  hips: number | null
  left_arm: number | null
  right_arm: number | null
  left_thigh: number | null
  right_thigh: number | null
  left_calf: number | null
  right_calf: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type ProgressPhoto = {
  id: string
  user_id: string
  measured_at: string
  storage_path: string
  caption: string | null
  created_at: string
}

export type ExerciseSessionEvidence = {
  workoutId: string
  date: string
  sets: WorkoutSet[]
}
