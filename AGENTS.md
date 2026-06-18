# Repository Guidelines

## Project Structure & Module Organization

This repo is split into three main areas:

- `frontend/`: Vite React TypeScript app using Tailwind CSS and `supabase-js`.
- `backend/`: FastAPI backend for ExerciseDB synchronization, workout analytics, REST endpoints, and the FastMCP server. Supabase PostgreSQL is the sole database and source of truth.
- `supabase/migrations/`: Supabase Postgres schema, constraints, indexes, and RLS policies.

Backend source lives in `backend/app/`; backend tests live in `backend/tests/`. Frontend source lives in `frontend/src/`, with reusable UI in `frontend/src/components/` and shared helpers in `frontend/src/lib/`.

## Build, Test, and Development Commands

Frontend:

```bash
cd frontend
npm install
npm run dev
npm run build
```

- `npm run dev`: starts the Vite dev server.
- `npm run build`: runs TypeScript and produces a production build.

Backend:

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload
python -m app.scripts.sync_exercises
pytest
```

- `sync_exercises`: imports ExerciseDB or seed exercises into Supabase.

## Coding Style & Naming Conventions

Use TypeScript for frontend code and Python 3.11+ for backend code. Prefer small, focused modules and reusable components over duplicated class strings or repeated logic. React components use `PascalCase`; hooks/helpers use `camelCase`. Python modules and functions use `snake_case`.

Backend public modules, services, providers, and scripts should include useful docstrings that explain purpose, side effects, and failure behavior.

## Testing Guidelines

Backend tests use `pytest`; name files `test_*.py`. Add focused tests for providers, normalization, sync behavior, admin auth, Supabase repositories, authentication, user scoping, analytics, MCP tools, and ExerciseDB synchronization.

No frontend test runner is configured yet. Until one is added, `npm run build` is the required frontend verification step.

## Commit & Pull Request Guidelines

The current history does not establish a commit convention. Use short imperative commit messages, for example:

```text
Add Supabase workout schema
Protect admin sync endpoints
```

Pull requests should include a concise summary, verification commands run, screenshots for UI changes, and notes about migrations or environment variables.

## Security & Configuration Tips

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `EXERCISE_API_KEY` in frontend code. Browser code may use only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Keep ExerciseDB access backend-only. Supabase is the sole source of truth, and MCP reads are performed directly through authenticated backend services.
