/**
 * How many courts to put side by side: as many as fit (`max`), but balanced so rows are as even as
 * possible. Four courts where three fit make two rows of two, not three and one.
 */
export function courtColumns(count: number, max: number): number {
  if (count <= 0 || max <= 1) return 1
  const rows = Math.ceil(count / max)
  return Math.ceil(count / rows)
}
