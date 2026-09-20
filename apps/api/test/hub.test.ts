import type { LiveEvent } from '@matchup/shared'
import { describe, expect, it, vi } from 'vitest'
import { LiveHub, type Subscriber } from '../src/realtime'

const cleared: LiveEvent = { type: 'cleared' }
const subscriber = () => ({
  send: vi.fn<Subscriber['send']>(),
  close: vi.fn<Subscriber['close']>(),
})

describe('LiveHub', () => {
  it('delivers an event to everyone watching that club and no one else', () => {
    const hub = new LiveHub({ perIp: 10, total: 10 })
    const a1 = subscriber()
    const a2 = subscriber()
    const b = subscriber()
    hub.subscribe('club-a', '1.1.1.1', a1)
    hub.subscribe('club-a', '2.2.2.2', a2)
    hub.subscribe('club-b', '3.3.3.3', b)

    hub.publish('club-a', cleared)
    expect(a1.send).toHaveBeenCalledWith(cleared)
    expect(a2.send).toHaveBeenCalledWith(cleared)
    expect(b.send).not.toHaveBeenCalled()
  })

  it('stops delivering after unsubscribing, and unsubscribing twice is harmless', () => {
    const hub = new LiveHub({ perIp: 10, total: 10 })
    const sub = subscriber()
    const unsubscribe = hub.subscribe('club-a', '1.1.1.1', sub)!
    unsubscribe()
    unsubscribe()
    hub.publish('club-a', cleared)
    expect(sub.send).not.toHaveBeenCalled()
    expect(hub.count()).toBe(0)
  })

  it('refuses viewers beyond the per-address and total limits, and frees places on unsubscribe', () => {
    const hub = new LiveHub({ perIp: 2, total: 3 })
    const first = hub.subscribe('c', '1.1.1.1', subscriber())
    expect(hub.subscribe('c', '1.1.1.1', subscriber())).not.toBeNull()
    expect(hub.subscribe('c', '1.1.1.1', subscriber())).toBeNull() // per address
    expect(hub.subscribe('c', '2.2.2.2', subscriber())).not.toBeNull()
    expect(hub.subscribe('c', '3.3.3.3', subscriber())).toBeNull() // total
    expect(hub.count()).toBe(3)

    first!()
    expect(hub.subscribe('c', '1.1.1.1', subscriber())).not.toBeNull()
  })

  it('keeps going when one viewer’s connection is broken', () => {
    const hub = new LiveHub({ perIp: 10, total: 10 })
    const broken = subscriber()
    broken.send.mockImplementation(() => {
      throw new Error('socket closed')
    })
    const healthy = subscriber()
    hub.subscribe('c', '1.1.1.1', broken)
    hub.subscribe('c', '2.2.2.2', healthy)

    expect(() => hub.publish('c', cleared)).not.toThrow()
    expect(healthy.send).toHaveBeenCalledWith(cleared)
  })

  it('may be unsubscribed from inside a callback without skipping anyone', () => {
    const hub = new LiveHub({ perIp: 10, total: 10 })
    const later = subscriber()
    let unsubscribeFirst = () => {}
    unsubscribeFirst = hub.subscribe('c', '1.1.1.1', {
      send: () => unsubscribeFirst(),
      close: () => undefined,
    })!
    hub.subscribe('c', '2.2.2.2', later)
    hub.publish('c', cleared)
    expect(later.send).toHaveBeenCalledTimes(1)
  })

  it('closes every connection on shutdown, even if some fail to close', () => {
    const hub = new LiveHub({ perIp: 10, total: 10 })
    const a = subscriber()
    a.close.mockImplementation(() => {
      throw new Error('already closed')
    })
    const b = subscriber()
    hub.subscribe('club-a', '1.1.1.1', a)
    hub.subscribe('club-b', '2.2.2.2', b)
    expect(() => hub.closeAll()).not.toThrow()
    expect(a.close).toHaveBeenCalled()
    expect(b.close).toHaveBeenCalled()
  })
})
