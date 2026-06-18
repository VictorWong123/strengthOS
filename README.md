# strengthOS

strengthOS is a dark, mobile-first workout tracker. Supabase is the primary application backend for Auth, Postgres, generated APIs, and Row Level Security. FastAPI runs private management jobs for ExerciseDB catalog sync and Turso export. Turso is a read replica intended for later FastMCP/ChatGPT access.

## Architecture

- `frontend/`: Vite, React, TypeScript, Tailwind CSS, and `supabase-js`.
- `backend/`: FastAPI management API plus sync/export scripts.
- `supabase/`: SQL migrations for the primary Postgres schema and RLS.
- Turso/libSQL: optional read replica populated from Supabase for future MCP.

The frontend never calls ExerciseDB. ExerciseDB/RapidAPI credentials and the Supabase service role key belong only in the backend environment.

## Environment

Frontend `.env`:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Backend `.env`:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
EXERCISE_API_PROVIDER=seed
EXERCISE_API_KEY=
EXERCISE_API_HOST=exercisedb.p.rapidapi.com
EXERCISE_API_BASE_URL=https://exercisedb.p.rapidapi.com
EXERCISE_SYNC_PAGE_SIZE=100
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
TURSO_EXPORT_USER_ID=
FRONTEND_ORIGIN=http://localhost:5173
ADMIN_API_KEY=
EXERCISE_API_MAX_RETRIES=3
EXERCISE_API_MAX_RETRY_DELAY_SECONDS=30
```

## Setup

Apply the Supabase migration in `supabase/migrations`.

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

Run the apps:

```bash
cd backend
uvicorn app.main:app --reload
```

```bash
cd frontend
npm run dev
```

Private admin endpoints require the configured `ADMIN_API_KEY` in the
`x-admin-key` header. The command-line scripts are the preferred local way to
run sync/export jobs.

## Exercise Catalog Sync

Import the configured exercise provider into Supabase:

```bash
cd backend
python -m app.scripts.sync_exercises
```

Use `EXERCISE_API_PROVIDER=seed` for the bundled local catalog. Use `EXERCISE_API_PROVIDER=exercisedb` only when `EXERCISE_API_KEY` and `EXERCISE_API_HOST` are configured; missing ExerciseDB credentials fail loudly so production syncs do not accidentally import seed data. The sync upserts by `(source, external_id)`, records sync runs, logs failed records, and preserves existing workout relationships.

ExerciseDB media is not copied into this repository. strengthOS stores provider metadata and remote media URLs only. Verify the RapidAPI/ExerciseDB plan terms for attribution, allowed media use, and rate limits before production use.

## Turso Export

Export selected Supabase data into Turso for later FastMCP reads:

```bash
cd backend
python -m app.scripts.sync_turso
```

Turso is treated as a read replica. Future ChatGPT write tools should write to Supabase through a controlled backend path, then refresh Turso.

## FastMCP Later

The planned MCP server should expose typed tools over the Turso read replica:

- `search_exercises`
- `get_recent_workouts`
- `get_exercise_progress`
- `get_best_sets`
- `get_routines`

Read-only MCP tools can use Turso directly. Mutating tools should go through Supabase-aware backend services so RLS, ownership, and audit behavior remain centralized.
