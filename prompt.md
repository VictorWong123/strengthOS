## Styling update

Use Tailwind CSS for all frontend styling instead of plain CSS or CSS modules.

Configure:

* Tailwind CSS
* PostCSS
* Autoprefixer
* A reusable Tailwind design system
* Mobile-first responsive breakpoints
* Dark mode as the default appearance

Use reusable utility-based components rather than extremely long repeated class strings. Create shared components or helper functions for common cards, buttons, inputs, dialogs, badges, and navigation elements.

Use a dark workout-tracker-inspired theme:

* Near-black page background
* Dark gray cards and inputs
* White primary text
* Muted gray secondary text
* Blue accent color
* Clear completed-set states
* Large touch targets
* Rounded cards
* iPhone safe-area support
* Minimum 16px font size on form inputs to prevent iOS auto-zoom

## External exercise catalog

Integrate ExerciseDB through RapidAPI as the initial exercise-data provider.

The exercise catalog should contain a broad range of movement and equipment variations, including:

* Barbell
* Dumbbell
* Smith machine
* Cable
* Selectorized machine
* Plate-loaded machine
* Resistance band
* Kettlebell
* Bodyweight
* Assisted bodyweight
* EZ bar
* Trap bar
* Medicine ball
* Stability ball

Treat exercises performed with different equipment as separate exercises. For example:

* Barbell bench press
* Dumbbell bench press
* Smith machine bench press
* Chest press machine
* Incline barbell bench press
* Incline dumbbell bench press
* Incline Smith machine bench press

Do not collapse these into a single generic bench-press exercise because their strength histories are not directly interchangeable.

### Exercise fields

Update the exercises table to support:

* id
* external_id
* source
* user_id
* name
* normalized_name
* primary_muscle
* secondary_muscles
* body_part
* equipment
* movement_category
* instructions as a text array
* image_url
* animation_url
* thumbnail_url
* is_custom
* is_active
* created_at
* updated_at

Use a unique constraint on source and external_id.

Custom exercises should have source set to `custom` and may have no media.

### Import and synchronization

Do not call ExerciseDB directly from the frontend.

Create backend endpoints or management scripts that:

1. Retrieve the exercise catalog from ExerciseDB.
2. Normalize the response.
3. Upsert exercises into Supabase.
4. Avoid duplicates using source and external_id.
5. Preserve existing workout relationships.
6. Record synchronization timestamps.
7. Handle API pagination and rate limits.
8. Log failed records without failing the entire import.
9. Allow rerunning the import safely.

Create a command such as:

```bash
python -m app.scripts.sync_exercises
```

The application should read exercises from Supabase after synchronization instead of calling ExerciseDB every time the exercise picker opens.

Keep the external API key only in the FastAPI backend.

Add these environment variables:

```text
EXERCISE_API_PROVIDER=exercisedb
EXERCISE_API_KEY=
EXERCISE_API_HOST=
```

Create an exercise-provider interface so ExerciseDB can later be replaced by wger or another provider without rewriting the application.

Suggested interface methods:

```python
list_exercises()
get_exercise(external_id)
search_exercises(query)
list_equipment()
list_body_parts()
list_target_muscles()
```

### Exercise details page

Create a detailed exercise page or modal containing:

* Exercise name
* Animated demonstration or image
* Primary muscle
* Secondary muscles
* Equipment
* Step-by-step instructions
* Recent user performance
* Best set
* Estimated one-rep maximum
* Button to add the exercise to an active workout
* Button to add the exercise to a routine

Use lazy loading for GIFs and images.

Do not automatically load every animation inside the exercise search list. Show a thumbnail or placeholder in search results and load the full animation only when the user opens the exercise details page. This is important for mobile performance and external API bandwidth.

Include accessible alt text and a fallback state when media is unavailable.

### Search and normalization

Support searching by:

* Exercise name
* Muscle
* Equipment
* Body part

Normalize common terms and aliases so searches such as these work:

* Bench
* Dumbbell bench
* DB bench
* Smith bench
* Chest press
* Lat pulldown
* Cable row
* RDL
* Romanian deadlift

Store aliases separately or implement an alias mapping service.

The exercise picker should clearly display the equipment type so users do not accidentally select the wrong variation.

### Licensing and media

Do not copy media assets into the repository.

Store only provider metadata and remote media URLs unless the provider explicitly allows local redistribution.

Add attribution or provider branding if required by the provider’s terms.

Document the selected provider, rate limits, licensing assumptions, and replacement procedure in the README.

If ExerciseDB credentials are unavailable, allow the application to run using a small local seed catalog while keeping the provider integration ready.
