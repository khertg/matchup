import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Toaster } from '@/components/ui/sonner'

export default function App() {
  return (
    <main className="mx-auto max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            Matchup <Badge>Beta</Badge>
          </CardTitle>
          <CardDescription>Pickleball open play manager</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={() => toast.success('Court 1 is ready')}>Start session</Button>
          <Button variant="outline">Check in players</Button>
        </CardContent>
      </Card>
      <Toaster />
    </main>
  )
}
