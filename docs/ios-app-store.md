# iPhone release guide

strengthOS uses Capacitor 8.5.0 to package the existing React app. The tracked Xcode project targets iOS 15+, iPhone portrait, bundle ID `io.github.victorwong123.strengthos`, marketing version `1.0`, and build `1`. It packages `frontend/dist`; do not add `server.url`.

## Build

Install current full Xcode and Node 22. Create ignored `frontend/.env.production.local` containing only:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
VITE_API_URL=https://YOUR_BACKEND
```

The validator rejects HTTP/local endpoints, unknown `VITE_` variables, service-role credentials, and remote-wrapper configuration.

```bash
cd frontend
npm ci
npm run test:native
npm run ios:sync
npm run ios:open
```

In Xcode, select the Apple Developer team, keep automatic signing enabled, and confirm the bundle ID is available. Increment `CURRENT_PROJECT_VERSION` for every upload. Build an Archive with the Release configuration, inspect Xcode's privacy report, then validate and upload it to App Store Connect.

## Required device checks

Run these on the physical iPhone using production endpoints before TestFlight and again with the TestFlight build:

- Create an account, confirm email, sign in, relaunch, sign out, and switch accounts.
- Create, edit, finish, repeat, and delete workouts and routines.
- Make workout changes offline, reconnect, and confirm only that account's pending changes sync.
- Start a rest timer, background and resume the app, confirm the deadline catches up, vibration fires, and Keep screen awake restores while enabled.
- Browse exercise images and videos over authenticated backend requests.
- Select and capture a progress photo; cancel the picker; try an unsupported or oversized image; delete the photo.
- Delete the account and confirm its local recovery data is gone while another account's local data remains.
- Check safe areas, keyboard overlap, VoiceOver labels, Dynamic Type legibility, and repeated photo/workout flows for memory growth.

## App Store Connect

Release is blocked until Apple Developer enrollment, signing, a public support email, and final legal/privacy review are complete. Use these public URLs after the website branch is deployed:

- Privacy policy: `https://strength-os-nu.vercel.app/privacy`
- Support: `https://strength-os-nu.vercel.app/support`

Deploy the backend CORS change and public website pages before submission. Then verify production preflights for every native backend surface; these live checks have not been run from this workspace:

```bash
curl -i -X OPTIONS https://strengthos.onrender.com/account -H "Origin: capacitor://localhost" -H "Access-Control-Request-Method: DELETE" -H "Access-Control-Request-Headers: authorization"
curl -i -X OPTIONS "https://strengthos.onrender.com/progress-photos?measured_at=2026-01-01" -H "Origin: capacitor://localhost" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type"
curl -i -X OPTIONS https://strengthos.onrender.com/exercise-images/EXERCISE_ID -H "Origin: capacitor://localhost" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: authorization"
```

Draft listing:

- Name: `strengthOS`
- Subtitle: `Track workouts and strength`
- Category: Health & Fitness
- Price: Free
- Platforms: iPhone
- Language: English

Suggested description:

> strengthOS is a focused workout tracker for planning routines, logging sets, and reviewing strength progress. Build reusable routines, track multiple exercise styles, run rest timers, review training history and muscle workload, and keep optional measurements and private progress photos with your account. Offline recovery preserves workout edits until you reconnect. No ads or subscription required.

Suggested keywords: `workout,strength,gym,lifting,routine,sets,reps,training,fitness,tracker`

Screenshot shot list using synthetic data:

1. Home dashboard with recent training and weekly summary.
2. Active workout with completed sets and rest timer.
3. Routine list and routine editor.
4. Exercise history or strength progress chart.
5. Profile measurements and private-photo section using a non-personal placeholder image.

Prepare screenshots from the tested build using synthetic workout data. Do not include personal email addresses, progress photos, access tokens, or real health data. Provide App Review with a dedicated test account, sign-in steps, account-deletion path (`Profile > Delete account`), and notes that camera/photo access is optional and used only for private progress photos.

Match App Store privacy answers to shipped behavior and `PrivacyInfo.xcprivacy`: email, name, user ID, health and fitness data, workout/routine notes, and optional photos are linked to the user's account for app functionality; there is no advertising or cross-app tracking. Complete the encryption questionnaire from the final archive and submit for manual release after TestFlight checks pass.

Repository verification completed on September 26, 2026: TypeScript production build passed, native configuration tests passed, Capacitor sync passed, all 59 backend tests passed, all 75 existing synthetic browser checks passed, and `npm audit` reported zero known vulnerabilities. CI is configured to run an unsigned simulator build and unsigned Release archive; treat those native builds as unverified until the new workflow completes successfully. Physical-device behavior, production preflights, signing, Xcode privacy report review, TestFlight, screenshots, public support email, App Store privacy answers, and App Review credentials remain release gates that require the owner's Apple account and iPhone.
