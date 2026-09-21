import { useEffect, useState } from 'react'

/**
 * Time on court as people say it: "42 min", or "1h 05m" from an hour up. Under a minute is
 * "under 1 min". Whole minutes are rounded down, so it never claims more than was played.
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60)
  if (minutes < 1) return 'under 1 min'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

/** The current time (ms), refreshed every `intervalMs`. Only the component that calls it re-renders. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
