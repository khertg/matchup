import { hash, verify } from '@node-rs/argon2'

// argon2id, the OWASP-recommended minimum: 19 MiB of memory, 2 passes, 1 lane.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 }

export const hashPassword = (password: string) => hash(password, OPTIONS)

/** False for a wrong password and also for a malformed stored hash; never throws. */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password)
  } catch {
    return false
  }
}

let dummy: Promise<string> | undefined

/**
 * A real hash to verify against when a club does not exist, so unknown clubs
 * take as long to reject as wrong passwords and timing reveals nothing.
 */
export const dummyHash = () => (dummy ??= hashPassword('this-is-not-anyones-password'))
