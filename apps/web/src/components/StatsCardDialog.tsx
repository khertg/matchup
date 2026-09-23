import { Download, Share2 } from 'lucide-react'
import { toBlob } from 'html-to-image'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { StatsCard } from '@/components/StatsCard'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { canShareNatively, downloadImages, shareImages } from '@/lib/share'
import type { Standing } from '@/rotation/standings'

interface Props {
  standing: Standing
  location: string
  date: string
}

const fileSafe = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function StatsCardDialog({ standing, location, date }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const native = canShareNatively()

  async function buildFile(): Promise<File> {
    if (!cardRef.current) throw new Error('no card')
    const blob = await toBlob(cardRef.current, { pixelRatio: 3, cacheBust: true })
    if (!blob) throw new Error('no image')
    return new File([blob], `${fileSafe(standing.name) || 'player'}-q2dink-stats.png`, { type: 'image/png' })
  }

  async function handleShare() {
    setBusy(true)
    try {
      const file = await buildFile()
      await shareImages({ files: [file], title: `${standing.name}'s Q2Dink stats`, text: `Finished #${standing.rank} at ${location}` })
    } catch {
      toast.error('Could not create the image. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload() {
    setBusy(true)
    try {
      downloadImages([await buildFile()])
    } catch {
      toast.error('Could not create the image. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Share card for ${standing.name}`}>
          <Share2 />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Stats card</DialogTitle>
          <DialogDescription>
            A square image for Instagram, Facebook or WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center overflow-hidden rounded-lg">
          <StatsCard ref={cardRef} standing={standing} location={location} date={date} />
        </div>
        <Button className="h-11 w-full" onClick={handleShare} disabled={busy}>
          {native ? <Share2 /> : <Download />} {busy ? 'Creating image…' : native ? 'Share card' : 'Download image'}
        </Button>
        {native && (
          <Button type="button" variant="ghost" className="w-full" onClick={handleDownload} disabled={busy}>
            <Download /> Download image instead
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
