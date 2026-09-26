import { resolveReturnToFromSearch, type ReturnToResolution } from './returnTo'

const LOG_PREFIX = '[strengthOS oauth-login]'

type AuthRedirectSource = 'AuthView.signIn' | 'AuthView.onAuthStateChange' | 'App.loginSessionGuard'

function shouldLogAuthRedirect(resolution: ReturnToResolution): boolean {
  return window.location.pathname === '/login' && Boolean(resolution.rawReturnTo)
}

function logAuthRedirect(label: string, payload: Record<string, unknown>) {
  console.info(LOG_PREFIX, label, payload)
}

export function logAuthEvent(label: string, payload: Record<string, unknown> = {}) {
  const resolution = resolveReturnToFromSearch()
  if (!shouldLogAuthRedirect(resolution)) return
  logAuthRedirect(label, {
    rawSearch: resolution.rawSearch,
    rawReturnTo: resolution.rawReturnTo,
    parsedReturnTo: resolution.parsedReturnTo,
    validatedReturnTo: resolution.validatedReturnTo,
    ...payload,
  })
}

export function assignReturnToAfterAuth(source: AuthRedirectSource) {
  const resolution = resolveReturnToFromSearch()
  const target = new URL(resolution.validatedReturnTo, window.location.href).toString()
  if (shouldLogAuthRedirect(resolution)) {
    logAuthRedirect('window.location.assign target', {
      source,
      rawSearch: resolution.rawSearch,
      rawReturnTo: resolution.rawReturnTo,
      parsedReturnTo: resolution.parsedReturnTo,
      validatedReturnTo: resolution.validatedReturnTo,
      target,
    })
  }

  window.location.assign(target)
}
