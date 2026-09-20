# Feature to add: complete workout history and calendar

## Recommendation

Add a dedicated, navigable workout history: a calendar/list of every completed workout, with day drill-down and full session details.

This is the clearest missing baseline feature. strengthOS successfully records workouts, routines, sets, previous values, PRs, rest periods, and analytics, but it does not give users a way to browse their complete training record. Home exposes only the five most recent workouts ([`HomePage.tsx`](frontend/src/components/HomePage.tsx#L37-L39)), and the 52-week analytics heatmap is display-only rather than clickable ([`WorkoutHeatmap.tsx`](frontend/src/components/charts/WorkoutHeatmap.tsx#L24-L33)). There is also no History destination or route in the current primary navigation ([`BottomNavigation.tsx`](frontend/src/components/ui/BottomNavigation.tsx#L16-L21)).

The result is a product mismatch: strengthOS owns the historical data, but a user cannot answer basic questions such as “What did I train last month?”, “What did I do on this date?”, or “Can I repeat that workout?” once a session falls out of the five-item Home list.

## Why this is the expected workout-tracker baseline

- Hevy describes its Calendar as a complete workout history covering every month, with each workout day opening the completed session. It also supports starting a workout from a past session. [Hevy Calendar and Streak](https://help.hevyapp.com/hc/en-us/articles/35380117933207-Track-Your-Workout-Consistency-with-the-Calendar-and-Streak-Features), [Hevy workout logging](https://help.hevyapp.com/hc/en-us/articles/35361530647959-How-to-Log-a-Workout-in-the-Hevy-App-Step-by-Step-Guide)
- Strong positions complete cloud workout history as part of its core value and provides a History screen for viewing and editing past workouts. [What is Strong?](https://help.strongapp.io/article/228-what-is-strong), [Edit a past workout](https://help.strongapp.io/article/249-how-do-i-edit-a-past-workout)
- JEFIT likewise documents editing logged workouts from the calendar in its Progress tab. [JEFIT FAQ](https://www.jefit.com/support/faq)

These are product-vendor sources, so they establish feature prevalence but do not prove user demand on their own.

## Focused MVP

1. Add a `/history` route linked by a **See all** action beside Recent Workouts and by tapping a populated heatmap day. Preserve the existing four-item bottom navigation for now.
2. Show a mobile-first chronological list grouped by month, plus a month calendar toggle. Include workout name, date, duration, exercise count, completed sets, and total volume.
3. Open a selected workout in a detail page or the existing workout-detail sheet pattern. Show exercises, ordered sets, notes, completion status, and totals.
4. Add search/filtering by exercise and date range.
5. Add **Repeat workout**, which starts a new active workout using the selected session's exercises and sets as editable starting values.

Viewing history and repeating a workout should ship before past-workout editing. Editing introduces more complex decisions around dates, analytics recalculation, PRs, and accidental data loss.

## Existing code to reuse

- `HomePage` already builds ordered workout details and renders a reusable detail sheet ([`HomePage.tsx`](frontend/src/components/HomePage.tsx#L84-L93)). Extract `RecentWorkoutRow`, `WorkoutDetails`, and their formatting/grouping helpers into focused history components instead of duplicating them.
- `WorkoutHeatmap` already normalizes dates and counts sessions by day; make populated cells buttons and expose an `onSelectDate` callback.
- `App.tsx` already loads workouts ordered newest-first and fetches their related exercises and sets ([`App.tsx`](frontend/src/App.tsx#L321-L385)). The initial MVP needs no schema migration.
- Existing `MobileHeader`, `SurfaceCard`, `BottomSheet`, `MetricCard`, empty/error states, and app routing conventions cover the visual structure.

## Data and architecture notes

Do not keep loading an unlimited lifetime history and every related set into the app shell. Add paginated workout summaries for the list and fetch exercises/sets on demand for the selected workout. Supabase remains the source of truth, and current user-scoped RLS policies should continue to protect all reads.

If fast client-side delivery is preferred first, reuse the currently loaded data behind `/history`, then follow with pagination before large accounts approach PostgREST response limits. No backend service is required for normal user reads.

## Acceptance criteria

- Every completed workout is reachable, not only the newest five.
- A user can switch between chronological list and month calendar views.
- Selecting a populated date shows all workouts completed that day.
- Selecting a workout shows its exercises, sets, notes, duration, and volume.
- Search by exercise name and date filtering work together.
- Repeating a past workout creates a new workout without mutating the original.
- Empty, loading, error, and pagination states follow existing UI patterns.
- All history queries remain authenticated and user-scoped through Supabase RLS.
- `npm run build` passes after implementation.

## Next additions after history

1. **Reliable rest-timer completion alerts.** The existing countdown starts automatically, but it has no sound, vibration, notification, or persisted running deadline ([`WorkoutLogger.tsx`](frontend/src/components/WorkoutLogger.tsx#L94-L98), [`WorkoutLogger.tsx`](frontend/src/components/WorkoutLogger.tsx#L469-L495)). Strong and Hevy both expose configurable timer sounds, and Hevy exposes the active timer on the lock screen. This is the best small usability follow-up.
2. **Explainable progression recommendations.** Backend analytics already classifies progress and stagnation, so it could suggest conservative next-session load or rep changes without a migration. This is valuable differentiation, but it is less universal than complete history and needs careful handling because actual set RPE is not currently captured in the active logger.
3. **Longitudinal body measurements and goals.** Profiles currently hold a weight snapshot and free-text goal, not measurement history or target dates. This requires a migration and new user-owned RLS policies.

## Decision summary

Build complete workout history first. It closes the most fundamental gap with mature trackers, unlocks data strengthOS already stores, requires no initial schema change, and creates a natural foundation for repeating workouts, editing past sessions, streaks, progression guidance, and richer analytics.
