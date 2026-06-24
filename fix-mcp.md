Implement Supabase OAuth Server support for StrengthOS so ChatGPT can authenticate to the FastMCP server automatically.

Current production frontend:
https://strength-os-nu.vercel.app

Current MCP backend:
https://strengthos.onrender.com/mcp

Supabase OAuth Server is already enabled with:

Site URL:
https://strength-os-nu.vercel.app

Authorization Path:
/oauth/consent

Supabase Redirect URLs already include:

http://localhost:5173/**
https://strength-os-nu.vercel.app/**

Goal:

ChatGPT should redirect the user through the StrengthOS/Supabase login and consent flow, receive a valid Supabase access token, send that token to the MCP server, and let the backend identify the authenticated Supabase user automatically.

The final flow should be:

ChatGPT
→ Supabase OAuth authorization
→ StrengthOS consent page
→ Supabase access token
→ FastMCP bearer authentication
→ authenticated user-scoped workout data

Requirements:

1. Add a React route at:

/oauth/consent

2. On the consent page:

- Read authorization_id from the URL query parameters.
- If authorization_id is missing, show a clear error state.
- Check the current Supabase auth session.
- If the user is not logged in, redirect to the existing login page.
- Preserve authorization_id and the intended return path during login.
- After login, return the user to:
  /oauth/consent?authorization_id=<same value>
- Use the Supabase OAuth authorization APIs supported by the installed supabase-js version.
- Retrieve and display the authorization request details.
- Show a clear consent screen explaining that an external AI client is requesting read access to the user’s StrengthOS workout data.
- Display the requesting client name if Supabase provides it.
- Show Allow and Deny buttons.
- On Allow, approve the authorization request and redirect to the URL returned by Supabase.
- On Deny, deny the authorization request and redirect to the URL returned by Supabase.
- Include loading, error, expired-request, and unauthenticated states.
- Do not expose access tokens, refresh tokens, authorization codes, or secrets in the UI, logs, or error messages.

3. Preserve login return state.

Update the existing login flow only as much as necessary so it can preserve a return URL.

For example:

/login?returnTo=%2Foauth%2Fconsent%3Fauthorization_id%3D...

After successful login, redirect to returnTo.

Validate that returnTo is an internal path to prevent open redirects.

Do not break normal login behavior.

4. Add OAuth protected-resource metadata to the FastAPI backend at:

/.well-known/oauth-protected-resource

Return JSON that identifies the MCP resource and Supabase authorization server.

Use environment configuration rather than hardcoding project IDs.

The response should contain fields equivalent to:

{
  "resource": "https://strengthos.onrender.com/mcp",
  "authorization_servers": [
    "<SUPABASE_URL>/auth/v1"
  ],
  "scopes_supported": [
    "openid",
    "email",
    "profile"
  ]
}

Confirm the exact metadata structure against the current OAuth protected-resource and MCP requirements supported by the installed libraries.

5. Add any additional OAuth discovery endpoint required by the current FastMCP or ChatGPT MCP integration.

Do not invent endpoints unnecessarily.

Inspect the current FastMCP version and official library behavior before implementation.

6. Ensure unauthenticated MCP requests return:

- HTTP 401
- A valid WWW-Authenticate header
- A reference to the protected-resource metadata endpoint

Example intent:

WWW-Authenticate: Bearer resource_metadata="https://strengthos.onrender.com/.well-known/oauth-protected-resource"

Use the exact syntax required by the current supported specification.

7. Preserve existing Supabase bearer-token validation.

Once ChatGPT sends a Supabase access token, the backend must:

- Verify the token signature and expiration.
- Confirm it was issued by the configured Supabase project.
- Derive the authenticated user ID from the token.
- Scope every MCP request to that user.
- Reject invalid, expired, or missing tokens.
- Never trust a user_id supplied by MCP tool arguments.
- Never use the service-role key as the user identity.

8. Review the MCP mounting and middleware order.

Ensure authentication middleware applies correctly to:

/mcp

But does not block:

/health
/.well-known/oauth-protected-resource

Do not break the current successful MCP initialize flow for authenticated requests.

9. Keep all existing MCP tools unchanged unless an authentication-context adjustment is required.

Do not modify:

- workout logic
- analytics logic
- database schema
- routine logic
- exercise synchronization
- tool behavior
- Supabase data model

10. Add frontend tests for:

- /oauth/consent renders
- missing authorization_id
- unauthenticated redirect to login
- authorization_id preservation
- safe returnTo handling
- authorization details loading
- approve flow
- deny flow
- API error state

11. Add backend tests for:

- protected-resource metadata endpoint
- public access to metadata endpoint
- unauthenticated /mcp returns 401
- WWW-Authenticate header is present and valid
- authenticated MCP request resolves the Supabase user
- invalid token is rejected
- expired token is rejected
- user ID cannot be overridden through tool arguments

12. Update environment documentation.

Frontend should continue using:

VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_API_URL

Backend should use existing Supabase settings and any new public base URL value required for OAuth metadata, such as:

BACKEND_PUBLIC_URL=https://strengthos.onrender.com
FRONTEND_URL=https://strength-os-nu.vercel.app

Do not hardcode production URLs when environment variables are appropriate.

13. Update README documentation with:

- Supabase OAuth Server setup
- Production Site URL
- Authorization Path
- Local and production redirect URLs
- OAuth consent route
- MCP protected-resource metadata
- ChatGPT connection flow
- How user identity is resolved
- How to test locally
- How to test in production
- How to reconnect the StrengthOS app in ChatGPT

14. Verification

Run:

cd frontend
npm install
npm run build

Run any configured frontend tests.

Then:

cd backend
pip install -e ".[dev]"
pytest

Start locally and verify:

http://localhost:8000/health
http://localhost:8000/.well-known/oauth-protected-resource
http://localhost:8000/mcp

Test the production flow after deployment:

Frontend:
https://strength-os-nu.vercel.app/oauth/consent

Backend:
https://strengthos.onrender.com/.well-known/oauth-protected-resource
https://strengthos.onrender.com/mcp

15. Final output

At completion, provide:

- Summary of implementation
- Files added
- Files modified
- New environment variables
- Frontend test results
- Backend test results
- Exact reconnect steps for ChatGPT
- Any remaining limitation caused by Supabase, FastMCP, Render, or ChatGPT

Important constraints:

- Do not rebuild the app.
- Do not change the database schema.
- Do not add Turso.
- Do not replace Supabase.
- Do not hardcode user IDs.
- Do not expose secrets.
- Do not store a manually copied bearer token.
- Do not require users to paste tokens into ChatGPT.
- Use OAuth so ChatGPT can obtain and refresh authentication automatically.