import { CreateClubDialog, LoginDialog } from '@/components/ClubPanel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * The first screen when a cloud is set up and nobody is logged in. Once a device is logged in the
 * login is kept, so the app opens and works with no signal; it is needed again only after logging
 * out or when the login expires.
 */
export function LoginGate() {
  return (
    <div className="mx-auto max-w-md pt-6 sm:pt-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Q2Dink</CardTitle>
          <CardDescription>
            Log in to your club to use Q2Dink. You need a connection the first time you log in on a
            device; after that it keeps working offline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            <LoginDialog />
            <CreateClubDialog />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
