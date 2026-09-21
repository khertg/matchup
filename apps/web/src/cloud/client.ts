import type { CloudApi } from './api'
import { createHttpApi } from './httpApi'

/**
 * Where the Q2Dink API lives, for example `/api` (same origin, the normal
 * setup) or `https://example.com/api`. Leave it unset for a static-only
 * deployment and every cloud feature stays hidden.
 */
const apiUrl = import.meta.env.VITE_API_URL as string | undefined

/** The cloud API, or null when no API is configured. Without it the app runs fully on the device. */
export const cloud: CloudApi | null = apiUrl ? createHttpApi(apiUrl) : null
