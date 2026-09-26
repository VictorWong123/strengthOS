# Security and performance audit

Date: September 25–26, 2026.

Scope: tracked frontend and backend code, Supabase migrations, dependency locks,
container configuration, and existing automated checks. No production data or
deployed configuration was changed. This review cannot establish that a system
has no vulnerabilities or that every workload is optimally tuned.

## Findings addressed

| Finding | Location | Remediation and evidence |
| --- | --- | --- |
| Medium: stale private state and queued work across account changes | `frontend/src/App.tsx` | Account-keyed state resets immediately; old mutation queues check the active account. A same-page account-switch regression verifies that the next user does not replay the previous user's pending mutations. Token refresh no longer reloads all account data. |
| Medium: photo processing blocks the event loop and consumes excessive memory | `backend/app/routers/progress_photos.py` | Admission occurs before reading the body and spans the Storage write. One upload per process, a 30-second body-read deadline, existing size/pixel limits, and off-thread sanitization bound resource use. Cancellation tests verify that repeated cancellation cannot admit another decode while the first worker remains active. |
| Low: image-fetch lock keys accumulate forever | `backend/app/routers/exercise_images.py` | Weak references reclaim unused locks while active callers retain strong references. A reclamation regression and the existing concurrent-fetch test verify cleanup and deduplication. |
| Medium: secrets can enter a remote Docker build context | `.dockerignore`, `backend/.dockerignore` | Exclude environment files, local credentials, dependencies, and caches; the repository-root context also excludes nested secret files. Verified by configuration review; no Docker engine was available. |
| Medium: OAuth consent and authenticated pages can be framed | `frontend/vercel.json` | Added `frame-ancestors 'none'`, `X-Frame-Options: DENY`, MIME sniffing protection, and an explicit referrer policy. Reviewed configuration; deployed response headers still need verification. |
| Dependency advisories, including High-rated development-tool findings | `frontend/package-lock.json`, `backend/uv.lock` | Updated compatible Vite/PostCSS/transitive packages and cryptography. Final npm audit and the audit of all 85 locked Python registry packages report zero known vulnerabilities. |
| Duplicate network authentication for MCP tools | `backend/app/main.py`, `backend/app/mcp/server.py` | Middleware stores the verified identity in request-owned state. Tools reuse it, with token validation as the fallback outside the mounted path. Mounted HTTP tests verify reuse; unauthenticated requests retain the OAuth challenge. No cross-request identity cache was added. |
| One signing request per private photo | `frontend/src/components/ProfilePage.tsx` | Uses one batch signing operation per history load, skips empty histories, and maps results by path. Browser checks cover multiple photos, reordered/partial results, upload, deletion, and failure handling. |
| Unindexed mutation-log foreign keys | `supabase/migrations/20260926035856_index_workout_operations.sql` | Added indexes on `(user_id, created_at)` and `(workout_id)` for owner queries and cascade lookups. Migration assertions pass. The migration has not been applied to a live database. |
| Container dependencies differ from audited lockfile | `Dockerfile`, `backend/Dockerfile` | Both install from `uv.lock` using a pinned uv version and frozen production dependency sync. Dependency installation precedes application copying for build-cache reuse. The locked environment was validated on Python 3.11; container builds remain unverified. |

Independent security review found no remaining actionable defects in the changed
paths after the cancellation and Docker-context corrections.

## Measured memory improvement

A synthetic 6000×4000 RGB JPEG, generated at quality 85, produced these local
measurements in separate Python processes on macOS:

| Measurement | Before | After |
| --- | ---: | ---: |
| Process peak resident memory | 437.8 MiB | 260.4 MiB |
| Sanitization elapsed time | 0.577 s | 0.574 s |
| Output size | 19,982 bytes | 19,982 bytes |

Peak memory fell about 40.5% by applying orientation in place and resizing before
color conversion. These process peaks include imports and fixture creation; one
synthetic image is not a production load test. Orientation, metadata stripping,
and transparency regressions pass. Concurrent uploads beyond the per-process
limit receive HTTP 503; users can retry the same selected file.

## Existing controls checked

- Backend user identity comes from a validated Supabase bearer token.
- Service-role analytics queries scope parent records to that identity before
  loading child records.
- Owner RLS protects application tables. Workout mutation functions use invoker
  permissions; privileged image-cache functions are restricted to the service
  role.
- Progress-photo metadata constrains each object path to its owner's UUID and
  photo UUID. Uploads are decoded and re-encoded to remove image metadata.
- Admin authentication uses constant-time key comparison. Exercise-provider
  credentials stay in the backend; image-cache paths use digests.
- Return-to redirects reject external origins and protocol-relative URLs.
- A scan of 166 tracked files found no private-key blocks, known secret-token
  prefixes, or embedded JWT literals. This was a pattern scan of current tracked
  files, not a complete Git-history or credential-validity audit.

## Remaining deployment and scaling checks

- Live Supabase RLS, Storage policies, grants, deployed migrations, and database
  query plans were not exercised against a running database. Local migration
  checks inspect SQL text and do not replace integration tests with two users.
- Production edge limits, TLS, allowed hosts, runtime/container image advisories,
  and secrets were outside local verification. Set `BACKEND_PUBLIC_URL` to the
  canonical HTTPS origin in deployment; the development fallback derives OAuth
  discovery URLs from the request host.
- Photo admission limits apply per backend process. Production ingress should
  also enforce appropriate per-user traffic limits.
- `workout_operations` retains mutation results for idempotent retries. Deleting
  old results requires an agreed retry window; this audit preserves that
  behavior. Monitor table size before introducing retention.
- Analytics materializes the requested history in memory, and combined training
  context repeats some reads. Exercise sync writes records sequentially to
  preserve per-record failure handling. Measure representative production
  workloads before changing those data flows or imposing new history limits.

## Dependency evidence

The initial npm audit identified five affected development packages:
`baseline-browser-mapping`, `browserslist`, `esbuild`, `nanoid`, and `postcss`.
The Python audit identified the same cryptography advisory twice for 49.0.0.
Its vulnerable PKCS#7 decryption API is not called by application code.

Upstream references:

- [esbuild Windows development-server advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-g7r4-m6w7-qqqr)
- [cryptography 50 release notes and CVE-2026-69247 fix](https://cryptography.io/en/latest/changelog/#v50-0-0)
- [Supabase batch signed-URL implementation](https://github.com/supabase/supabase-js/blob/master/packages/core/storage-js/src/packages/StorageFileApi.ts)

## Verification

- Backend pytest: 52 passed.
- Existing mocked browser suite: 72 passed, zero failures.
- Frontend production build and all three utility test scripts passed.
- Initial frontend JavaScript bundle: 601.29 kB, 170.20 kB gzip.

Final verification:

- `python -m pytest -q`: 58 passed on both Python 3.11 and Python 3.14.
- `ruff check app tests`: passed.
- `uv lock --check --offline`: passed; 86 packages including the project.
- `npm run test:browser`: 74 passed, zero failures, using synthetic users and
  mocked requests. The focused photo suite was rerun after the final input retry
  change: 7 passed, zero failures.
- `npm run build`, `npm run test:return-to`, `npm run test:training`, and
  `node tests/exerciseCatalog.test.mjs`: passed.
- `npm audit`: zero known vulnerabilities across 196 dependency entries.
- `pip-audit --no-deps --disable-pip`: zero known vulnerabilities across all 85
  registry packages in `uv.lock`, including platform-specific packages. Package
  versions were audited without installing them or applying environment markers.
- `git diff --check`: passed.
- Final frontend JavaScript bundle: 601.95 kB, 170.34 kB gzip. No bundle-size
  reduction is claimed.

The existing Vite bundle-size notice and third-party Starlette/httpx deprecation
warning remain. These checks do not establish production latency percentiles,
live database isolation, or container-image security. Apply the new additive
index migration through the normal deployment workflow and verify it there.
