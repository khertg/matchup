import { appBuild, appVersion } from '@/lib/version'

/** Which build this is, small and out of the way. It says which build a phone is really running. */
export function VersionLabel() {
  return (
    <p
      data-testid="app-version"
      title={`Matchup ${appBuild.version}, commit ${appBuild.commit}, built ${appBuild.date}`}
      className="mt-8 text-center text-xs text-muted-foreground select-text"
    >
      {appVersion}
    </p>
  )
}
