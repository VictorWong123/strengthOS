# Next Steps

1. Install a real Python 3.11+ environment on this machine or activate the project backend virtualenv.

2. From `backend/`, install backend dependencies:

   ```bash
   pip install -e ".[dev]"
   ```

3. Run the backend test suite:

   ```bash
   pytest
   ```

4. Start the backend and verify local endpoints:

   ```bash
   uvicorn app.main:app --reload
   ```

   Check:

   ```text
   GET http://localhost:8000/health
   http://localhost:8000/mcp
   ```

5. Test an MCP client connection with a valid Supabase access token using:

   ```text
   Authorization: Bearer <supabase_access_token>
   ```

6. Run ExerciseDB synchronization against the intended provider:

   ```bash
   python -m app.scripts.sync_exercises
   ```

7. Add broader backend tests for:

   - FastMCP auth failures and successful user scoping
   - Invalid MCP `days` and `weeks` input ranges
   - Weekly summary, volume, records, stagnation, undertrained muscles, routines, and user context analytics
   - Exercise sync success and failure paths
   - Supabase auth network failure and missing-auth-config branches

8. Configure production backend environment variables:

   ```text
   SUPABASE_URL
   SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   FRONTEND_URL
   ADMIN_API_KEY
   EXERCISE_API_PROVIDER
   EXERCISE_API_KEY
   EXERCISE_API_HOST
   ```

9. Build and deploy the backend container to Cloud Run, then verify `/health` and `/mcp` in the deployed environment.
