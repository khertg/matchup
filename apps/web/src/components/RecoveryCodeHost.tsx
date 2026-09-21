import { toast } from 'sonner'
import { useClubAuth } from '@/cloud/auth'
import { useRecoveryCode } from '@/cloud/recovery'
import { viewerUrl } from '@/cloud/url'
import { RecoveryCodeDialog } from '@/components/RecoveryCodeDialog'

/** The one place a new recovery code is shown, whichever screen created it. */
export function RecoveryCodeHost() {
  const code = useRecoveryCode((s) => s.code)
  const clear = useRecoveryCode((s) => s.clear)
  return (
    <RecoveryCodeDialog
      code={code}
      onDone={() => {
        clear()
        const club = useClubAuth.getState().club
        if (club) toast(`Players can follow along at ${viewerUrl(club.slug)}`)
      }}
    />
  )
}
