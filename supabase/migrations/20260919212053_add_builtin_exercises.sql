-- App-owned catalog additions. Provider sync only upserts its own source.
-- Deploy frontend/public/exercises assets before applying this migration.
insert into public.exercises (
  source, external_id, name, normalized_name, primary_muscle, secondary_muscles,
  body_part, equipment, movement_category, instructions, image_url, thumbnail_url
)
values
  (
    'strengthos', 'plank', 'Plank', 'plank', 'Abs', array['Glutes', 'Shoulders'],
    'Waist', 'Body Weight', 'Isometric',
    array[
      'Place your forearms on the floor with elbows beneath your shoulders. Extend your legs and support yourself on your toes.',
      'Brace your abdomen and glutes, keeping your head, hips, and heels aligned.',
      'Hold while breathing steadily. Lower your knees when you can no longer maintain your position.'
    ],
    '/exercises/plank.svg', '/exercises/plank.svg'
  ),
  (
    'strengthos', 'face-pull', 'Face Pull', 'face pull', 'Shoulders', array['Traps', 'Upper Back'],
    'Shoulders', 'Cable', 'Strength',
    array[
      'Attach a rope to a cable pulley around face height. Hold both ends and step back until the cable is taut with arms extended.',
      'Keep your torso steady and pull the rope toward your face, separating the ends beside your ears with elbows raised outward.',
      'Pause briefly, then extend your arms slowly to return. Use a weight you can control without leaning or jerking.'
    ],
    '/exercises/face-pull.svg', '/exercises/face-pull.svg'
  ),
  (
    'strengthos', 'dead-hang', 'Dead Hang', 'dead hang', 'Forearms', array['Lats', 'Shoulders'],
    'Lower Arms', 'Pull-up Bar', 'Isometric',
    array[
      'Grip a secure overhead bar with hands about shoulder-width apart and palms facing forward. Use a step if needed to reach it.',
      'Lift your feet clear of the floor and hang with straight arms. Keep a secure grip and avoid swinging.',
      'Breathe steadily, then place your feet back on the floor or step before releasing the bar.'
    ],
    '/exercises/dead-hang.svg', '/exercises/dead-hang.svg'
  )
on conflict (source, external_id) do update set
  name = excluded.name,
  normalized_name = excluded.normalized_name,
  primary_muscle = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  body_part = excluded.body_part,
  equipment = excluded.equipment,
  movement_category = excluded.movement_category,
  instructions = excluded.instructions,
  image_url = excluded.image_url,
  thumbnail_url = excluded.thumbnail_url,
  is_active = true;
