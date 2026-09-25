/**
 * Colours for the shared images (standings and stats cards). They are fixed colours, not theme
 * tokens, so an image looks the same whoever made it; the person sharing picks a preset or any colour.
 */
import { create } from 'zustand'

export interface CardPreset {
  id: string
  name: string
  from: string
  to: string
}

export const CARD_PRESETS: CardPreset[] = [
  { id: 'court', name: 'Court', from: '#14532d', to: '#16a34a' },
  { id: 'ocean', name: 'Ocean', from: '#1e3a8a', to: '#2563eb' },
  { id: 'sunset', name: 'Sunset', from: '#9a3412', to: '#f97316' },
  { id: 'grape', name: 'Grape', from: '#4c1d95', to: '#8b5cf6' },
  { id: 'berry', name: 'Berry', from: '#831843', to: '#ec4899' },
  { id: 'midnight', name: 'Midnight', from: '#0f172a', to: '#334155' },
]

export type CardChoice = { preset: string } | { custom: string }

export interface CardColors {
  background: string
  text: string
  /** Behind rows and stat boxes. */
  panel: string
  /** Whether the text is light, i.e. the background is dark. */
  lightText: boolean
}

export const DEFAULT_CARD_CHOICE: CardChoice = { preset: 'court' }

const WHITE: Omit<CardColors, 'background'> = { text: '#ffffff', panel: 'rgba(255,255,255,0.15)', lightText: true }
const DARK: Omit<CardColors, 'background'> = { text: '#0f172a', panel: 'rgba(0,0,0,0.08)', lightText: false }

const gradient = (from: string, to: string) => `linear-gradient(135deg, ${from} 0%, ${to} 100%)`

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) return 0
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The colour mixed with black (amount 0 to 1). */
export function darken(hex: string, amount: number): string {
  const rgb = parseHex(hex)
  return rgb ? toHex(rgb.map((c) => c * (1 - amount))) : hex
}

export function cardColors(choice: CardChoice): CardColors {
  if ('custom' in choice && parseHex(choice.custom)) {
    const to = choice.custom.toLowerCase()
    const from = darken(to, 0.55)
    // White text needs a dark enough background: judge by the lighter end of the gradient.
    const base = luminance(to) > 0.4 ? DARK : WHITE
    return { background: gradient(from, to), ...base }
  }
  const preset = CARD_PRESETS.find((p) => 'preset' in choice && p.id === choice.preset) ?? CARD_PRESETS[0]
  return { background: gradient(preset.from, preset.to), ...WHITE }
}

const STORAGE_KEY = 'q2dink-card-colors'

function readChoice(): CardChoice {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown
    if (saved && typeof saved === 'object') {
      if ('preset' in saved && typeof saved.preset === 'string') return { preset: saved.preset }
      if ('custom' in saved && typeof saved.custom === 'string' && parseHex(saved.custom)) return { custom: saved.custom }
    }
  } catch {
    // Unreadable or blocked storage: use the default.
  }
  return DEFAULT_CARD_CHOICE
}

interface CardChoiceStore {
  choice: CardChoice
  choose: (choice: CardChoice) => void
}

/** The colours last picked on this device, shared by both share dialogs so a club's images match. */
export const useCardChoice = create<CardChoiceStore>()((set) => ({
  choice: readChoice(),
  choose: (choice) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(choice))
    } catch {
      // Remembered for this visit only.
    }
    set({ choice })
  },
}))
