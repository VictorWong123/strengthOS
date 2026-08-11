import { BackButton, MobileHeader, SecondaryButton, SurfaceCard } from './ui'

type PublicPageProps = {
  onNavigate: (pathname: string) => void
}

const SUPPORT_URL = 'https://github.com/VictorWong123/strengthOS/issues'

export function SupportPage({ onNavigate }: PublicPageProps) {
  return (
    <main className="space-y-6" aria-labelledby="support-title">
      <MobileHeader
        leftAction={<BackButton label="strengthOS" onClick={() => onNavigate('/')} />}
        title={<h1 id="support-title" className="text-3xl font-bold tracking-tight">Support</h1>}
        subtitle="Help with your strengthOS account and workouts."
      />

      <SurfaceCard className="space-y-4">
        <section aria-labelledby="support-contact-title">
          <h2 id="support-contact-title" className="text-xl font-semibold">Get help</h2>
          <p className="mt-2 text-sm text-text-secondary">Report a problem or ask a question through the project issue tracker.</p>
          <a
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-button border border-white/10 bg-surface-input px-4 py-3 text-base font-semibold text-text-primary transition hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            href={SUPPORT_URL}
            target="_blank"
            rel="noreferrer"
          >
            Open support on GitHub
          </a>
          <p className="mt-3 text-sm text-yellow-100">Never post passwords, access tokens, or private health or workout details.</p>
        </section>
      </SurfaceCard>

      <SurfaceCard className="space-y-4">
        <section aria-labelledby="support-basics-title">
          <h2 id="support-basics-title" className="text-xl font-semibold">Common help</h2>
          <dl className="space-y-3 text-sm text-text-secondary">
            <div>
              <dt className="font-semibold text-text-primary">Sign-in</dt>
              <dd className="mt-1">Use the email address and password from your strengthOS account. Try signing in again if your session has expired.</dd>
            </div>
            <div>
              <dt className="font-semibold text-text-primary">Offline</dt>
              <dd className="mt-1">strengthOS needs a connection to load and save workout changes. Reconnect, then retry the action.</dd>
            </div>
            <div>
              <dt className="font-semibold text-text-primary">Delete account</dt>
              <dd className="mt-1">Sign in, open Profile, then use the Delete account control to permanently remove your cloud account and workout data.</dd>
            </div>
          </dl>
        </section>
      </SurfaceCard>

      <SecondaryButton className="w-full" onClick={() => onNavigate('/privacy')}>View privacy information</SecondaryButton>
    </main>
  )
}

export function PrivacyPage({ onNavigate }: PublicPageProps) {
  return (
    <main className="space-y-6" aria-labelledby="privacy-title">
      <MobileHeader
        leftAction={<BackButton label="strengthOS" onClick={() => onNavigate('/')} />}
        title={<h1 id="privacy-title" className="text-3xl font-bold tracking-tight">Privacy</h1>}
        subtitle="What strengthOS uses to provide the app."
      />

      <SurfaceCard className="space-y-4">
        <section aria-labelledby="privacy-data-title">
          <h2 id="privacy-data-title" className="text-xl font-semibold">Data used by strengthOS</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-text-secondary">
            <li>Supabase stores your email, password authentication, and session information.</li>
            <li>Your optional profile information can include body metrics, training goals, experience, and limitations.</li>
            <li>Your workouts, routines, exercises, and sets are stored to provide your training history.</li>
            <li>Local preferences, such as dismissed interface hints, stay on your device.</li>
          </ul>
        </section>
      </SurfaceCard>

      <SurfaceCard className="space-y-4">
        <section aria-labelledby="privacy-services-title">
          <h2 id="privacy-services-title" className="text-xl font-semibold">Services involved</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-text-secondary">
            <li>Render runs the backend used for account deletion and exercise images.</li>
            <li>ExerciseDB supplies the exercise catalog and related media.</li>
            <li>Optional MCP connections can read your training data only after you approve access.</li>
          </ul>
        </section>
      </SurfaceCard>

      <SurfaceCard className="space-y-4">
        <section aria-labelledby="privacy-not-used-title">
          <h2 id="privacy-not-used-title" className="text-xl font-semibold">Not used in this app</h2>
          <p className="mt-2 text-sm text-text-secondary">strengthOS does not include advertising, tracking, payment, HealthKit, or notification SDKs.</p>
        </section>
      </SurfaceCard>

      <SurfaceCard className="space-y-4">
        <section aria-labelledby="privacy-deletion-title">
          <h2 id="privacy-deletion-title" className="text-xl font-semibold">Account deletion</h2>
          <p className="mt-2 text-sm text-text-secondary">Deleting your account from Profile removes your cloud account and workout data. Local preferences can remain until you clear the app’s data.</p>
        </section>
      </SurfaceCard>

      <SecondaryButton className="w-full" onClick={() => onNavigate('/support')}>Get support</SecondaryButton>
    </main>
  )
}
