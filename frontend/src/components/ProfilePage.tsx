import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { House, LogOut, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Field, IconButton, Input, MobileHeader, Pill, PrimaryButton, SecondaryButton, Select, SurfaceCard, Textarea } from './ui'

const PROFILE_COLUMNS = 'id, display_name, first_name, last_name, age, body_weight_lbs, height_inches, training_goal, training_experience, limitations'
const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')

type StatusMessage = {
  tone: 'warning' | 'danger' | 'success'
  message: string
}

type ProfilePageProps = {
  session: Session | null
  banners: ReactNode
  onNavigate: (pathname: string) => void
  onStatus: (status: StatusMessage) => void
}

type ProfileRow = {
  id: string
  display_name: string | null
  first_name: string | null
  last_name: string | null
  age: number | null
  body_weight_lbs: number | null
  height_inches: number | null
  training_goal: string | null
  training_experience: string | null
  limitations: string | null
}

type ProfileDraft = {
  displayName: string
  firstName: string
  lastName: string
  age: string
  bodyWeight: string
  heightFeet: string
  heightInches: string
  trainingGoal: string
  trainingExperience: string
  limitations: string
}

const EMPTY_PROFILE_DRAFT: ProfileDraft = {
  displayName: '',
  firstName: '',
  lastName: '',
  age: '',
  bodyWeight: '',
  heightFeet: '',
  heightInches: '',
  trainingGoal: '',
  trainingExperience: '',
  limitations: '',
}

export function ProfilePage({ session, banners, onNavigate, onStatus }: ProfilePageProps) {
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_PROFILE_DRAFT)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState(0)
  const [isDeleteConfirmed, setIsDeleteConfirmed] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const deleteSliderRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!session) {
      setDraft(EMPTY_PROFILE_DRAFT)
      return
    }
    void loadProfile(session.user.id)
  }, [session?.user.id])

  async function loadProfile(userId: string) {
    setIsLoading(true)

    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .limit(1)

    setIsLoading(false)

    if (error) {
      onStatus({ tone: 'danger', message: error.message })
      return
    }

    const profile = ((data ?? [])[0] ?? null) as ProfileRow | null
    setDraft(profile ? profileToDraft(profile) : EMPTY_PROFILE_DRAFT)
  }

  async function saveProfile() {
    if (!session) return

    const profilePayload = draftToProfilePayload(draft)
    if (!profilePayload.ok) {
      onStatus({ tone: 'warning', message: profilePayload.message })
      return
    }

    setIsSaving(true)
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: session.user.id,
        ...profilePayload.value,
        updated_at: new Date().toISOString(),
      })
      .select(PROFILE_COLUMNS)
      .single()

    setIsSaving(false)

    if (error) {
      onStatus({ tone: 'danger', message: error.message })
      return
    }

    onStatus({ tone: 'success', message: 'Profile saved.' })
  }

  return (
    <div className="space-y-6">
      <MobileHeader
        title={<h1 className="text-3xl font-bold tracking-tight">Profile</h1>}
        rightAction={
          <IconButton aria-label="Go home" onClick={() => onNavigate('/')}>
            <House className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        }
      />
      {banners}
      <SurfaceCard className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Account</h2>
          <p className="mt-2 text-sm text-text-secondary">{session?.user.email ?? ''}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name">
            <Input
              placeholder="Optional"
              value={draft.firstName}
              disabled={isLoading}
              onChange={(event) => setDraft((current) => ({ ...current, firstName: event.target.value }))}
            />
          </Field>
          <Field label="Last name">
            <Input
              placeholder="Optional"
              value={draft.lastName}
              disabled={isLoading}
              onChange={(event) => setDraft((current) => ({ ...current, lastName: event.target.value }))}
            />
          </Field>
        </div>
      </SurfaceCard>
      <SurfaceCard className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Body profile</h2>
          <p className="mt-1 text-sm text-text-secondary">Optional details for better workout context later.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Age">
            <Input
              inputMode="numeric"
              placeholder="Optional"
              value={draft.age}
              disabled={isLoading}
              onChange={(event) => setDraft((current) => ({ ...current, age: event.target.value }))}
            />
          </Field>
          <Field label="Weight">
            <Input
              inputMode="decimal"
              placeholder="lb"
              value={draft.bodyWeight}
              disabled={isLoading}
              onChange={(event) => setDraft((current) => ({ ...current, bodyWeight: event.target.value }))}
            />
          </Field>
          <Field label="Height">
            <div className="grid grid-cols-2 gap-2">
              <Input
                inputMode="numeric"
                placeholder="ft"
                value={draft.heightFeet}
                disabled={isLoading}
                onChange={(event) => setDraft((current) => ({ ...current, heightFeet: event.target.value }))}
              />
              <Input
                inputMode="decimal"
                placeholder="in"
                value={draft.heightInches}
                disabled={isLoading}
                onChange={(event) => setDraft((current) => ({ ...current, heightInches: event.target.value }))}
              />
            </div>
          </Field>
          <Field label="Goal">
            <Select
              value={draft.trainingGoal}
              disabled={isLoading}
              onChange={(event) => setDraft((current) => ({ ...current, trainingGoal: event.target.value }))}
            >
              <option value="">Optional</option>
              <option value="strength">Strength</option>
              <option value="muscle">Muscle gain</option>
              <option value="fat_loss">Fat loss</option>
              <option value="general_fitness">General fitness</option>
              <option value="performance">Performance</option>
            </Select>
          </Field>
        </div>
        <div className="grid gap-3">
          <Field label="Experience">
            <Select
              value={draft.trainingExperience}
              disabled={isLoading}
              onChange={(event) => setDraft((current) => ({ ...current, trainingExperience: event.target.value }))}
            >
              <option value="">Optional</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </Select>
          </Field>
          <Field label="Limitations">
            <Textarea
              className="min-h-[84px]"
              placeholder="Injuries, equipment limits, schedule, preferences"
              value={draft.limitations}
              disabled={isLoading}
              onChange={(event) => setDraft((current) => ({ ...current, limitations: event.target.value }))}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Pill>All optional</Pill>
            <Pill>Units: lb, ft/in</Pill>
          </div>
          <PrimaryButton className="min-w-32" disabled={isLoading || isSaving} onClick={() => void saveProfile()}>
            {isSaving ? 'Saving' : 'Save'}
          </PrimaryButton>
        </div>
      </SurfaceCard>
      <SurfaceCard className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Help &amp; legal</h2>
          <p className="mt-1 text-sm text-text-secondary">Support and privacy information.</p>
        </div>
        <SecondaryButton className="w-full" onClick={() => onNavigate('/support')}>Support</SecondaryButton>
        <SecondaryButton className="w-full" onClick={() => onNavigate('/privacy')}>Privacy</SecondaryButton>
      </SurfaceCard>
      <SurfaceCard>
        <SecondaryButton className="w-full" onClick={() => supabase.auth.signOut()}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Logout
        </SecondaryButton>
      </SurfaceCard>
      <SurfaceCard className="space-y-4 border-red-500/30">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-300">
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-red-100">Delete account</h2>
            <p className="mt-1 text-sm text-text-secondary">This permanently removes your account and workout data.</p>
          </div>
        </div>
        <div
          ref={deleteSliderRef}
          role="slider"
          tabIndex={0}
          aria-label="Confirm account deletion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(deleteProgress * 100)}
          className="relative h-14 touch-none rounded-button border border-white/10 bg-black/30 p-1 outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          onKeyDown={(event) => {
            if (event.key === 'Home') resetDeleteConfirmation()
            if (event.key === 'End') confirmDeleteSlider()
          }}
        >
          <div className="absolute inset-1 overflow-hidden rounded-[10px]">
            <div
              className="h-full bg-red-500/25"
              style={{ width: `${Math.round(deleteProgress * 100)}%` }}
            />
          </div>
          <div className="absolute inset-0 flex items-center justify-center px-14 text-sm font-semibold text-text-secondary">
            {isDeleteConfirmed ? 'Release to confirm' : 'Drag to confirm'}
          </div>
          <div
            className="absolute left-1 top-1 flex h-12 w-12 items-center justify-center rounded-[10px] bg-red-500 text-white shadow-lg transition-transform"
            style={{ left: `calc(4px + ${deleteProgress * 100}% - ${deleteProgress * 56}px)` }}
            onPointerDown={startDeleteSliderDrag}
          >
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
        <PrimaryButton
          className="w-full bg-accent-danger active:bg-red-600"
          disabled={!isDeleteConfirmed || isDeleting}
          onClick={() => void deleteAccount()}
        >
          {isDeleting ? 'Deleting' : 'Delete account'}
        </PrimaryButton>
      </SurfaceCard>
    </div>
  )

  function startDeleteSliderDrag(event: PointerEvent<HTMLDivElement>) {
    if (isDeleting) return
    const thumb = event.currentTarget
    thumb.setPointerCapture(event.pointerId)
    updateDeleteSlider(event.clientX)
    thumb.onpointermove = (moveEvent) => updateDeleteSlider(moveEvent.clientX)
    thumb.onpointerup = (upEvent) => {
      thumb.releasePointerCapture(upEvent.pointerId)
      thumb.onpointermove = null
      thumb.onpointerup = null
      thumb.onpointercancel = null
      setDeleteProgress((current) => {
        if (current >= 0.98) {
          setIsDeleteConfirmed(true)
          return 1
        }
        setIsDeleteConfirmed(false)
        return 0
      })
    }
    thumb.onpointercancel = () => {
      thumb.onpointermove = null
      thumb.onpointerup = null
      thumb.onpointercancel = null
      resetDeleteConfirmation()
    }
  }

  function updateDeleteSlider(clientX: number) {
    const track = deleteSliderRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const progress = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    setDeleteProgress(progress)
    setIsDeleteConfirmed(progress >= 0.98)
  }

  function resetDeleteConfirmation() {
    setDeleteProgress(0)
    setIsDeleteConfirmed(false)
  }

  function confirmDeleteSlider() {
    setDeleteProgress(1)
    setIsDeleteConfirmed(true)
  }

  async function deleteAccount() {
    if (!session || !isDeleteConfirmed) return

    setIsDeleting(true)
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (sessionError || !token) {
      setIsDeleting(false)
      onStatus({ tone: 'danger', message: sessionError?.message ?? 'Sign in again before deleting your account.' })
      return
    }

    let response: Response
    try {
      response = await fetch(`${apiUrl ?? '/api'}/account`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {
      setIsDeleting(false)
      resetDeleteConfirmation()
      onStatus({ tone: 'danger', message: 'Account could not be deleted.' })
      return
    }

    if (!response.ok) {
      setIsDeleting(false)
      resetDeleteConfirmation()
      onStatus({ tone: 'danger', message: 'Account could not be deleted.' })
      return
    }

    await supabase.auth.signOut()
  }
}

function profileToDraft(profile: ProfileRow): ProfileDraft {
  const heightFeet = profile.height_inches === null ? '' : String(Math.floor(profile.height_inches / 12))
  const heightInches = profile.height_inches === null ? '' : formatNumber(profile.height_inches % 12)

  return {
    displayName: profile.display_name ?? '',
    firstName: profile.first_name ?? '',
    lastName: profile.last_name ?? '',
    age: profile.age === null ? '' : String(profile.age),
    bodyWeight: profile.body_weight_lbs === null ? '' : formatNumber(profile.body_weight_lbs),
    heightFeet,
    heightInches,
    trainingGoal: profile.training_goal ?? '',
    trainingExperience: profile.training_experience ?? '',
    limitations: profile.limitations ?? '',
  }
}

function draftToProfilePayload(draft: ProfileDraft):
  | {
      ok: true
      value: Omit<ProfileRow, 'id'>
    }
  | { ok: false; message: string } {
  const age = parseOptionalNumber(draft.age)
  if (age === 'invalid' || (age !== null && (!Number.isInteger(age) || age < 1 || age > 120))) {
    return { ok: false, message: 'Enter a valid age or leave it blank.' }
  }

  const bodyWeight = parseOptionalNumber(draft.bodyWeight)
  if (bodyWeight === 'invalid' || (bodyWeight !== null && bodyWeight <= 0)) {
    return { ok: false, message: 'Enter a valid weight or leave it blank.' }
  }

  const heightFeet = parseOptionalNumber(draft.heightFeet)
  const heightInches = parseOptionalNumber(draft.heightInches)
  if (heightFeet === 'invalid' || heightInches === 'invalid') {
    return { ok: false, message: 'Enter a valid height or leave it blank.' }
  }
  if ((heightFeet !== null && heightFeet < 0) || (heightInches !== null && (heightInches < 0 || heightInches >= 12))) {
    return { ok: false, message: 'Enter height as feet plus inches from 0 to 11.' }
  }

  const totalHeight = heightFeet === null && heightInches === null ? null : (heightFeet ?? 0) * 12 + (heightInches ?? 0)
  if (totalHeight !== null && totalHeight <= 0) {
    return { ok: false, message: 'Enter a valid height or leave it blank.' }
  }

  return {
    ok: true,
    value: {
      display_name: displayNameFromDraft(draft),
      first_name: nullIfBlank(draft.firstName),
      last_name: nullIfBlank(draft.lastName),
      age,
      body_weight_lbs: bodyWeight,
      height_inches: totalHeight,
      training_goal: nullIfBlank(draft.trainingGoal),
      training_experience: nullIfBlank(draft.trainingExperience),
      limitations: nullIfBlank(draft.limitations),
    },
  }
}

function displayNameFromDraft(draft: ProfileDraft): string | null {
  const joined = [draft.firstName.trim(), draft.lastName.trim()].filter(Boolean).join(' ')
  return joined || nullIfBlank(draft.displayName)
}

function parseOptionalNumber(value: string): number | null | 'invalid' {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : 'invalid'
}

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}
