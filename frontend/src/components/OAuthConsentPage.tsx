import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Bot, ShieldCheck, TriangleAlert } from 'lucide-react'
import { currentInternalPath } from '../lib/returnTo'
import { supabase } from '../lib/supabase'
import { Card, PrimaryButton, SecondaryButton } from './ui'

type OAuthClient = {
  name?: string
  uri?: string
  logo_uri?: string
}

type AuthorizationDetails = {
  authorization_id: string
  redirect_uri: string
  client: OAuthClient
  user?: {
    email?: string
  }
  scope?: string
}

type OAuthRedirect = {
  redirect_url: string
}

type OAuthConsentPageProps = {
  session: Session | null
  onNavigate: (path: string) => void
}

type PageState =
  | { name: 'loading' }
  | { name: 'missing-id' }
  | { name: 'error'; message: string }
  | { name: 'ready'; details: AuthorizationDetails }

export function OAuthConsentPage({ session, onNavigate }: OAuthConsentPageProps) {
  const [state, setState] = useState<PageState>({ name: 'loading' })
  const [decisionPending, setDecisionPending] = useState<'allow' | 'deny' | null>(null)
  const authorizationId = new URLSearchParams(window.location.search).get('authorization_id')

  useEffect(() => {
    let cancelled = false

    async function loadAuthorizationDetails() {
      if (!authorizationId) {
        setState({ name: 'missing-id' })
        return
      }

      if (!session) {
        onNavigate(`/login?returnTo=${encodeURIComponent(currentInternalPath())}`)
        return
      }

      setState({ name: 'loading' })
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
      if (cancelled) return

      if (error) {
        setState({ name: 'error', message: sanitizeError(error.message) })
        return
      }

      if (data && 'redirect_url' in data) {
        window.location.assign((data as OAuthRedirect).redirect_url)
        return
      }

      if (data && 'authorization_id' in data) {
        setState({ name: 'ready', details: data as AuthorizationDetails })
        return
      }

      setState({ name: 'error', message: 'This authorization request could not be loaded.' })
    }

    void loadAuthorizationDetails()

    return () => {
      cancelled = true
    }
  }, [authorizationId, session])

  async function decide(decision: 'allow' | 'deny') {
    if (!authorizationId) return
    setDecisionPending(decision)
    const request =
      decision === 'allow'
        ? supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })

    const { data, error } = await request
    if (error) {
      setDecisionPending(null)
      setState({ name: 'error', message: sanitizeError(error.message) })
      return
    }

    if (!data?.redirect_url) {
      setDecisionPending(null)
      setState({ name: 'error', message: 'Supabase did not return a redirect URL for this request.' })
      return
    }

    window.location.assign(data.redirect_url)
  }

  return (
    <main className="min-h-screen bg-surface-page px-4 py-8 text-text-primary">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-lg items-center">
        <Card className="w-full space-y-5">
          {state.name === 'loading' ? (
            <ConsentShell icon={<ShieldCheck className="h-6 w-6" aria-hidden="true" />} title="Loading authorization request">
              <p className="text-sm text-text-secondary">Checking your strengthOS session and the ChatGPT access request.</p>
            </ConsentShell>
          ) : null}

          {state.name === 'missing-id' ? (
            <ConsentShell icon={<TriangleAlert className="h-6 w-6" aria-hidden="true" />} title="Missing authorization request">
              <p className="text-sm text-text-secondary">Open this page from ChatGPT so strengthOS can receive an authorization request.</p>
            </ConsentShell>
          ) : null}

          {state.name === 'error' ? (
            <ConsentShell icon={<TriangleAlert className="h-6 w-6" aria-hidden="true" />} title="Authorization request unavailable">
              <p className="text-sm text-text-secondary">{state.message}</p>
            </ConsentShell>
          ) : null}

          {state.name === 'ready' ? (
            <>
              <ConsentShell icon={<Bot className="h-6 w-6" aria-hidden="true" />} title={`Allow ${state.details.client.name || 'this AI client'}?`}>
                <div className="space-y-3 text-sm text-text-secondary">
                  <p>
                    An external AI client is requesting read access to your strengthOS workout data so it can answer questions about your training.
                  </p>
                  <div className="rounded-card border border-white/10 bg-surface-input p-3">
                    <p className="font-medium text-text-primary">Requested access</p>
                    <p className="mt-1">Workout history, routines, strength progress, personal records, weekly summaries, and training context.</p>
                  </div>
                  <dl className="space-y-2">
                    <ConsentDetail label="Client" value={state.details.client.name || 'Unknown client'} />
                    <ConsentDetail label="Signed in as" value={state.details.user?.email || session?.user.email || 'Current strengthOS user'} />
                    <ConsentDetail label="Scopes" value={formatScopes(state.details.scope)} />
                  </dl>
                </div>
              </ConsentShell>

              <div className="grid grid-cols-2 gap-3">
                <SecondaryButton disabled={decisionPending !== null} onClick={() => void decide('deny')}>
                  {decisionPending === 'deny' ? 'Denying...' : 'Deny'}
                </SecondaryButton>
                <PrimaryButton disabled={decisionPending !== null} onClick={() => void decide('allow')}>
                  {decisionPending === 'allow' ? 'Allowing...' : 'Allow'}
                </PrimaryButton>
              </div>
            </>
          ) : null}
        </Card>
      </div>
    </main>
  )
}

function ConsentShell({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-button bg-surface-input text-accent-blue">{icon}</div>
        <div>
          <p className="text-sm font-medium text-text-muted">strengthOS authorization</p>
          <h1 className="text-xl font-semibold">{title}</h1>
        </div>
      </div>
      {children}
    </div>
  )
}

function ConsentDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-text-muted">{label}</dt>
      <dd className="break-words text-text-primary">{value}</dd>
    </div>
  )
}

function formatScopes(scope: string | undefined) {
  return scope?.trim().split(/\s+/).join(', ') || 'openid, email, profile'
}

function sanitizeError(message: string) {
  if (!message.trim()) return 'The authorization request may have expired. Start the connection again from ChatGPT.'
  return message.replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]')
}
