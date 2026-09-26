import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ChartNoAxesCombined, House, LogOut, Trophy, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { TrendChart } from './charts/TrendChart'
import { DeleteTextButton, Field, IconButton, Input, MetricCard, MobileHeader, Pill, PrimaryButton, SecondaryButton, Select, SurfaceCard, Textarea } from './ui'
import type { BodyMeasurement, ProgressPhoto, Workout, WorkoutExercise, WorkoutSet } from '../lib/types'
import { isWorkingSet, loadedVolume } from '../lib/trainingMetrics'
import { clearAccountLocalStorage, finishPendingAccountCleanup, markPendingAccountCleanup } from '../lib/accountStorage'
import { clearUserMutations } from '../lib/offlineOutbox'

const PROFILE_COLUMNS = 'id, display_name, first_name, last_name, age, body_weight_lbs, height_inches, training_goal, training_experience, limitations'
const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
const MAX_PROGRESS_PHOTO_BYTES = 10 * 1024 * 1024

type StatusMessage = {
  tone: 'warning' | 'danger' | 'success'
  message: string
}

type ProfilePageProps = {
  session: Session | null
  banners: ReactNode
  workouts: Workout[]
  workoutExercises: WorkoutExercise[]
  sets: WorkoutSet[]
  onNavigate: (pathname: string) => void
  onStatus: (status: StatusMessage) => void
  onPrepareAccountDeletion: () => Promise<void>
}

type WorkoutPerformance = {
  workout: Workout
  volume: number
  maxWeight: number
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

function weeklyBodyweightAverage(measurements: BodyMeasurement[]) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  const values = measurements
    .filter((item) => item.bodyweight !== null && new Date(`${item.measured_at}T23:59:59`).getTime() >= cutoff)
    .map((item) => item.bodyweight as number)
  const source = values.length ? values : measurements.filter((item) => item.bodyweight !== null).slice(0, 1).map((item) => item.bodyweight as number)
  return source.length ? (source.reduce((sum, value) => sum + value, 0) / source.length).toFixed(1) : '—'
}

export function ProfilePage({ session, banners, workouts, workoutExercises, sets, onNavigate, onStatus, onPrepareAccountDeletion }: ProfilePageProps) {
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_PROFILE_DRAFT)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState(0)
  const [isDeleteConfirmed, setIsDeleteConfirmed] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([])
  const [photos, setPhotos] = useState<Array<ProgressPhoto & { url: string }>>([])
  const [measurementDraft, setMeasurementDraft] = useState({ measured_at: new Date().toISOString().slice(0, 10), bodyweight: '', chest: '', waist: '', hips: '', left_arm: '', left_thigh: '' })
  const deleteSliderRef = useRef<HTMLDivElement | null>(null)
  const workoutPerformance = useMemo(
    () => buildWorkoutPerformance(workouts, workoutExercises, sets),
    [sets, workoutExercises, workouts],
  )
  const bestVolumeWorkout = workoutPerformance.reduce<WorkoutPerformance | null>(
    (best, workout) => (!best || workout.volume > best.volume ? workout : best),
    null,
  )
  const strongestWorkout = workoutPerformance.reduce<WorkoutPerformance | null>(
    (best, workout) => (!best || workout.maxWeight > best.maxWeight ? workout : best),
    null,
  )
  const progressData = workoutPerformance.slice(-8).map((performance) => ({
    label: formatWorkoutDate(performance.workout),
    value: performance.volume,
  }))

  useEffect(() => {
    if (!session) {
      setDraft(EMPTY_PROFILE_DRAFT)
      return
    }
    void loadProfile(session.user.id)
    void loadTracking()
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

  async function loadTracking() {
    const [{ data: measurementRows, error }, { data: photoRows }] = await Promise.all([
      supabase.from('body_measurements').select('*').order('measured_at', { ascending: false }),
      supabase.from('progress_photos').select('*').order('measured_at', { ascending: false }),
    ])
    if (error) onStatus({ tone: 'danger', message: error.message })
    setMeasurements((measurementRows ?? []) as BodyMeasurement[])
    const photos = (photoRows ?? []) as ProgressPhoto[]
    if (!photos.length) {
      setPhotos([])
      return
    }
    const { data } = await supabase.storage.from('progress-photos').createSignedUrls(photos.map((photo) => photo.storage_path), 300)
    const urls = new Map((data ?? []).map((item) => [item.path, item.signedUrl ?? '']))
    setPhotos(photos.map((photo) => ({ ...photo, url: urls.get(photo.storage_path) ?? '' })))
  }

  async function saveMeasurement() {
    if (!session) return
    const payload = Object.fromEntries(Object.entries(measurementDraft).map(([key, value]) => [key, key === 'measured_at' ? value : value ? Number(value) : null]))
    if (!Object.entries(payload).some(([key, value]) => key !== 'measured_at' && value !== null)) {
      onStatus({ tone: 'warning', message: 'Enter at least one measurement.' })
      return
    }
    const { error } = await supabase.from('body_measurements').insert({ ...payload, user_id: session.user.id })
    if (error) onStatus({ tone: 'danger', message: error.message })
    else {
      onStatus({ tone: 'success', message: 'Measurement saved.' })
      await loadTracking()
    }
  }

  async function uploadPhoto(file: File) {
    if (!session || !apiUrl) {
      onStatus({ tone: 'danger', message: 'Photo service is not configured.' })
      return
    }
    if (!file.type.startsWith('image/')) {
      onStatus({ tone: 'warning', message: 'Choose an image file.' })
      return
    }
    if (file.size > MAX_PROGRESS_PHOTO_BYTES) {
      onStatus({ tone: 'warning', message: 'Photo must be 10 MB or smaller.' })
      return
    }
    let response: Response
    try {
      response = await fetch(`${apiUrl}/progress-photos?measured_at=${measurementDraft.measured_at}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${session.access_token}`, 'content-type': file.type || 'application/octet-stream' },
        body: file,
      })
    } catch {
      onStatus({ tone: 'danger', message: 'Photo upload failed. Check your connection and retry.' })
      return
    }
    if (!response.ok) {
      onStatus({ tone: 'danger', message: (await response.json().catch(() => null))?.detail ?? 'Photo upload failed.' })
      return
    }
    onStatus({ tone: 'success', message: 'Private photo saved.' })
    await loadTracking()
  }

  async function deleteMeasurement(id: string) {
    const { error } = await supabase.from('body_measurements').delete().eq('id', id)
    if (error) onStatus({ tone: 'danger', message: error.message })
    else await loadTracking()
  }

  async function deletePhoto(id: string) {
    if (!session || !apiUrl) return
    let response: Response
    try { response = await fetch(`${apiUrl}/progress-photos/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${session.access_token}` } }) }
    catch { onStatus({ tone: 'danger', message: 'Photo could not be deleted. Check your connection and retry.' }); return }
    if (!response.ok) onStatus({ tone: 'danger', message: 'Photo could not be deleted.' })
    else await loadTracking()
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Workout progress</h2>
            <p className="mt-1 text-sm text-text-secondary">Your strongest completed sessions.</p>
          </div>
          <ChartNoAxesCombined className="mt-1 h-5 w-5 text-accent-blue" aria-hidden="true" />
        </div>
        {workoutPerformance.length ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="Best volume"
                value={`${formatNumber(bestVolumeWorkout?.volume ?? 0)} lb`}
                detail={bestVolumeWorkout ? workoutLabel(bestVolumeWorkout.workout) : undefined}
                className="border border-white/10"
                valueClassName="text-2xl"
              />
              <MetricCard
                label="Heaviest lift"
                value={`${formatNumber(strongestWorkout?.maxWeight ?? 0)} lb`}
                detail={strongestWorkout ? workoutLabel(strongestWorkout.workout) : undefined}
                className="border border-white/10"
                valueClassName="text-2xl"
              />
            </div>
            <TrendChart title="Volume over time" unit="lb" data={progressData} tone="blue" />
          </>
        ) : (
          <div className="rounded-card border border-white/10 bg-surface-input p-5 text-center">
            <Trophy className="mx-auto h-5 w-5 text-text-secondary" aria-hidden="true" />
            <p className="mt-2 text-sm text-text-secondary">Complete weighted sets to see your best workouts and progress.</p>
          </div>
        )}
      </SurfaceCard>
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
      <SurfaceCard className="space-y-4">
        <div><h2 className="text-xl font-semibold">Measurements</h2><p className="mt-1 text-sm text-text-secondary">Dated bodyweight and circumference history.</p></div>
        <Input type="date" aria-label="Measurement date" value={measurementDraft.measured_at} onChange={(event) => setMeasurementDraft((current) => ({ ...current, measured_at: event.target.value }))} />
        <div className="grid grid-cols-2 gap-3">
          {([['bodyweight', 'Weight (lb)'], ['chest', 'Chest (in)'], ['waist', 'Waist (in)'], ['hips', 'Hips (in)'], ['left_arm', 'Arm (in)'], ['left_thigh', 'Thigh (in)']] as const).map(([key, label]) => (
            <Field key={key} label={label}><Input inputMode="decimal" value={measurementDraft[key]} onChange={(event) => setMeasurementDraft((current) => ({ ...current, [key]: event.target.value }))} /></Field>
          ))}
        </div>
        <PrimaryButton className="w-full" onClick={() => void saveMeasurement()}>Save measurement</PrimaryButton>
        {measurements.some((item) => item.bodyweight !== null) ? <TrendChart title="Bodyweight" unit="lb" data={measurements.filter((item) => item.bodyweight !== null).slice(0, 12).reverse().map((item) => ({ label: item.measured_at, value: item.bodyweight ?? 0 }))} tone="blue" /> : null}
        {measurements.some((item) => item.bodyweight !== null) ? <p className="text-sm text-text-secondary">7-day average: {weeklyBodyweightAverage(measurements)} lb</p> : null}
        <div className="space-y-2 text-sm text-text-secondary">
          {measurements.slice(0, 5).map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-surface-input px-3 py-2"><span>{item.measured_at}</span><span>{item.bodyweight !== null ? `${item.bodyweight} lb` : `${item.waist ?? '—'} in waist`}</span><DeleteTextButton label="Delete" onClick={() => void deleteMeasurement(item.id)} /></div>)}
        </div>
      </SurfaceCard>
      <SurfaceCard className="space-y-4">
        <div><h2 className="text-xl font-semibold">Private progress photos</h2><p className="mt-1 text-sm text-text-secondary">Images are re-encoded and stripped of metadata before storage.</p></div>
        <Input type="file" accept="image/*" aria-label="Progress photo" onChange={(event) => {
          const file = event.target.files?.[0]
          event.currentTarget.value = ''
          if (file) void uploadPhoto(file)
        }} />
        <div className="grid grid-cols-3 gap-2">{photos.map((photo) => photo.url ? <div key={photo.id}><img className="aspect-square rounded-xl object-cover" src={photo.url} alt={`Progress from ${photo.measured_at}`} /><DeleteTextButton className="mt-1 w-full justify-center" label="Delete" onClick={() => void deletePhoto(photo.id)} /></div> : null)}</div>
      </SurfaceCard>
      <SurfaceCard>
        <SecondaryButton className="w-full" onClick={() => supabase.auth.signOut()}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Logout
        </SecondaryButton>
      </SurfaceCard>
      <SurfaceCard className="space-y-3">
        <h2 className="text-xl font-semibold">Help &amp; legal</h2>
        <SecondaryButton className="w-full" onClick={() => window.location.assign('/support')}>Support</SecondaryButton>
        <SecondaryButton className="w-full" onClick={() => window.location.assign('/privacy')}>Privacy</SecondaryButton>
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

    await onPrepareAccountDeletion()
    clearAccountLocalStorage(localStorage, session.user.id, workouts.map((workout) => workout.id))
    markPendingAccountCleanup(localStorage, session.user.id)
    try {
      await clearUserMutations(session.user.id)
      finishPendingAccountCleanup(localStorage, session.user.id)
    } catch {
      // App startup retries cleanup while the durable marker remains.
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

function buildWorkoutPerformance(workouts: Workout[], workoutExercises: WorkoutExercise[], sets: WorkoutSet[]): WorkoutPerformance[] {
  const workoutById = new Map(workouts.map((workout) => [workout.id, workout]))
  const performanceByWorkoutId = new Map<string, WorkoutPerformance>()

  for (const workoutExercise of workoutExercises) {
    const workout = workoutById.get(workoutExercise.workout_id)
    if (!workout?.completed_at) continue

    for (const set of sets) {
      if (set.workout_exercise_id !== workoutExercise.id || !isWorkingSet(set)) continue
      const performance = performanceByWorkoutId.get(workout.id) ?? { workout, volume: 0, maxWeight: 0 }
      performance.volume += loadedVolume(set, workoutExercise.logging_mode)
      if (workoutExercise.logging_mode === 'weight_reps' || workoutExercise.logging_mode === 'weighted_bodyweight') performance.maxWeight = Math.max(performance.maxWeight, set.weight ?? 0)
      performanceByWorkoutId.set(workout.id, performance)
    }
  }

  return [...performanceByWorkoutId.values()].sort(
    (left, right) => workoutDateMs(left.workout) - workoutDateMs(right.workout),
  )
}

function workoutDateMs(workout: Workout): number {
  return new Date(workout.completed_at ?? workout.started_at).getTime()
}

function formatWorkoutDate(workout: Workout): string {
  return new Date(workout.completed_at ?? workout.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function workoutLabel(workout: Workout): string {
  return `${workout.name || 'Workout'} · ${formatWorkoutDate(workout)}`
}
