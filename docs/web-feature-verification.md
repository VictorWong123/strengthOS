# Web feature verification

Verified September 19, 2026 on branch `codex/all-features-hevy-import`.

## Feature coverage

| Feature | Implemented web behavior |
| --- | --- |
| B1 | Weight/reps, bodyweight reps, weighted bodyweight, assisted bodyweight, and duration logging with mode-aware history, records, and trends. |
| B2 | Routine targets, prior results, actual RPE, and session snapshots keep planned and completed effort distinct. |
| B3 | Dated exercise history, same-load comparisons, bounded estimated 1RM trends, rep/time records, and source-workout links. |
| B4 | Account-timezone Sunday weeks, completed working sets by primary/secondary muscle, previous-week comparisons, frequency, last-trained dates, zero-known-muscle rows, and unknown-data visibility. |
| B5 | Normal, warm-up, failure, and drop set types share completed-working-set rules across summaries, records, and analytics. |
| B6 | Completed workout corrections, missed-session backdating, and pause/resume duration accounting. |
| B7 | Optional, explainable add-reps/add-load/repeat guidance using complete comparable sessions, actual RPE, user-selected increments, and linked evidence. |
| B8 | IndexedDB drafts, revision-checked idempotent RPCs, visible pending/failed/conflict states, retry recovery, and finish blocking while writes are unresolved. Supabase remains authoritative. |
| S1 | One-shot rest completion sound, volume/mute, and optional supported vibration. |
| S2 | Routine exercise rest duration/timer-off settings plus session overrides. |
| S3 | Rest countdown reload recovery, +15/-15/skip, and duplicate-alert prevention. |
| S4 | Persistent personal cues, session notes, and previous-session notes. |
| S5 | Revision-safe replace, reorder, add, and remove actions during active workouts while preserving completed work. |
| S6 | Superset grouping, sequence movement, and end-of-round rest. |
| S7 | Finite plate-inventory calculator and editable achievable warm-up sets marked as warm-ups. |
| S8 | Optional Wake Lock use with release and visibility reacquisition. |
| S9 | Optional live records after confirmed saves, using shared mode-aware record rules. |
| S10 | Dated bodyweight/circumference measurements, corrections, weekly averages/trends, and authenticated private sanitized progress photos. |

B9 native lock-screen/watch work is deferred until the web release is stable and real Apple-device build and behavior verification are available. The frontend and backend deployment is also pending.

## Exercise media and private photos

Exercise demonstrations use an authenticated backend proxy with exact-origin token checks, a shared private seven-day cache, a 256 MiB eviction limit, atomic cross-instance leases and daily provider-attempt quota, bounded streaming, and browser object-URL reuse. Ten repeated detail opens used one mocked image fetch. Verification made zero paid ExerciseDB calls.

Progress photos accept authenticated uploads only through the backend. The backend bounds compressed bytes, decoded pixels, and dimensions; applies EXIF orientation; strips metadata; re-encodes WebP; and stores private user-prefixed objects. Account deletion cleans the entire user prefix.

## Schema and import

The consumed training migration is `supabase/migrations/20260919233018_add_training_features.sql`, SHA-256 `e9bd8c35e8e4c202f3c16854ef16fd832a7af045807ad33e076feba35c5fc0b9`. It was exercised with real PostgreSQL rollback tests before application. Any later DDL must use a new migration.

The authorized Hevy import was independently reconciled against the source export, including loads, reps, durations, notes, ordering, and timestamps. Existing account rows were preserved, and a second import left workout, child, set, and private-exercise checksums unchanged.

The three built-in catalog records needed by the import were seeded with null image URLs because the production asset URLs did not yet serve valid SVGs. `20260919212053_add_builtin_exercises.sql` remains pending until those assets are deployed. The personal CSV, generated import SQL, and private reconciliation artifacts remain outside Git and are covered by `.gitignore`.

## Verification commands

Run from the repository root:

```sh
cd backend
uv run pytest
uv run ruff check app tests

cd ../frontend
npm run build
npm run test:training
npm run test:return-to
node tests/exerciseCatalog.test.mjs
npm run test:browser

cd ..
git diff --check
```

Final results: 52 backend tests passed, Ruff passed, the frontend production build and utility tests passed, and all 72 unique Playwright checks passed. The full browser run initially exposed one outdated test expectation for a date-based history URL; the product correctly used the exact workout ID, so the assertion was corrected and its six-case suite reran cleanly. All browser traffic was mocked, unexpected outbound requests failed the run, and verification made zero paid ExerciseDB calls.

The sanitized mocked browser suite and its instructions are in `frontend/tests/browser`. It requires a separately installed Playwright package and browser; environment overrides are documented in its README. It covers the logger modes and targets, timers, offline/conflict recovery, routine persistence, active-workout structure changes, history correction/backdating, analytics boundaries, measurements/photos, record-mode isolation, repeated exercise blocks, and media-cache reuse without contacting paid services.

## Deployment note

Enable leaked-password protection for production Auth using [Supabase's password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). This setting is outside the application migration.
