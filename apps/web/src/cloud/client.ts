import { createClient } from '@supabase/supabase-js'
import { createCloudApi, type CloudApi } from './api'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * The cloud API, or null when Supabase is not configured. With no credentials
 * the app runs fully on the device and hides every cloud feature.
 *
 * Only the public anon key is used here. Never put a service-role key in the app.
 */
export const cloud: CloudApi | null =
  url && anonKey
    ? createCloudApi(
        createClient(url, anonKey, {
          // Staff sign in with a club token, not Supabase Auth, so no auth session is kept.
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        }),
      )
    : null
