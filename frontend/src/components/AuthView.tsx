import { useState, type FormEvent } from 'react'
import { Dumbbell } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Button, Card, Input } from './ui'

type AuthViewProps = {
  returnTo?: string
  onAuthenticated?: (path: string) => void
}

export function AuthView({ returnTo = '/', onAuthenticated }: AuthViewProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('')
    onAuthenticated?.(returnTo)
  }

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password })
    setMessage(error?.message ?? 'Check your email if confirmation is enabled.')
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void (mode === 'sign-in' ? signIn() : signUp())
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <form className="w-full max-w-md" onSubmit={submit}>
        <Card className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-accent-blue p-2">
              <Dumbbell className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">strengthOS</h1>
              <p className="text-sm text-gray-400">Track training without subscription bloat.</p>
            </div>
          </div>
          <Input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="submit">{mode === 'sign-in' ? 'Sign in' : 'Sign up'}</Button>
            <p className="text-sm text-gray-400">
              {mode === 'sign-in' ? "Don't have an account? " : 'Already have an account? '}
              <button
                className="font-medium text-accent-blue hover:underline"
                type="button"
                onClick={() => {
                  setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
                  setMessage('')
                }}
              >
                {mode === 'sign-in' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
          {message ? <p className="text-sm text-gray-400">{message}</p> : null}
        </Card>
      </form>
    </main>
  )
}
