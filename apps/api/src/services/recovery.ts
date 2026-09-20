import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

// Crockford base32: no I, L, O or U, so codes are easy to read out and type.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** A random 100-bit code shown once to staff, e.g. `7K2M-9QXA-4T8D-HW3B-RN6P`. */
export function newRecoveryCode(): string {
  // 256 is a multiple of 32, so masking the low 5 bits gives every character equal odds.
  const chars = Array.from(randomBytes(20), (byte) => ALPHABET[byte & 31])
  return [0, 4, 8, 12, 16].map((i) => chars.slice(i, i + 4).join('')).join('-')
}

/** Ignore case, dashes and spaces, and map look-alike characters the way Crockford base32 does. */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

export const hashRecoveryCode = (code: string) =>
  createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex')

/** Constant-time comparison of two hex digests. */
export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
