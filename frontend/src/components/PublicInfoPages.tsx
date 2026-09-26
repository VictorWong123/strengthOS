import { BackButton, MobileHeader, SecondaryButton, SurfaceCard } from './ui'

type PublicPageProps = {
  onNavigate: (pathname: string) => void
}

const SUPPORT_URL = 'https://github.com/VictorWong123/strengthOS/issues'

export function SupportPage({ onNavigate }: PublicPageProps) {
  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-6 px-4 py-6" aria-labelledby="support-title">
      <MobileHeader
        leftAction={<BackButton label="strengthOS" onClick={() => onNavigate('/')} />}
        title={<h1 id="support-title" className="text-3xl font-bold tracking-tight">Support</h1>}
        subtitle="Help with your account and workouts."
      />
      <SurfaceCard className="space-y-4">
        <h2 className="text-xl font-semibold">Get help</h2>
        <p className="text-sm text-text-secondary">Report a problem or ask a question through the project issue tracker.</p>
        <a
          className="inline-flex min-h-11 w-full items-center justify-center rounded-button border border-white/10 bg-surface-input px-4 py-3 font-semibold"
          href={SUPPORT_URL}
          target="_blank"
          rel="noreferrer"
        >
          Open support on GitHub
        </a>
        <p className="text-sm text-yellow-100">Never post passwords, access tokens, progress photos, or private health details.</p>
      </SurfaceCard>
      <SurfaceCard className="space-y-3 text-sm text-text-secondary">
        <h2 className="text-xl font-semibold text-text-primary">Common help</h2>
        <p><strong className="text-text-primary">Sign-in:</strong> use your strengthOS email and password. Sign in again if your session expired.</p>
        <p><strong className="text-text-primary">Offline changes:</strong> reconnect and keep the app open while pending workout changes sync.</p>
        <p><strong className="text-text-primary">Delete account:</strong> sign in, open Profile, then use Delete account.</p>
      </SurfaceCard>
      <SecondaryButton className="w-full" onClick={() => onNavigate('/privacy')}>View privacy information</SecondaryButton>
    </main>
  )
}

export function PrivacyPage({ onNavigate }: PublicPageProps) {
  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-6 px-4 py-6" aria-labelledby="privacy-title">
      <MobileHeader
        leftAction={<BackButton label="strengthOS" onClick={() => onNavigate('/')} />}
        title={<h1 id="privacy-title" className="text-3xl font-bold tracking-tight">Privacy</h1>}
        subtitle="How strengthOS uses your data."
      />
      <SurfaceCard className="space-y-3">
        <h2 className="text-xl font-semibold">Data used by strengthOS</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-text-secondary">
          <li>Supabase manages email/password authentication and stores your account, workouts, routines, exercises, sets, profile, and optional body measurements.</li>
          <li>Progress photos are private, re-encoded to remove metadata, and stored in your account.</li>
          <li>Pending workout recovery data and preferences are stored on your device. Recovery data is scoped to your account.</li>
        </ul>
      </SurfaceCard>
      <SurfaceCard className="space-y-3">
        <h2 className="text-xl font-semibold">Services involved</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-text-secondary">
          <li>Vercel hosts the website. Render runs account, progress-photo, and exercise-media APIs.</li>
          <li>Supabase provides authentication, database, and private photo storage. ExerciseDB supplies exercise catalog media.</li>
          <li>Optional MCP connections can read your training data only after you approve access.</li>
        </ul>
      </SurfaceCard>
      <SurfaceCard className="space-y-3">
        <h2 className="text-xl font-semibold">Tracking and account deletion</h2>
        <p className="text-sm text-text-secondary">strengthOS has no advertising, cross-app tracking, payments, HealthKit, or notification SDKs.</p>
        <p className="text-sm text-text-secondary">Deleting your account from Profile removes your cloud account and data, then clears recovery data for that account from this device.</p>
      </SurfaceCard>
      <SecondaryButton className="w-full" onClick={() => onNavigate('/support')}>Get support</SecondaryButton>
    </main>
  )
}
