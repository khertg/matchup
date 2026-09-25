import { CARD_PRESETS, cardColors, useCardChoice } from '@/lib/cardPalette'
import { cn } from '@/lib/utils'

const SWATCH = 'size-7 shrink-0 rounded-full border ring-offset-2 ring-offset-background'
const SELECTED = 'ring-2 ring-foreground'
const RAINBOW = 'conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)'

/** Swatches for the shared images' colours: the presets, then any colour. */
export function CardColorPicker() {
  const { choice, choose } = useCardChoice()
  const custom = 'custom' in choice ? choice.custom : undefined

  return (
    <div role="radiogroup" aria-label="Colour" className="flex flex-wrap items-center justify-center gap-2">
      {CARD_PRESETS.map((preset) => {
        const selected = 'preset' in choice && choice.preset === preset.id
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={preset.name}
            title={preset.name}
            className={cn(SWATCH, selected && SELECTED)}
            style={{ background: cardColors({ preset: preset.id }).background }}
            onClick={() => choose({ preset: preset.id })}
          />
        )
      })}
      <label
        title="Custom colour"
        className={cn(SWATCH, 'relative cursor-pointer focus-within:ring-2 focus-within:ring-ring', custom && SELECTED)}
        style={{ background: custom ? cardColors({ custom }).background : RAINBOW }}
      >
        <input
          type="color"
          aria-label="Custom colour"
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          value={custom ?? '#16a34a'}
          onChange={(e) => choose({ custom: e.target.value })}
        />
      </label>
    </div>
  )
}
