/**
 * The two sides of a game are shown by colour: Blue is the first team (index 0), Orange the second.
 * Every visible name of a team comes from here, so the words and the colours always agree.
 */
export const TEAM_NAMES = ['Blue', 'Orange'] as const

/** A team's box: a soft tint of its colour with a coloured edge (tokens in index.css, for both themes). */
export const TEAM_BOX = [
  'border-l-4 border-team-blue bg-team-blue-soft',
  'border-l-4 border-team-orange bg-team-orange-soft',
] as const

/** A quiet button in the team's colour (the Won button): outlined, filled only lightly on hover. */
// Marked important (!): `cn` only joins class names, so without it the outline button's own
// background, border and hover colours (dark mode especially) would win by stylesheet order.
export const TEAM_BUTTON = [
  'border-team-blue/60! bg-card/70! text-team-blue! hover:bg-team-blue/10! dark:border-team-blue/40! dark:bg-transparent! dark:hover:bg-team-blue/15!',
  'border-team-orange/60! bg-card/70! text-team-orange! hover:bg-team-orange/10! dark:border-team-orange/40! dark:bg-transparent! dark:hover:bg-team-orange/15!',
] as const

/** Text in the team's colour, for scores and names in lists. */
export const TEAM_TEXT = ['text-team-blue', 'text-team-orange'] as const
