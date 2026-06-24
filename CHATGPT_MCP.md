# ChatGPT MCP Connector

This document lists the deployed strengthOS MCP endpoint and the auth details needed to connect it from ChatGPT without manually pasting bearer tokens.

## ChatGPT connector fields

Use these values in ChatGPT developer-mode connector setup:

```text
Connector name: strengthOS
Description: Read authenticated strengthOS workout history, routines, strength progress, personal records, weekly summaries, and training context.
Connector URL: https://strengthos.onrender.com/mcp
```

If ChatGPT reports that the endpoint is not found, retry with the trailing slash form:

```text
https://strengthos.onrender.com/mcp/
```

The server is mounted at `/mcp`; some ASGI clients normalize mounted app paths with a trailing slash.

## Public endpoints

```text
GET  https://strengthos.onrender.com/health
GET  https://strengthos.onrender.com/.well-known/oauth-protected-resource
POST https://strengthos.onrender.com/mcp
```

Endpoint purposes:

```text
/health
Liveness check. Returns {"status":"ok"} when the Render service is running.

/.well-known/oauth-protected-resource
OAuth protected-resource metadata for ChatGPT and other MCP clients.

/mcp
FastMCP Streamable HTTP endpoint used by ChatGPT. Do not expect this to behave like a normal browser page.
```

## Authentication

The MCP tools require a Supabase user access token:

```text
Authorization: Bearer <supabase_user_access_token>
```

This token must be for the strengthOS user whose workout data should be read. ChatGPT should obtain it through Supabase OAuth, not by asking the user to paste it. The backend validates the token with Supabase Auth and derives the user id from the verified token. It does not accept a client-provided `user_id`.

Do not give ChatGPT or any browser client these backend-only secrets:

```text
SUPABASE_SERVICE_ROLE_KEY
ADMIN_API_KEY
EXERCISE_API_KEY
```

Those are Render server environment variables only.

## Render environment variables

The backend service should have these Render environment variables set:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<supabase anon or publishable key>
SUPABASE_SERVICE_ROLE_KEY=<server-only service role key>
FRONTEND_URL=https://<vercel-app-url>
FRONTEND_ORIGIN=https://<vercel-app-url>
BACKEND_PUBLIC_URL=https://strengthos.onrender.com
EXERCISE_API_PROVIDER=seed
EXERCISE_API_KEY=
EXERCISE_API_HOST=exercisedb.p.rapidapi.com
EXERCISE_API_BASE_URL=https://exercisedb.p.rapidapi.com
EXERCISE_SYNC_PAGE_SIZE=100
ADMIN_API_KEY=<server-only admin key>
EXERCISE_API_MAX_RETRIES=3
EXERCISE_API_MAX_RETRY_DELAY_SECONDS=30
```

## OAuth status for ChatGPT

ChatGPT can connect to an HTTPS MCP server by using the connector URL above. For authenticated user data, ChatGPT's OAuth linking flow expects:

```text
Protected resource metadata on the MCP server:
https://strengthos.onrender.com/.well-known/oauth-protected-resource

OAuth/OIDC metadata on the authorization server:
https://<project-ref>.supabase.co/auth/v1/.well-known/oauth-authorization-server
https://<project-ref>.supabase.co/auth/v1/.well-known/openid-configuration
```

The backend publishes the protected-resource metadata endpoint. When ChatGPT reaches `/mcp` without auth, the backend returns `401` with:

```text
WWW-Authenticate: Bearer resource_metadata="https://strengthos.onrender.com/.well-known/oauth-protected-resource"
```

Supabase OAuth 2.1 must be enabled for the project so ChatGPT can complete the user-linking flow without manually supplying a Supabase access token.

The frontend consent page is:

```text
https://strength-os-nu.vercel.app/oauth/consent
```

Supabase OAuth server settings:

```text
Site URL: https://strength-os-nu.vercel.app
Authorization Path: /oauth/consent
Redirect URLs:
http://localhost:5173/**
https://strength-os-nu.vercel.app/**
```

When ChatGPT shows its production redirect URI, add it to the Supabase OAuth client allowlist. ChatGPT redirect URIs use this shape:

```text
https://chatgpt.com/connector/oauth/<callback_id>
```

## Available MCP tools

The server currently advertises these read-only tools:

```text
get_recent_workouts
get_workout
get_exercise_history
get_strength_progress
get_weekly_training_summary
get_volume_by_muscle_group
get_personal_records
find_stagnating_exercises
find_undertrained_muscle_groups
get_current_routines
get_user_training_context
```

## Quick test prompt

After adding the connector in ChatGPT and linking auth, start a new chat, add the `strengthOS` connector, and ask:

```text
Use strengthOS to summarize my recent workouts and tell me what muscle groups look undertrained.
```
