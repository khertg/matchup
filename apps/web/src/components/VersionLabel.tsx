import { appBuild, appVersion } from '@/lib/version'

/** Which build this is, small and out of the way. It says which build a phone is really running. */
export function VersionLabel() {
  return (
    <p
      data-testid="app-version"
      title={`Q2Dink ${appBuild.version}, commit ${appBuild.commit}, built ${appBuild.date}`}
      className="shrink-0 whitespace-nowrap text-xs text-muted-foreground select-text"
    >
      {appVersion}
    </p>
  )
}
