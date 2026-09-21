import { Download, Share2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
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

  async function handleDownload() {
    if (!cardRef.current) return
    setBusy(true)
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 3, cacheBust: true })
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `${fileSafe(standing.name) || 'player'}-q2dink-stats.png`
      link.click()
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
        <Button className="h-11 w-full" onClick={handleDownload} disabled={busy}>
          <Download /> {busy ? 'Creating image…' : 'Download image'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
