The OAuth login succeeds, but after login the browser remains on:

/login?returnTo=%2Foauth%2Fconsent%3Fauthorization_id%3D...

It does not automatically navigate to the decoded returnTo path.

Fix the login success flow so that after Supabase confirms authentication, it immediately performs:

window.location.assign(validatedReturnTo)

Requirements:
- Read returnTo from the current login page URL.
- Decode it once.
- Validate that it is an internal path beginning with "/" and not "//".
- After successful login, call window.location.assign(validatedReturnTo).
- Also handle the case where the user becomes authenticated through an auth-state listener rather than the direct login promise.
- Prevent any default redirect to "/" from overriding returnTo.
- Add temporary console logging for:
  - raw returnTo
  - validated returnTo
  - auth success
  - navigation target
- Remove the temporary logs after confirming the fix.
- Do not change Supabase OAuth settings, ChatGPT configuration, or backend code.