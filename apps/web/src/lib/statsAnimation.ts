/**
 * The shared stats card animation: the rank line rises in, the avatar pops in, the name and the lines
 * under it slide in, the four stat boxes pop in one after another, and for a medallist a light crosses
 * the name. The finished card holds before the GIF loops.
 */
import { lastFrame, type CardTiming, type PieceKind } from '@/lib/cardAnimation'

export type StatsPiece = 'rank' | 'avatar' | 'name' | 'finished' | 'title' | 'stat0' | 'stat1' | 'stat2' | 'stat3'

/** When each part of the card starts to arrive, and how. */
export const STATS_PIECES: Record<StatsPiece, { kind: PieceKind; start: number }> = {
  rank: { kind: 'slideUp', start: 0 },
  avatar: { kind: 'pop', start: 2 },
  name: { kind: 'slide', start: 4 },
  finished: { kind: 'slide', start: 6 },
  title: { kind: 'slide', start: 7 },
  stat0: { kind: 'pop', start: 9 },
  stat1: { kind: 'pop', start: 10 },
  stat2: { kind: 'pop', start: 11 },
  stat3: { kind: 'pop', start: 12 },
}

const PIECE_FRAMES = 6
const SHINE_FRAMES = 10
/** The light starts once the last stat box is in. */
export const STATS_SHINE_START = STATS_PIECES.stat3.start + PIECE_FRAMES

export const STATS_TIMING: CardTiming = {
  frameCount: STATS_SHINE_START + SHINE_FRAMES + 1,
  pieceFrames: PIECE_FRAMES,
  shineFrames: SHINE_FRAMES,
  frameMs: 70,
  holdMs: 2500,
  shineSamples: [STATS_SHINE_START + SHINE_FRAMES / 2],
}

export const STATS_LAST_FRAME = lastFrame(STATS_TIMING)
