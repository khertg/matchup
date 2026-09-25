import { Download, Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isIos, isStandalone, useInstall } from '@/lib/install'

/**
 * A quiet, dismissible suggestion to install the app, shown only in a browser tab that can install it:
 * an Install button where the browser offers one, or the Share steps on iPhone and iPad.
 */
export function InstallBanner() {
  const { promptEvent, installed, dismissed, install, dismiss } = useInstall()
  const ios = isIos(navigator.userAgent, navigator.maxTouchPoints)
  if (installed || dismissed || isStandalone() || (!promptEvent && !ios)) return null

  return (
    <div role="region" aria-label="Install the app" className="mb-4 flex items-center gap-3 rounded-lg border bg-muted/50 p-3 text-sm">
      <Download className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        {promptEvent ? (
          'Install Q2Dink to open it with one tap, even offline.'
        ) : (
          <>
            Install Q2Dink: tap Share <Share className="inline size-4 align-text-bottom" aria-label="Share" />, then Add
            to Home Screen.
          </>
        )}
      </p>
      {promptEvent && (
        <Button size="sm" onClick={() => void install()}>
          Install
        </Button>
      )}
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={dismiss}>
        <X aria-hidden="true" />
      </Button>
    </div>
  )
}
