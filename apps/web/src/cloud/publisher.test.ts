import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSession } from '@/rotation/engine'
import type { SessionState } from '@/rotation/types'
import { createPublisher, type SyncStatus } from './publisher'

const session = (courts = 1) => createSession('doubles', courts)

function setup(overrides: Partial<Parameters<typeof createPublisher>[0]> = {}) {
  const statuses: SyncStatus[] = []
  const state = { online: true }
  const publish = vi.fn<(location: string, session: SessionState) => Promise<void>>(async () => {})
  const clear = vi.fn(async () => {})
  const publisher = createPublisher({
    publish,
    clear,
    isOnline: () => state.online,
    setStatus: (s) => statuses.push(s),
    debounceMs: 500,
    retryMs: 5000,
    ...overrides,
  })
  return { publisher, publish, clear, statuses, state }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('createPublisher', () => {
  it('waits for a quiet period and sends only the latest state', async () => {
    const { publisher, publish, statuses } = setup()
    publisher.push('A', session(1))
    publisher.push('B', session(2))
    publisher.push('C', session(3))
    await vi.advanceTimersByTimeAsync(499)
    expect(publish).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish.mock.calls[0][0]).toBe('C')
    expect(publish.mock.calls[0][1].courts).toHaveLength(3)
    expect(statuses).toEqual(['syncing', 'synced'])
  })

  it('clears the cloud copy when the session ends', async () => {
    const { publisher, publish, clear } = setup()
    publisher.push('', null)
    await vi.advanceTimersByTimeAsync(500)
    expect(clear).toHaveBeenCalledTimes(1)
    expect(publish).not.toHaveBeenCalled()
  })

  it('holds the newest state while offline and sends it when back online', async () => {
    const { publisher, publish, statuses, state } = setup()
    state.online = false
    publisher.push('one', session(1))
    publisher.push('two', session(2))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(publish).not.toHaveBeenCalled()
    expect(statuses.at(-1)).toBe('offline')

    state.online = true
    publisher.onOnline()
    await vi.advanceTimersByTimeAsync(0)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish.mock.calls[0][0]).toBe('two')
    expect(statuses.at(-1)).toBe('synced')
  })

  it('retries after a failure and keeps the newest state', async () => {
    const { publisher, publish, statuses } = setup()
    publish.mockRejectedValueOnce(new Error('boom'))
    publisher.push('first', session(1))
    await vi.advanceTimersByTimeAsync(500)
    expect(statuses.at(-1)).toBe('error')

    publisher.push('second', session(2)) // arrives while a retry is pending
    await vi.advanceTimersByTimeAsync(500)
    expect(publish.mock.calls.at(-1)?.[0]).toBe('second')
    expect(statuses.at(-1)).toBe('synced')
  })

  it('retries the failed state after the retry delay when nothing newer arrives', async () => {
    const { publisher, publish } = setup()
    publish.mockRejectedValueOnce(new Error('boom'))
    publisher.push('only', session())
    await vi.advanceTimersByTimeAsync(500)
    expect(publish).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(publish).toHaveBeenCalledTimes(2)
    expect(publish.mock.calls[1][0]).toBe('only')
  })

  it('sends a change made during an in-flight send afterwards, never dropping it', async () => {
    let release: () => void = () => {}
    const { publisher, publish } = setup()
    publish.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
    publisher.push('first', session(1))
    await vi.advanceTimersByTimeAsync(500)
    expect(publish).toHaveBeenCalledTimes(1)

    publisher.push('second', session(2))
    await vi.advanceTimersByTimeAsync(500)
    expect(publish).toHaveBeenCalledTimes(1) // still waiting on the first

    release()
    await vi.advanceTimersByTimeAsync(500)
    expect(publish).toHaveBeenCalledTimes(2)
    expect(publish.mock.calls[1][0]).toBe('second')
  })

  it('gives up without retrying on a fatal error', async () => {
    const { publisher, publish, statuses } = setup({ isFatal: () => true })
    publish.mockRejectedValue(new Error('expired'))
    publisher.push('x', session())
    await vi.advanceTimersByTimeAsync(60_000)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(statuses.at(-1)).toBe('error')
  })

  it('does nothing after being disposed', async () => {
    const { publisher, publish } = setup()
    publisher.push('x', session())
    publisher.dispose()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(publish).not.toHaveBeenCalled()
  })
})
