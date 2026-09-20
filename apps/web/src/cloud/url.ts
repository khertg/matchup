/** The public live-board address for a club, which players open from the QR code. */
export const viewerUrl = (slug: string, origin: string = window.location.origin) =>
  `${origin}/club/${slug}`
