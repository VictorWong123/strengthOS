# strengthOS

strengthOS is a dark, mobile-first workout tracker. Supabase PostgreSQL is the only database and source of truth for Auth, app data, generated APIs, and Row Level Security.

## Architecture

- Frontend: React, TypeScript, Tailwind CSS, Vite, and Vercel.
- Backend: FastAPI and FastMCP on a Render web service.
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

Never put the Supabase service-role key or ExerciseDB credentials in frontend code.

For production deployment, see `DEPLOYMENT.md`.

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
uvicorn app.main:app --reload #or 
py -m uvicorn app.main:app --reload 

```

Run the frontend:

```bash
cd frontend
npm run dev
```

## iPhone app

The iPhone app packages the existing React frontend with Capacitor; Supabase and the FastAPI backend remain shared with the website. Setup, device testing, signing, and App Store steps are in [docs/ios-app-store.md](docs/ios-app-store.md).

## Exercise Catalog Sync

Import the configured exercise provider into Supabase:

```bash
cd backend
python -m app.scripts.sync_exercises
```

Use `EXERCISE_API_PROVIDER=seed` for the bundled local catalog. Use `EXERCISE_API_PROVIDER=exercisedb` only when `EXERCISE_API_KEY` and `EXERCISE_API_HOST` are configured. The sync upserts by `(source, external_id)`, records sync runs, logs failed records, and preserves existing workout relationships.

## MCP

strengthOS exposes a remote MCP server for read-only workout analytics.

Production MCP endpoint:

```text
https://strengthos.onrender.com/mcp
```

Local development MCP endpoint:

```text
http://localhost:8000/mcp
```

The MCP server uses the remote HTTP transport provided by FastMCP. Every tool call must be authenticated as a strengthOS user:

```text
Authorization: Bearer <supabase_access_token>
```

The backend validates that token with Supabase Auth, derives the authenticated user id, and never accepts a client-provided `user_id`. Tools are read-only and query Supabase through shared backend services.

### Connect ChatGPT

In ChatGPT, open:

```text
Settings > Apps > Create app
```

Create a custom app/connector with:

```text
Name: strengthOS
MCP server URL: https://strengthos.onrender.com/mcp
```

Do not paste bearer tokens into ChatGPT for normal use. Unauthenticated requests to `/mcp` return a `401` bearer challenge with this protected-resource metadata URL:

```text
https://strengthos.onrender.com/.well-known/oauth-protected-resource
```

That metadata tells the client that the MCP resource is `https://strengthos.onrender.com/mcp`, the authorization server is Supabase Auth, and supported scopes are `openid`, `email`, and `profile`. The OAuth flow redirects through the frontend consent page:

```text
https://strength-os-nu.vercel.app/oauth/consent
```

### Connect Codex

Add strengthOS to Codex as a hosted MCP server:

```bash
codex mcp add strengthos --url https://strengthos.onrender.com/mcp
codex mcp login strengthos --scopes openid,email,profile
```

If OAuth login is not available in your Codex environment, configure a bearer token from an environment variable:

```bash
export STRENGTHOS_SUPABASE_ACCESS_TOKEN=<supabase_access_token>
codex mcp add strengthos --url https://strengthos.onrender.com/mcp \
  --bearer-token-env-var STRENGTHOS_SUPABASE_ACCESS_TOKEN
```

### Connect With OpenAI Responses

For direct API usage through OpenAI Responses, configure the MCP tool with the hosted server URL:

```python
tools=[{
    "type": "mcp",
    "server_label": "strengthos",
    "server_url": "https://strengthos.onrender.com/mcp",
    "headers": {"Authorization": f"Bearer {access_token}"},
}]
```

### Connect Claude

In Claude's custom connectors UI, add a custom web connector with:

```text
Name: strengthOS
Remote MCP server URL: https://strengthos.onrender.com/mcp
```

Then connect/authenticate the connector when Claude prompts. Team and Enterprise workspaces may require an owner to add the connector before members can connect it.

For Claude Code, add the hosted HTTP MCP server:

```bash
claude mcp add --transport http strengthos https://strengthos.onrender.com/mcp
```

If your Claude client does not complete OAuth discovery, provide a current Supabase access token explicitly:

```bash
claude mcp add --transport http strengthos https://strengthos.onrender.com/mcp \
  --header "Authorization: Bearer <supabase_access_token>"
```

### Available Tools/endpoints

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
- `get_user_profile`
- `get_user_training_context`

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

## Docker And Render

Build the backend image:

```bash
cd backend
docker build -t strengthos-backend .
```

Run locally:

```bash
docker run --env-file .env -p 8000:8000 strengthos-backend
```

Deploy the backend to Render as a Web Service. Either:

- Leave the root directory at the repo root and use the root `Dockerfile`, or
- Set the root directory to `backend` and use `backend/Dockerfile`.

The container starts with:

```bash
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

Render should expose `/health` and `/mcp` from the same backend process.
