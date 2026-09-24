import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { appBuild, appVersion, buildDetails } from '@/lib/version'

/**
 * Which build this is, small and out of the way: just the release, and a tap on it
 * shows the commit and build date (which build a phone is really running).
 */
export function VersionLabel() {
  const details = buildDetails(appBuild)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="app-version"
          title={`Q2Dink ${appBuild.version}, commit ${appBuild.commit}, built ${appBuild.date}`}
          className="shrink-0 cursor-pointer whitespace-nowrap rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {appVersion}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3 text-xs" data-testid="app-build-details">
        {details ? (
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Commit</dt>
            <dd className="font-mono select-text">{details.commit}</dd>
            {details.date && (
              <>
                <dt className="text-muted-foreground">Built</dt>
                <dd className="select-text">{details.date}</dd>
              </>
            )}
          </dl>
        ) : (
          <p>dev</p>
        )}
      </PopoverContent>
    </Popover>
  )
}
