import { migrateLegacyStorage } from '@/lib/legacyStorage'

// Runs once, when the app starts, before the stores are created (see main.tsx).
migrateLegacyStorage()
