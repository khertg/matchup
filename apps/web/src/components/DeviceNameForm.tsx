import { useEffect, useState, type FormEvent } from 'react'
import { AUDIT_LIMITS, parseDeviceName } from '@q2dink/shared'
import { toCloudError } from '@/cloud/api'
import { recordAudit } from '@/cloud/audit'
import { useClubAuth } from '@/cloud/auth'
import { cloud } from '@/cloud/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resolveDeviceLabel, shortDeviceId, useDevice } from '@/lib/device'

/**
 * Give this device its name in the club's activity log. The club refuses a name another of its devices
 * already has, so two identical phones never look the same there.
 */
export function DeviceNameForm({ submitLabel = 'Save name', onDone }: { submitLabel?: string; onDone?: () => void }) {
  const { id, name: current, label } = useDevice()
  const [name, setName] = useState(current ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = parseDeviceName(name) !== null

  useEffect(() => {
    void resolveDeviceLabel()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const club = useClubAuth.getState().club
    const clean = parseDeviceName(name)
    if (!cloud || !club || !clean) return
    setBusy(true)
    setError(null)
    try {
      const details = await resolveDeviceLabel()
      await cloud.registerDevice(club.token, { id, name: clean, label: details })
      const was = useDevice.getState().name
      useDevice.getState().setName(clean, club.slug)
      if (was !== clean) recordAudit('deviceNamed', was ? `Renamed this device from “${was}” to “${clean}”` : `Named this device “${clean}”`)
      onDone?.()
    } catch (err) {
      setError(toCloudError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        This device: {label ?? 'working it out…'} <span className="tabular-nums">{shortDeviceId(id)}</span>
      </p>
      <div className="space-y-2">
        <Label htmlFor="device-name">Device name</Label>
        <Input
          id="device-name"
          value={name}
          maxLength={AUDIT_LIMITS.deviceName}
          autoComplete="off"
          placeholder="For example: Front desk, or Maria's phone"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="h-11 w-full" disabled={!valid || busy}>
        {busy ? 'Saving…' : submitLabel}
      </Button>
    </form>
  )
}

/** Shown once after logging in, before anything else, until this device has a name for the club. */
export function DeviceNameGate() {
  return (
    <div className="mx-auto max-w-md pt-6 sm:pt-16">
      <Card>
        <CardHeader>
          <CardTitle>Name this device</CardTitle>
          <CardDescription>
            Everything done on this device is recorded in the club&apos;s activity log under this name, so staff can
            see which device did what. Two phones of the same kind need different names.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeviceNameForm submitLabel="Continue" />
        </CardContent>
      </Card>
    </div>
  )
}
