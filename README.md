# strengthOS

strengthOS is a dark, mobile-first workout tracker. Supabase PostgreSQL is the only database and source of truth for Auth, app data, generated APIs, and Row Level Security.

## Architecture

- Frontend: React, TypeScript, Tailwind CSS, Vite, and Vercel.
- Backend: FastAPI and FastMCP on Google Cloud Run.
- Database/Auth: Supabase PostgreSQL and Supabase Auth.
- Exercise data: ExerciseDB synchronization directly into Supabase.

The frontend talks to Supabase for the existing workout app experience. The backend exposes `/health`, admin ExerciseDB sync endpoints, and `/mcp` tools. MCP tools validate a Supabase bearer token, derive the authenticated user id, call shared backend services, and read user-scoped data from Supabase. No secondary synchronization database is required.

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
EXERCISE_API_PROVIDER=seed
EXERCISE_API_KEY=
EXERCISE_API_HOST=exercisedb.p.rapidapi.com
EXERCISE_API_BASE_URL=https://exercisedb.p.rapidapi.com
EXERCISE_SYNC_PAGE_SIZE=100
ADMIN_API_KEY=
EXERCISE_API_MAX_RETRIES=3
EXERCISE_API_MAX_RETRY_DELAY_SECONDS=30
```

Never put the Supabase service-role key or ExerciseDB credentials in frontend code.

## Setup

Apply the Supabase migrations in `supabase/migrations`.

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

## MCP

FastMCP is mounted at:

```text
http://localhost:8000/mcp
```

Clients must send:

```text
Authorization: Bearer <supabase_access_token>
```

The backend validates that token with Supabase Auth and never accepts a client-provided `user_id`. Tools are read-only and query Supabase through shared backend services.

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

```bash
cd frontend
npm run build
```

```bash
cd backend
pytest
```

Check liveness:

```bash
curl http://localhost:8000/health
```

## Docker And Cloud Run

Build the backend image:

```bash
cd backend
docker build -t strengthos-backend .
```

Run locally:

```bash
docker run --env-file .env -p 8000:8000 strengthos-backend
```

Deploy the image to Cloud Run with the backend environment variables configured as secrets or service environment variables. The container starts with:

```bash
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

Cloud Run should expose `/health` and `/mcp` from the same backend process.
