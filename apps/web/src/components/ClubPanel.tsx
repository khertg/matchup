import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { toCloudError } from '@/cloud/api'
import { useClubAuth } from '@/cloud/auth'
import { cloud } from '@/cloud/client'
import { parseFullBackup } from '@/cloud/snapshot'
import { isValidSlug, slugify, viewerUrl } from '@/cloud/slug'
import { SharePanel } from '@/components/SharePanel'
import { SyncBadge } from '@/components/SyncBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SessionState } from '@/rotation/types'
import { useSessionStore } from '@/store/session'

const MIN_PASSWORD_LENGTH = 4

function CreateClubDialog() {
  const signIn = useClubAuth((s) => s.signIn)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const slug = slugify(name)
  const valid = name.trim() !== '' && password.length >= MIN_PASSWORD_LENGTH

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!cloud || !valid) return
    setBusy(true)
    setError(null)
    try {
      const token = await cloud.createClub(name.trim(), slug, password)
      signIn({ slug, name: name.trim(), token })
      toast(`Club created. Players can follow along at ${viewerUrl(slug)}`)
      setOpen(false)
      setName('')
      setPassword('')
    } catch (err) {
      setError(toCloudError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" className="h-11">
          Create a club
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a club</DialogTitle>
          <DialogDescription>
            Your club gets its own link. Staff sign in on any device with the club link name and
            password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="club-name">Club name</Label>
            <Input
              id="club-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
            {name.trim() !== '' && (
              <p className="text-sm text-muted-foreground">
                Link: <span className="font-mono">{`/club/${slug}`}</span>
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="club-password">Password (min. {MIN_PASSWORD_LENGTH} characters)</Label>
            <Input
              id="club-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="h-11 w-full" disabled={!valid || busy}>
            {busy ? 'Creating…' : 'Create club'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LoginDialog() {
  const signIn = useClubAuth((s) => s.signIn)
  const [open, setOpen] = useState(false)
  const [slug, setSlug] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const cleanSlug = slug.trim().toLowerCase()
  const valid = isValidSlug(cleanSlug) && password !== ''

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!cloud || !valid) return
    setBusy(true)
    setError(null)
    try {
      const token = await cloud.login(cleanSlug, password)
      const name = (await cloud.clubName(cleanSlug).catch(() => null)) ?? cleanSlug
      signIn({ slug: cleanSlug, name, token })
      setOpen(false)
      setSlug('')
      setPassword('')
    } catch (err) {
      setError(toCloudError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="h-11">
          Log in
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log in to your club</DialogTitle>
          <DialogDescription>Use the club link name, for example downtown-pickle-club.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-slug">Club link name</Label>
            <Input
              id="login-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="h-11 w-full" disabled={!valid || busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SignedIn() {
  const club = useClubAuth((s) => s.club)
  const signOut = useClubAuth((s) => s.signOut)
  const loadSession = useSessionStore((s) => s.loadSession)
  const [resumable, setResumable] = useState<{ location: string; session: SessionState } | null>(null)

  // Look for a session running on another staff device that this one could take over.
  useEffect(() => {
    if (!cloud || !club) return
    let cancelled = false
    cloud
      .fetchFullSession(club.token)
      .then((raw) => {
        if (!cancelled) setResumable(parseFullBackup(raw))
      })
      .catch(() => {
        if (!cancelled) setResumable(null)
      })
    return () => {
      cancelled = true
    }
  }, [club])

  if (!club) return null

  async function handleLogOut() {
    const token = club?.token
    signOut()
    // Best effort: the token also expires by itself after 30 days.
    if (cloud && token) await cloud.logout(token).catch(() => undefined)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{club.name}</span>
        <SyncBadge />
      </div>
      <p className="text-sm text-muted-foreground">
        Live link: <span className="font-mono">{`/club/${club.slug}`}</span>
      </p>
      {resumable && (
        <Button
          className="h-11 w-full"
          onClick={() => loadSession(resumable.location, resumable.session)}
        >
          Resume “{resumable.location}” from the cloud
        </Button>
      )}
      <div className="flex flex-wrap gap-2">
        <SharePanel />
        <Button variant="outline" onClick={handleLogOut}>
          Log out
        </Button>
      </div>
    </div>
  )
}

/** Optional cloud club sign-in on the setup screen. Hidden when Supabase is not configured. */
export function ClubPanel() {
  const club = useClubAuth((s) => s.club)
  if (!cloud) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cloud club</CardTitle>
        <CardDescription>
          Optional. Let players follow the queue live on their phones and keep all-time stats across
          devices.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {club ? (
          <SignedIn />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <CreateClubDialog />
            <LoginDialog />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
