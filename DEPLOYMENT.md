# Deployment

This repo is ready for a split deployment:

- Frontend: Vercel, imported from `frontend/`.
- Backend: Render web service, imported from the repo root using the root `Dockerfile`, or from `backend/` using `backend/Dockerfile`.
- Database and auth: Supabase.

## Why Render for the backend

Use Render for the MVP backend. The backend is a long-running FastAPI/FastMCP Docker service, and ChatGPT needs a stable HTTPS `/mcp` endpoint with streaming behavior. Render web services support Docker, automatic TLS, health checks, logs, and simple environment variable management.

Cloud Run is also a good production platform, but it adds more IAM, artifact registry, and deployment setup. For this MVP, Render is the fastest path from pushed repo to a usable backend URL.

## Supabase

1. Create or open your Supabase project.
2. Apply every migration in `supabase/migrations/`.
3. Copy these values for deploy:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - frontend publishable key, usually the same value as the anon key

Do not expose `SUPABASE_SERVICE_ROLE_KEY` outside the backend host.

## Backend on Render

1. Push this repo to GitHub.
2. In Render, choose **New +** -> **Web Service**.
3. Connect this repo.
4. Set the environment to `Docker`.
5. Use one of these two valid layouts:
   - Repo root: leave the root directory empty and use the root `Dockerfile`.
   - Backend subdir: set root directory to `backend` and use `backend/Dockerfile`.
6. Fill these secret environment variables:

```text
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FRONTEND_URL=https://your-vercel-app.vercel.app
FRONTEND_ORIGIN=https://your-vercel-app.vercel.app
BACKEND_PUBLIC_URL=https://your-render-service.onrender.com
ADMIN_API_KEY=
EXERCISE_API_KEY=
```

Keep `EXERCISE_API_PROVIDER=seed` unless you are ready to sync from ExerciseDB. If you switch to ExerciseDB, set:

```text
EXERCISE_API_PROVIDER=exercisedb
EXERCISE_API_KEY=<rapidapi-key>
```

After the service deploys, verify:

```bash
curl https://your-render-service.onrender.com/health
```

Expected response:

```json
{"status":"ok"}
```

Your MCP endpoint is:

```text
https://your-render-service.onrender.com/mcp
```

## Frontend on Vercel

1. In Vercel, choose **Add New Project** and import this repo.
2. Set the project root directory to `frontend`.
3. Vercel will use `frontend/vercel.json`:
   - install: `npm ci`
   - build: `npm run build`
   - output: `dist`
   - SPA fallback rewrite to `index.html`
4. Set environment variables:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_API_URL=https://your-render-service.onrender.com
```

5. Deploy.
6. Copy the Vercel production URL back into Render as both `FRONTEND_URL` and `FRONTEND_ORIGIN`, then redeploy the backend.

## ChatGPT MCP connector

The backend already mounts FastMCP at `/mcp`. For API clients that can send headers, use:

```text
URL: https://your-render-service.onrender.com/mcp
Authorization: Bearer <supabase_access_token>
```

For ChatGPT developer-mode connectors:

1. Open ChatGPT settings.
2. Go to **Apps & Connectors** -> **Advanced settings** and enable developer mode if your organization allows it.
3. Go to **Settings** -> **Connectors** -> **Create**.
4. Use:

```text
Connector name: strengthOS
Description: Read authenticated workout history, routines, strength progress, personal records, and training summaries from strengthOS.
Connector URL: https://your-render-service.onrender.com/mcp
```

Important auth status: the current backend protects tool calls with Supabase bearer tokens. ChatGPT's production authenticated connector path expects OAuth 2.1-compatible MCP authorization discovery. So the HTTPS MCP endpoint is deploy-ready, but public ChatGPT user auth needs one more auth layer before store submission or broad use: either a Supabase-compatible OAuth bridge/custom authorization server, or a temporary private test flow through a client that can send the Supabase `Authorization` header.

Supabase Auth can serve as that OAuth 2.1 authorization server. Enable Supabase OAuth 2.1 for the project, enable dynamic client registration if you want ChatGPT to self-register, and keep `BACKEND_PUBLIC_URL` set. The backend exposes protected resource metadata at:

```text
https://your-render-service.onrender.com/.well-known/oauth-protected-resource
```

That metadata advertises:

```text
resource: https://your-render-service.onrender.com/mcp
authorization server: https://your-project.supabase.co/auth/v1
```

Do not remove MCP auth to make ChatGPT connection easier. These tools expose user-specific workout data.

## Deployment checklist

- Supabase migrations applied.
- Render backend deployed and `/health` returns `{"status":"ok"}`.
- Vercel frontend deployed from `frontend/`.
- Render `FRONTEND_URL` and `FRONTEND_ORIGIN` updated to the Vercel production origin.
- Vercel `VITE_API_URL` points to the Render origin, without a trailing slash.
- Render `BACKEND_PUBLIC_URL` points to the Render origin, without a trailing slash.
- ChatGPT connector URL points to `https://.../mcp`.
