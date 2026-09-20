# strengthOS feature backlog

Reviewed September 19, 2026. Focus: accurately record training, understand progress, and make better decisions for the next workout. This backlog includes major features and smaller conveniences from the Hevy comparison. Hevy import/export and social features are excluded.

Current-support statements refer to the inspected working tree. Hevy evidence combines its signed-in web interface with official documentation for mobile-only features; phone behavior was not tested directly. Priorities and sizes are recommendations, not delivery commitments.

## Baseline and priorities

Already present: saved routines, previous-set values, automatic rest countdowns, workout-wide notes, end-of-workout PR summaries, exercise demonstrations, and weight/volume charts. The working tree also contains **searchable workout history, calendar navigation, session details, and repeat-workout functionality**. Extend these features rather than rebuilding them. Their presence locally does not establish production deployment. [History page][history] · [Workout details][history-details]

| Label | Meaning |
| --- | --- |
| P0 | First release: accurate logging and essential workout controls |
| P1 | Next: better interpretation, correction, and reliability |
| P2 | Later: optional convenience or larger platform investment |
| S | Small, localized UI or behavior change |
| M | Coordinated UI and data-flow work; may need a migration |
| L | Cross-cutting data, analytics, synchronization, or platform work |

Sizes assume reuse of existing components and services. They are relative estimates, not promises in days.

## Major features

### B1. Bodyweight, assisted/weighted bodyweight, and timed exercises — P0 / L

- **Current:** Sets store weight and reps, without duration or exercise logging type. Progress charts require nonzero weight and reps, excluding ordinary bodyweight sets. [Set types][types] · [Analytics filter][analytics]
- **Add:** Appropriate inputs for rep-only exercises, added weight, assistance, and timed holds. Track rep and duration records and trends; clearly distinguish added weight from assistance. Keep summaries and backend analytics consistent with each exercise type.
- **Benefit:** Pull-ups, dips, planks, and dead hangs become first-class training data instead of being omitted or forced into weight/reps fields.
- **Hevy comparison:** Supports bodyweight rep records and duration records. [Exercise performance][hevy-performance]

### B2. Planned targets beside actual performance — P0 / M

- **Current:** Routine editing supports rep ranges and target RPE, but active logging does not display those targets or offer actual RPE entry. [Routine editor][routine-editor] · [Workout creation][app] · [Logger][logger]
- **Add:** Show target rep range, previous performance, and today's result together. Add optional recorded RPE, with a brief explanation of effort and reps remaining. Keep planned effort separate from actual effort and preserve targets with the workout.
- **Benefit:** The routine remains useful during training, and later comparisons can distinguish more weight/reps from greater effort.
- **Hevy comparison:** Logs per-set RPE and displays previous effort. Hevy does not expose RIR as a separate field. [RPE tracking][hevy-rpe]

### B3. Exercise history and meaningful progress comparisons — P1 / M

- **Current:** Analytics shows max weight and session volume. Exercise details show aggregate best-set and estimated-1RM values; dated exercise-specific set history is not displayed there. [Analytics][analytics] · [Exercise details][exercise-details]
- **Add:** Dated set history inside each exercise, recent-session comparisons, estimated-1RM trends, rep records at a given load, and links to the original workouts. Use suitable rep/time metrics for B1 exercise types. Label estimates clearly.
- **Benefit:** Answer whether an exercise is improving without confusing a heavier single, extra sets, and better performance at the same weight.
- **Hevy comparison:** Offers exercise history, strength estimates, set/session volume records, and records by rep count. [Exercise performance][hevy-performance]

### B4. Weekly muscle workload and training frequency — P1 / M

- **Current:** Backend services calculate weekly summaries, muscle-group volume, and low-exposure findings; the frontend does not expose a weekly muscle-set dashboard. Existing logic is a starting point, not a complete implementation. [Training analytics][training-analytics]
- **Add:** Completed working sets per muscle, week-to-week comparisons, training frequency, and last-trained dates. Include bodyweight work and show zero activity for tracked muscles. Distinguish primary-muscle work from estimated secondary-muscle contributions.
- **Benefit:** Reveal what is consistently trained or overlooked. Use actual completed workouts rather than routine names or planned sets; do not present these counts as measured recovery readiness.
- **Hevy comparison:** Provides set counts by muscle with time-based filtering. [Muscle-set statistics][hevy-muscles]

### B5. Explicit set types and consistent analytics — P0 / M

- **Current:** No explicit warm-up, working, failure, or drop-set field/control. Backend warm-up exclusion relies on finding "warm" in notes; frontend summaries do not use that same classification. [Set types][types] · [Training analytics][training-analytics]
- **Add:** Explicit set labels, beginning with warm-up versus working sets, then failure and drop-set labels. Apply consistent rules to set counts, volume, records, and progress. Keep warm-ups out of working-set totals by default and coordinate drop sets with rest-timer behavior.
- **Benefit:** Preserve the meaning of each set and make statistics trustworthy.
- **Hevy comparison:** Supports normal, warm-up, failure, and drop sets, including timer behavior for consecutive drop sets. [Set types][hevy-set-types]

### B6. Correct completed workouts and log missed sessions — P1 / M

- **Current:** History supports viewing and repeating workouts, without editing completed sessions. Duration is calculated from start/end timestamps. [Workout details][history-details]
- **Add:** Correct weights, reps, notes, dates, and duration; create a backdated session; pause/resume workout timing. Recompute affected records and analytics after corrections.
- **Benefit:** Mistakes and forgotten timer stops do not permanently distort training history.
- **Hevy comparison:** Supports workout timer pausing and editing saved workout duration. [Timing and corrections][hevy-duration]

### B7. Explainable next-session recommendations — P1 / L

- **Current:** Backend services classify progress and detect possible stagnation, but do not provide an in-app next-session recommendation. Current heuristics need validation before driving guidance. [Training analytics][training-analytics]
- **Add:** Optional suggestions to add reps, increase weight by a chosen increment, or repeat a target. Base them on the user's routine, completed working sets, target ranges, and recorded effort. Show supporting sessions, allow overrides, and withhold suggestions when evidence is insufficient.
- **Benefit:** Connect the training log to a concrete next-session decision. Start with existing routines and transparent rules.
- **Hevy comparison:** Hevy Trainer provides adaptive programs and weight adjustments; the inspected web account described it as mobile-only and Pro. [Hevy Trainer][hevy-trainer]

### B8. Connection-loss protection and reliable recovery — P1 / L

- **Current:** The app warns that offline edits fail; failed updates can revert optimistic changes. No durable offline workout queue was found. [Workout writes and offline banner][app]
- **Add:** Preserve unsaved input during transient failures, distinguish pending/failed/saved states, offer safe retry, and reconcile without duplicate sets or silent overwrites. Define recovery behavior for navigation and reload.
- **Benefit:** Poor gym reception should not make users re-enter work or believe an unsaved set was recorded.
- **Constraint:** Supabase remains the source of truth. Durable offline drafts would require an explicit revision to the repository's prohibition on local persistence; do not introduce a second database or silently bypass that rule. [Repository architecture][repo-guidelines]
- **Evidence:** This is a recommendation based on strengthOS behavior; Hevy offline behavior was not verified in the comparison.

### B9. Lock-screen and watch controls — P2 / L

- **Current:** Workout controls and timers are browser UI; no native lock-screen or watch integration was found. [Logger][logger]
- **Add:** Show the next exercise/set and rest countdown outside the main app, with set completion and timer controls. Evaluate phone lock-screen support separately from watch support.
- **Benefit:** Reduce phone handling between sets.
- **Boundary:** Treat this as a separate platform project with real-device testing. An in-app sound does not establish reliable locked-screen delivery.
- **Hevy comparison:** Supports live-activity controls and Apple Watch logging. [Live activity][hevy-live] · [Official app listing][hevy-app]

## Smaller improvements

These are smaller product surfaces; persistent data and platform behavior can still make an individual item medium-sized.

### S1. Rest-timer sound and supported vibration — P0 / S

- **Current:** The timer clears at zero without an alert. [Logger][logger]
- **Add:** A completion sound, mute/volume controls, and optional vibration where supported. Deliver one alert per completion; test supported devices and audio settings.
- **Benefit:** Users can rest without watching the countdown.
- **Hevy comparison:** Offers configurable timer sounds and volume. Vibration is a proposed strengthOS enhancement, not a verified Hevy claim. [Workout settings][hevy-settings]

### S2. Remember rest settings per routine exercise — P0 / M

- **Current:** The global default persists locally, but exercise overrides are held in component state and reset. Routine exercises have no rest-duration field. [Logger][logger] · [Routine types][types]
- **Add:** Save rest duration with each routine exercise, restore it when starting the routine, and allow a session-specific override or timer-off choice.
- **Benefit:** Avoid repeatedly configuring different rests for different exercises.
- **Hevy comparison:** Supports saved exercise-specific rest settings. [Rest timer][hevy-rest]

### S3. Timer recovery and quick adjustment — P0 / M

- **Current:** The running deadline exists only in logger state. Users can dismiss the timer, but cannot adjust the running countdown in quick increments. [Logger][logger]
- **Add:** Recover the countdown after navigation/reload, provide +15 seconds, -15 seconds, and Skip, and prevent duplicate completion alerts after recovery. Stop obsolete timers when a workout ends.
- **Benefit:** Make the timer dependable while navigating the app and easy to adjust between sets.
- **Hevy comparison:** Supports quick timer adjustment and skipping. [Rest timer][hevy-rest] · [Live activity][hevy-live]

### S4. Persistent exercise instructions and previous-session notes — P1 / M

- **Current:** Workout-wide notes and provider exercise instructions exist. The active logger does not offer reusable personal exercise instructions or previous exercise-session notes. [Logger][logger] · [Exercise details][exercise-details]
- **Add:** Reusable cues such as seat position, grip, or tempo; separate session observations; display the previous observation when revisiting the exercise.
- **Benefit:** Preserve the context needed to repeat an exercise consistently and understand performance changes.
- **Hevy comparison:** Distinguishes routine exercise notes from session-specific exercise notes. [Exercise notes][hevy-notes]

### S5. Replace, reorder, and remove active exercises — P1 / M

- **Current:** Routine editing can reorder/remove exercises. Active logging offers adding exercises and sets, without equivalent exercise-management controls. [Routine editor][routine-editor] · [Logger][logger]
- **Add:** Replace, reorder, or remove exercises during a workout. Preserve completed work when substituting and distinguish changing this session from updating the saved routine.
- **Benefit:** Adapt to occupied or unavailable equipment without rebuilding the session.
- **Hevy comparison:** Provides these controls during workout logging. [Programming options][hevy-programming]

### S6. Supersets — P2 / M

- **Current:** No exercise grouping or superset-aware logging/rest flow. [Workout types][types] · [Logger][logger]
- **Add:** Group exercises, move to the next exercise in the group after set completion, and apply rest at the intended point in the sequence.
- **Benefit:** Less scrolling and fewer inappropriate rest interruptions when alternating exercises.
- **Hevy comparison:** Supports supersets and smart scrolling. [Supersets][hevy-supersets]

### S7. Plate and warm-up calculators — P2 / M

- **Current:** No plate-loading or warm-up calculator in the logger. [Logger][logger]
- **Add:** Calculate plates per side from bar weight and available plates. Generate editable warm-up sets with rounding to available equipment; mark them using B5 set types.
- **Benefit:** Reduce mental arithmetic and repetitive warm-up entry.
- **Hevy comparison:** Offers both calculators; its documented warm-up calculator is Pro. [Workout settings][hevy-settings]

### S8. Keep the screen awake — P1 / S

- **Current:** No keep-awake control found. [Logger][logger]
- **Add:** An optional keep-awake setting during active workouts on supported devices; release it when the workout ends or the app no longer needs it.
- **Benefit:** Avoid repeatedly unlocking the phone to log a set.
- **Hevy comparison:** Includes a keep-awake workout setting. [Workout settings][hevy-settings]

### S9. Live personal-record alerts — P2 / M

- **Current:** The finish sheet reports max-weight and session-volume PRs. No immediate set-completion PR alert. [Logger][logger]
- **Add:** A brief optional alert for a newly achieved record, including rep/time records after B1/B3. Use the same record rules as history and analytics, and do not announce a failed save as a recorded PR.
- **Benefit:** Give timely feedback on progress without requiring users to inspect charts.
- **Hevy comparison:** Offers live PR notifications and volume settings. [Workout settings][hevy-settings]

### S10. Bodyweight trends, with optional measurements and photos — P1 / M; extras P2 / M

- **Current:** Profile stores current bodyweight and height, without a dated measurement history. [Profile][profile]
- **Add:** Dated bodyweight entries and trend/weekly-average views. Add circumference measurements and private progress photos later if useful; do not make them required for workout tracking.
- **Benefit:** Add context to bodyweight-exercise performance and track changes beyond lifted weight.
- **Hevy comparison:** Supports dated measurements, charts, and progress photos. [Body measurements][hevy-measurements]

## Suggested delivery sequence

1. **Logging accuracy and workout conveniences:** B1, B2, B5, S1–S3. Ship screen-awake and exercise notes alongside these when practical. Reuse the existing history/calendar/repeat-workout work.
2. **Reliable records and analytics:** B3, B4, B6, S4–S5, S10 bodyweight trends. Address B8 early if connection failures affect normal use. Keep counts and record definitions consistent across frontend and backend.
3. **Progression guidance:** B7 after actual effort, set types, exercise metrics, and historical comparisons are dependable.
4. **Optional conveniences and platform work:** S6–S9 as useful, optional measurements/photos, and B9 when reduced phone interaction warrants the investment.

Feature-specific implementation plans should resolve schema and platform choices before coding. This document records the backlog, not a commitment to implement every feature at once.

[repo-guidelines]: AGENTS.md
[history]: frontend/src/components/WorkoutHistoryPage.tsx
[history-details]: frontend/src/components/WorkoutHistoryUI.tsx
[types]: frontend/src/lib/types.ts
[analytics]: frontend/src/components/AnalyticsPage.tsx
[routine-editor]: frontend/src/components/RoutineUI.tsx
[app]: frontend/src/App.tsx
[logger]: frontend/src/components/WorkoutLogger.tsx
[exercise-details]: frontend/src/components/ExerciseDetails.tsx
[training-analytics]: backend/app/services/training_analytics.py
[profile]: frontend/src/components/ProfilePage.tsx
[hevy-performance]: https://www.hevyapp.com/features/exercise-performance/
[hevy-rpe]: https://help.hevyapp.com/hc/en-us/articles/34490600233111-RPE-vs-RIR-What-They-Mean-and-How-to-Use-Them-in-Hevy
[hevy-muscles]: https://www.hevyapp.com/features/sets-per-muscle-group-per-week/
[hevy-set-types]: https://www.hevyapp.com/features/workout-set-types/
[hevy-duration]: https://help.hevyapp.com/hc/en-us/articles/34513981310615-How-to-I-adjust-duration-and-pause-a-workout
[hevy-trainer]: https://www.hevyapp.com/features/workout-plan-generator/
[hevy-live]: https://www.hevyapp.com/features/live-activity/
[hevy-app]: https://apps.apple.com/us/app/hevy-workout-tracker-gym-log/id1458862350
[hevy-settings]: https://help.hevyapp.com/hc/en-us/articles/33882110558743-Workout-Settings-Preferences-Timer-Warm-up-calculator-Plate-Calculator-Smart-Superset-Scrolling
[hevy-rest]: https://www.hevyapp.com/features/workout-rest-timer/
[hevy-notes]: https://help.hevyapp.com/hc/en-us/articles/34463684392983-How-do-the-exercise-notes-routine-and-workout-notes-work
[hevy-programming]: https://www.hevyapp.com/features/exercise-programming-options/
[hevy-supersets]: https://www.hevyapp.com/features/what-are-supersets/
[hevy-measurements]: https://www.hevyapp.com/features/track-body-measurements/
