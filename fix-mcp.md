The OAuth login URL correctly contains:

/login?returnTo=%2Foauth%2Fconsent%3Fauthorization_id%3D...

After login, the address bar does not automatically navigate. If I highlight the URL and press Enter, the consent page loads successfully.

Fix AuthView so that immediately after successful Supabase login it performs a real navigation to the validated returnTo path.

Prefer:

window.location.assign(returnTo)

instead of only updating React state or relying on an auth effect, because the OAuth consent flow should perform a full navigation reliably.

Requirements:
- Read returnTo from the login page query string.
- Validate that it begins with exactly one "/" and is not "//" or an external URL.
- After successful login, call window.location.assign(validReturnTo).
- Fall back to "/" only when returnTo is missing or invalid.
- Ensure no global authenticated-user redirect overrides returnTo.
- Do not change Supabase OAuth settings, ChatGPT configuration, or backend code.