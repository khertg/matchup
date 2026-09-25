import { useEffect, useState } from 'react'

/**
 * A duration as a clock, hours and minutes: "0:42", "1:05". Whole minutes are rounded down, so it
 * never claims more than was played, and nothing below a minute is shown (screens refresh every 30 s).
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
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
