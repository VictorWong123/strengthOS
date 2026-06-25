# Repository Guidelines

## Project Shape

strengthOS has three main areas:

- `frontend/`: Vite React TypeScript app using React 19, Tailwind CSS, `supabase-js`, lucide icons, and Vercel config.
- `backend/`: FastAPI backend for ExerciseDB sync, ExerciseDB image proxying, Supabase-backed analytics, admin routes, and FastMCP tools.
- `supabase/migrations/`: Supabase PostgreSQL schema, constraints, indexes, and RLS policies.

Frontend source lives in `frontend/src/`. Reusable UI components live in `frontend/src/components/`; shared helpers and app types live in `frontend/src/lib/`; frontend utility tests live in `frontend/tests/`.

Backend source lives in `backend/app/`. Tests live in `backend/tests/`. Keep provider logic in `backend/app/providers/`, shared analytics/business logic in `backend/app/services/`, database access in `backend/app/repositories/`, API routes in `backend/app/routers/`, and MCP tool registration in `backend/app/mcp/`.

## Source Of Truth

Supabase PostgreSQL is the only database and source of truth for users, exercises, workouts, routines, sets, sync runs, and profile data.

Do not introduce a second application database, local persistence layer, or backend-side mirror of user workout state. The frontend should use Supabase client reads/writes protected by RLS for normal app data. Backend services should query Supabase through the established repository/service pattern.

MCP and backend user-scoped operations must derive the user from a validated Supabase bearer token. Never trust a client-provided `user_id` for user-scoped data access.

## Frontend Style

Use TypeScript, React function components, and hooks. Components use `PascalCase`; hooks and helpers use `camelCase`.

Keep feature UI in focused components under `frontend/src/components/`. Put reusable logic in `frontend/src/lib/` when it is shared by multiple components or tests. Prefer existing primitives from `frontend/src/components/ui.tsx` before adding new ad hoc button, card, sheet, header, or banner markup.

Keep UI components small and single-purpose. If a component file renders multiple unrelated controls, surfaces, layouts, or behaviors, split it into focused components named after the thing they own. For example, shared primitives should live under `frontend/src/components/ui/`, with one component per file and a short top comment explaining what that component is for. Use the `frontend/src/components/ui/index.ts` barrel for exports, but do not recreate a large catch-all `ui.tsx` file.

This app is mobile-first and app-like, not a marketing site. Keep screens dense, direct, and touch-friendly. Follow the existing dark theme, Tailwind tokens, bottom navigation, mobile headers, bottom sheets, dialogs, and banner patterns.

Use lucide icons for icon buttons when an icon exists. Keep labels and status text concise. Avoid adding explanatory in-app copy about how features work unless the current UI pattern already does it.

When reading or writing workout data, preserve the current client-side Supabase pattern in `frontend/src/App.tsx` unless the change intentionally moves behavior into a shared helper or backend service.

## Backend Style

Use Python 3.11+, FastAPI, Pydantic settings, async HTTP clients, and the existing service/repository/provider boundaries.

Backend public modules, services, providers, and scripts should include useful docstrings explaining purpose, side effects, and failure behavior. Keep route handlers thin; put reusable behavior in services or repositories.

Provider code should normalize external ExerciseDB data before storage. Sync behavior should remain idempotent, upsert by `(source, external_id)`, preserve workout relationships, record sync runs, and log failed records.

Admin endpoints must require `x-admin-key`. Service-role Supabase operations belong on the backend only.

FastMCP tools should remain read-only, authenticated, and user-scoped. Add new MCP behavior through shared backend services where possible so REST, tests, and MCP do not duplicate analytics logic.

## Runtime Surface

Current backend routes:

- `GET /health`
- `POST /admin/sync-exercises`
- `GET /.well-known/oauth-protected-resource`
- `GET /exercise-images/{external_id}?resolution=180|360|720|1080`
- `/mcp`

Current MCP tools:

- `get_recent_workouts`
- `get_workout`
- `get_exercise_history`
- `get_strength_progress`
- `get_weekly_training_summary`
- `get_volume_by_muscle_group`
- `get_personal_records`
- `find_stagnating_exercises`
- `find_undertrained_muscle_groups`
- `get_current_routines`
- `get_user_training_context`

## Environment And Secrets

Frontend may use only:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_API_URL
```

Backend uses:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
FRONTEND_URL
FRONTEND_ORIGIN
BACKEND_PUBLIC_URL
EXERCISE_API_PROVIDER
EXERCISE_API_KEY
EXERCISE_API_HOST
EXERCISE_API_BASE_URL
EXERCISE_SYNC_PAGE_SIZE
ADMIN_API_KEY
EXERCISE_API_MAX_RETRIES
EXERCISE_API_MAX_RETRY_DELAY_SECONDS
```

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_API_KEY`, or `EXERCISE_API_KEY` in frontend code. Keep ExerciseDB access backend-only. Use `EXERCISE_API_PROVIDER=seed` for local seeded data unless RapidAPI credentials are configured.

## Testing

Backend tests use `pytest`; files should be named `test_*.py`. Add focused tests for providers, normalization, sync behavior, admin auth, Supabase repositories, authentication, user scoping, analytics, MCP tools, ExerciseDB sync, image proxy behavior, and migration SQL changes.

No full frontend test runner is configured. For frontend changes, `npm run build` is the required verification step. Run `npm run test:return-to` when changing auth redirect or return-to helpers.

For SQL changes, update or add migration tests in `backend/tests/test_migration_sql.py` when constraints, policies, indexes, or table shapes change.

## Migrations

Add new Supabase schema changes as new files under `supabase/migrations/`. Do not edit old migrations unless the user explicitly asks and the database has not consumed them.

Keep RLS policies user-scoped. Workout, routine, set, profile, and user-owned exercise rows must not be readable or writable across users.

## Resource Hygiene

Close local servers, watchers, and test processes after verification. Remove temporary artifacts before finishing. Do not delete unrelated user files.

Exercise image cache files belong under `backend/.cache/exercise-images`; pytest cache fixtures may create `backend/pytest-cache-files-*` folders and should clean them up.

## Commit And PR Notes

Use short imperative commit messages, for example:

```text
Add routine reorder controls
Protect exercise image proxy
```

Pull requests should include a concise summary, verification commands run, screenshots for UI changes, and notes about migrations or environment variables.
