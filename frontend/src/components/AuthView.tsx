import { useState } from 'react'
import { Dumbbell } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Button, Card, Input } from './ui'

export function AuthView() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setMessage(error?.message ?? '')
  }

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password })
    setMessage(error?.message ?? 'Check your email if confirmation is enabled.')
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md space-y-5">
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
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={signIn}>Sign in</Button>
          <Button className="bg-surface-elevated hover:bg-gray-700" onClick={signUp}>
            Sign up
          </Button>
        </div>
        {message ? <p className="text-sm text-gray-400">{message}</p> : null}
      </Card>
    </main>
  )
}
