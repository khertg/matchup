/** Club URL names: lowercase words joined by single dashes, 3 to 40 characters. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const MIN_SLUG_LENGTH = 3
export const MAX_SLUG_LENGTH = 40

export const isValidSlug = (slug: string) =>
  SLUG_PATTERN.test(slug) && slug.length >= MIN_SLUG_LENGTH && slug.length <= MAX_SLUG_LENGTH

/** Turn a club name into its URL name, e.g. "Downtown Pickle Club!" becomes "downtown-pickle-club". */
export function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')
  if (base.length >= MIN_SLUG_LENGTH) return base
  return base ? `${base}-club` : 'club'
}

/** The club URL name in a path like /club/downtown, or null for any other path. */
export function clubSlugFromPath(pathname: string): string | null {
  const match = /^\/club\/([a-z0-9-]+)\/?$/.exec(pathname)
  return match && isValidSlug(match[1]) ? match[1] : null
}
