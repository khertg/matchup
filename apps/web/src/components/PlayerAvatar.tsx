import { useState } from 'react'
import { AvatarEditorDialog } from '@/components/AvatarEditorDialog'
import { AvatarViewDialog } from '@/components/AvatarViewDialog'
import { cn } from '@/lib/utils'
import { usePlayerAvatar, type ResolvedAvatar } from '@/lib/avatars'

/** Emoji fill more of the badge than letters do. */
const EMOJI_TEXT = { sm: 'text-sm', md: 'text-base', lg: 'text-3xl', xl: 'text-8xl' } as const

const SIZES = {
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-16 text-xl',
  xl: 'size-48 text-6xl',
} as const

interface ViewProps {
  avatar: ResolvedAvatar
  name: string
  size?: keyof typeof SIZES
  className?: string
}

/** The round picture itself: a photo, an emoji on a colour, or initials on a colour. */
export function AvatarView({ avatar, name, size = 'md', className }: ViewProps) {
  return (
    <span
      role="img"
      aria-label={`${name}'s avatar`}
      data-avatar-kind={avatar.kind}
      // The letters or emoji are drawn from these attributes, so they are never text in the page:
      // lists and screen readers see only the name and the avatar's label.
      data-initials={avatar.kind === 'initials' ? avatar.text : undefined}
      data-emoji={avatar.kind === 'emoji' ? avatar.value : undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold leading-none text-white select-none',
        avatar.kind === 'initials' && 'before:content-[attr(data-initials)]',
        avatar.kind === 'emoji' && 'before:content-[attr(data-emoji)]',
        SIZES[size],
        avatar.kind === 'emoji' && EMOJI_TEXT[size],
        className,
      )}
      style={avatar.kind === 'photo' ? undefined : { backgroundColor: avatar.color }}
    >
      {avatar.kind === 'photo' && (
        <img src={avatar.src} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
      )}
    </span>
  )
}

interface Props {
  /** The roster id, which finds this device's own avatar and lets staff change it. */
  id?: number
  name: string
  size?: keyof typeof SIZES
  /** Staff only: tap the avatar to see it large, and change it from there. Needs `id`. */
  editable?: boolean
  /** Anyone: tap the avatar to see it large (the players' live page, and Past sessions). */
  viewable?: boolean
  className?: string
}

/**
 * A player's avatar. Tapping it (when `editable` or `viewable`) opens a large view of the picture;
 * staff can change it from there.
 */
export function PlayerAvatar({ id, name, size = 'md', editable = false, viewable = false, className }: Props) {
  const avatar = usePlayerAvatar(id, name)
  const [viewing, setViewing] = useState(false)
  const [editing, setEditing] = useState(false)
  const canEdit = editable && id !== undefined

  if (!canEdit && !viewable) return <AvatarView avatar={avatar} name={name} size={size} className={className} />

  return (
    <>
      <button
        type="button"
        title="Tap to see the picture large"
        aria-label={`View ${name}'s avatar`}
        className={cn(
          'inline-flex shrink-0 rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          className,
        )}
        onClick={(e) => {
          // Inside a checkbox row, tapping the avatar must not tick the box.
          e.preventDefault()
          e.stopPropagation()
          setViewing(true)
        }}
      >
        <AvatarView avatar={avatar} name={name} size={size} />
      </button>
      <AvatarViewDialog
        name={name}
        avatar={avatar}
        open={viewing}
        onOpenChange={setViewing}
        onChange={
          canEdit
            ? () => {
                setViewing(false)
                setEditing(true)
              }
            : undefined
        }
      />
      {canEdit && <AvatarEditorDialog playerId={id} name={name} open={editing} onOpenChange={setEditing} />}
    </>
  )
}
