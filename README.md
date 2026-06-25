# strengthOS

strengthOS is a dark, mobile-first workout tracker for logging workouts, managing routines, browsing exercises, and reviewing training analytics. Supabase PostgreSQL is the only database and source of truth for Auth, app data, generated APIs, and Row Level Security.

## Architecture

- Frontend: React 19, TypeScript, Tailwind CSS, Vite 7, `supabase-js`, and Vercel.
- Backend: FastAPI and FastMCP on a Render-compatible web service.
- Database/Auth: Supabase PostgreSQL, Supabase Auth, migrations, constraints, indexes, and RLS policies.
- Exercise data: seed catalog by default, with optional ExerciseDB/RapidAPI synchronization and image proxying.

The frontend reads and writes workout data directly through Supabase using user-scoped RLS. The backend exposes `/health`, admin sync endpoints, ExerciseDB image proxying, OAuth protected-resource metadata, and authenticated read-only MCP tools. MCP requests validate a Supabase bearer token, derive the authenticated user id server-side, and query Supabase through shared backend services.

## Features

- Supabase email/password authentication.
- Home dashboard with weekly summary, routine count, exercise count, best set, and recent workout.
- Workout logging with active workout state, sets, reps, weights, previous-set context, finish, and discard flows.
- Routine create/edit/duplicate/delete/reorder flows with target sets, rep ranges, and RPE notation.
- Exercise library, details, history, and optional proxied ExerciseDB GIFs.
- Analytics views for trends, volume, heatmaps, max weight, personal records, stagnation, and muscle-group balance.
- ChatGPT-compatible MCP endpoint for authenticated training context and analytics.

## Repository Layout

```text
frontend/              Vite React app
frontend/src/          React components, routes, and Supabase helpers
frontend/tests/        Node-based frontend utility tests
backend/               FastAPI, FastMCP, providers, services, repositories, tests
backend/app/           Backend source
backend/tests/         Pytest suite
supabase/migrations/   Supabase schema, RLS, indexes, and constraints
```

## Environment

Frontend `.env`:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_API_URL=http://localhost:8000
```

Backend `.env`:

```text
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FRONTEND_URL=http://localhost:5173
FRONTEND_ORIGIN=
BACKEND_PUBLIC_URL=http://localhost:8000
EXERCISE_API_PROVIDER=seed
EXERCISE_API_KEY=
EXERCISE_API_HOST=exercisedb.p.rapidapi.com
EXERCISE_API_BASE_URL=https://exercisedb.p.rapidapi.com
EXERCISE_SYNC_PAGE_SIZE=100
ADMIN_API_KEY=
EXERCISE_API_MAX_RETRIES=3
EXERCISE_API_MAX_RETRY_DELAY_SECONDS=30
```

Never put `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_API_KEY`, or ExerciseDB credentials in frontend code. Browser code may use only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Setup

Apply the SQL files in `supabase/migrations` to the Supabase project before running the app.

Install backend dependencies:

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -e ".[dev]"
```

Install frontend dependencies:

```bash
cd frontend
npm install
```

Run the backend:

```bash
cd backend
uvicorn app.main:app --reload
```

On Windows, this also works:

```bash
cd backend
py -m uvicorn app.main:app --reload
```

Run the frontend:

```bash
cd frontend
npm run dev
```

## Exercise Catalog Sync

Import the configured exercise provider into Supabase:

```bash
cd backend
python -m app.scripts.sync_exercises
```

Use `EXERCISE_API_PROVIDER=seed` for the bundled local catalog. Use `EXERCISE_API_PROVIDER=exercisedb` only when `EXERCISE_API_KEY` and `EXERCISE_API_HOST` are configured. The sync upserts by `(source, external_id)`, records sync runs, logs failed records, and preserves existing workout relationships.

Run the admin sync endpoint with:

```bash
curl -X POST http://localhost:8000/admin/sync-exercises -H "x-admin-key: <ADMIN_API_KEY>"
```

ExerciseDB images are proxied through the backend at:

```text
GET /exercise-images/{external_id}?resolution=180
```

Synced ExerciseDB records store frontend-facing `/api/exercise-images/...` URLs. Vite rewrites `/api` to the local backend during development; in deployed frontend builds, set `VITE_API_URL` to the public backend origin.

Supported image resolutions are `180`, `360`, `720`, and `1080`. The backend caches fetched images under `backend/.cache/exercise-images`.

## MCP

FastMCP is mounted at:

```text
http://localhost:8000/mcp
```

Clients must send:

```text
Authorization: Bearer <supabase_access_token>
```

The backend validates that token with Supabase Auth and never accepts a client-provided `user_id`. MCP tools are read-only and user-scoped.

Available tools:

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

OAuth protected-resource metadata is available at:

```text
/.well-known/oauth-protected-resource
```

Unauthenticated `/mcp` requests return a `401` bearer challenge pointing to that metadata endpoint. Set `BACKEND_PUBLIC_URL` and `FRONTEND_URL` correctly in production so MCP clients discover the public backend and frontend documentation/consent URL.

Example OpenAI Responses MCP configuration:

```python
tools=[{
    "type": "mcp",
    "server_label": "strengthos",
    "server_url": "https://your-backend.example.com/mcp/",
    "headers": {"Authorization": f"Bearer {access_token}"},
}]
```

## Testing

Frontend production build:

```bash
cd frontend
npm run build
```

Frontend return-to redirect utility test:

```bash
cd frontend
npm run test:return-to
```

Backend tests:

```bash
cd backend
pytest
```

Check backend liveness:

```bash
curl http://localhost:8000/health
```

## Docker And Render

Build the backend image from the repository root:

```bash
docker build -t strengthos-backend .
```

Or build from `backend/` directly:

```bash
cd backend
docker build -t strengthos-backend .
```

Run locally from the repository root:

```bash
docker run --env-file backend/.env -p 8000:8000 strengthos-backend
```

Deploy the backend to Render as a Web Service. Either leave the root directory at the repo root and use the root `Dockerfile`, or set the root directory to `backend` and use `backend/Dockerfile`.

The container starts with:

```bash
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

Render should expose `/health`, `/mcp`, `/.well-known/oauth-protected-resource`, `/admin/sync-exercises`, and `/exercise-images/{external_id}` from the same backend process.
