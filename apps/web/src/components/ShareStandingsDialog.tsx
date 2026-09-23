import { Download, Share2 } from 'lucide-react'
import { toBlob } from 'html-to-image'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useClubAuth } from '@/cloud/auth'
import { viewerUrl } from '@/cloud/url'
import { StandingsCard } from '@/components/StandingsCard'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { canShareNatively, downloadImages, shareImages } from '@/lib/share'
import { pageStandings, type Standing } from '@/rotation/standings'
import type { SessionState } from '@/rotation/types'
import { repeatStats } from '@/rotation/repeats'

interface Props {
  session: SessionState
  location: string
  standings: Standing[]
  date: string
  /** Whether repeat stats can be computed (the running session and saved ones; not the public viewer). */
  repeatStats?: boolean
}

export function ShareStandingsDialog({ session, location, standings, date, repeatStats: withRepeats = false }: Props) {
  const club = useClubAuth((s) => s.club)
  const url = club ? viewerUrl(club.slug) : undefined
  const pages = pageStandings(standings)
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const [busy, setBusy] = useState(false)

  const top = withRepeats ? repeatStats(session).summary.topPartnership : undefined
  const topPartnership = top
    ? { names: [session.players[top.a]?.name ?? 'Unknown', session.players[top.b]?.name ?? 'Unknown'] as [string, string], count: top.count }
    : undefined

  async function buildFiles(): Promise<File[]> {
    const files: File[] = []
    for (let i = 0; i < pages.length; i++) {
      const node = refs.current[i]
      if (!node) continue
      const blob = await toBlob(node, { pixelRatio: 3, cacheBust: true })
      if (!blob) throw new Error('no image')
      const suffix = pages.length > 1 ? `-${i + 1}-of-${pages.length}` : ''
      files.push(new File([blob], `q2dink-standings${suffix}.png`, { type: 'image/png' }))
    }
    return files
  }

  async function handleShare() {
    setBusy(true)
    try {
      const files = await buildFiles()
      await shareImages({
        files,
        title: 'Q2Dink standings',
        text: `Standings at ${location}`,
        url,
      })
    } catch {
      toast.error('Could not create the image. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload() {
    setBusy(true)
    try {
      downloadImages(await buildFiles())
    } catch {
      toast.error('Could not create the image. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied')
    } catch {
      toast.error('Could not copy. Select the link and copy it by hand.')
    }
  }

  const native = canShareNatively()
  const label = pages.length > 1 ? (native ? `Share ${pages.length} images` : `Download ${pages.length} images`) : native ? 'Share standings' : 'Download image'
  const downloadLabel = pages.length > 1 ? `Download ${pages.length} images instead` : 'Download image instead'

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Share2 /> Share standings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share standings</DialogTitle>
          <DialogDescription>
            {pages.length > 1
              ? `${pages.length} images of up to 10 players each, ready for a group chat.`
              : 'An image of the standings, ready for a group chat.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[50vh] flex-col items-center gap-3 overflow-y-auto rounded-lg">
          {pages.map((page, i) => (
            <StandingsCard
              key={i}
              ref={(el) => {
                refs.current[i] = el
              }}
              page={page}
              pageNumber={i + 1}
              pageCount={pages.length}
              location={location}
              date={date}
              topPartnership={i === pages.length - 1 ? topPartnership : undefined}
            />
          ))}
        </div>
        <Button className="h-11 w-full" onClick={handleShare} disabled={busy}>
          {native ? <Share2 /> : <Download />} {busy ? 'Creating image…' : label}
        </Button>
        {native && (
          <Button type="button" variant="ghost" className="w-full" onClick={handleDownload} disabled={busy}>
            <Download /> {downloadLabel}
          </Button>
        )}
        {url && (
          <div className="flex gap-2">
            <Input readOnly value={url} aria-label="Live board link" onFocus={(e) => e.target.select()} />
            <Button type="button" variant="outline" onClick={copyLink}>
              Copy link
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
