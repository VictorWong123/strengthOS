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

## iPhone app (Capacitor)

strengthOS uses Capacitor to package the existing React app for iPhone. The React source, Supabase data, and FastAPI backend remain shared with the web app—there is no separate mobile frontend.

### Windows: shared app development

Use Windows for normal React work. Do not generate the Xcode project here.

```bash
cd frontend
npm ci
npm run test:return-to
npm run build
```

### Mac: sync and open iOS

`frontend/ios/` is tracked. On a Mac with Xcode and Node `>=22.12.0`:

```bash
cd frontend
npm ci
npm run ios:sync
npm run ios:open
```

The project uses bundle ID `io.github.victorwong123.strengthos`, version `1.0`, build `1`, iOS 15, iPhone-only, and portrait-only. Do not add `server.url`: app must package `dist/`, not display deployed website in a wrapper.

Set up automatic signing with an Apple Developer account, test on a physical iPhone, upload archive to TestFlight, and submit tested build for manual App Store release. If bundle ID is unavailable in Apple Developer, choose a unique replacement before creating App ID and update `frontend/capacitor.config.ts` to match.

### Production configuration

Create an ignored `frontend/.env.production.local` with the existing production Supabase URL and publishable key plus:

```text
VITE_API_URL=https://strengthos.onrender.com
```

Do not put service-role keys, admin keys, or ExerciseDB credentials in this file. On Render, keep `FRONTEND_URL=https://strength-os-nu.vercel.app`; backend always allows `capacitor://localhost`. Verify native CORS preflight after deployment:

```bash
curl -i -X OPTIONS https://strengthos.onrender.com/account -H "Origin: capacitor://localhost" -H "Access-Control-Request-Method: DELETE"
```

### Store release checklist

- The public privacy and support pages will be deployed at `https://strength-os-nu.vercel.app/privacy` and `https://strength-os-nu.vercel.app/support` through the existing Vercel rewrite.
- Icon and splash are installed from `frontend/resources/`; editable SVG sources remain beside PNGs.
- Create a dedicated App Review account with safe sample workout data and provide its sign-in instructions in App Store Connect.
- Prepare iPhone screenshots, Health & Fitness metadata, the privacy details, the encryption questionnaire, and TestFlight release notes from the actual shipped behavior.
