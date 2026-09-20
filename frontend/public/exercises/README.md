# Built-in exercise illustrations

These original SVG diagrams ship with strengthOS. They require no external media
API and are not copies of third-party exercise photographs or videos. The face
pull diagram shows the finish position; the plank and dead hang show static holds.

Form references used for the accompanying instructions:

- Plank: [ACE exercise library](https://www.acefitness.org/resources/everyone/exercise-library/equipment/no-equipment/?page=2)
- Face pull: [Muscle & Fitness](https://www.muscleandfitness.com/exercise/workouts/shoulder-exercises/face-pull/)
- Dead hang: [Physitrack](https://na.physitrack.com/home-exercise-video/dead-hang)

Deploy these assets before applying `20260919212053_add_builtin_exercises.sql`.
The migration upserts three shared catalog rows under the `strengthos` source,
preserving exercise IDs and existing workout links when repeated. ExerciseDB
sync continues to manage only its own source. No schema or RLS changes are needed.

The current set editor records reps, weight, and notes. For timed holds, record
seconds in notes until dedicated duration logging is added.
