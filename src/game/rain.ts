/**
 * 雨 — kanji rain. The game logic, kept free of React so it can be reasoned
 * about (and, one day, tested) on its own.
 *
 * It is the WHICH and LISTEN cards with the choices falling: a meaning sits at
 * the bottom of the screen — or a word is spoken — four written words descend
 * in four lanes, and the learner taps the one that matches before it reaches
 * the ground. A wrong tap or a landing costs a life. Every wave is one graded
 * FSRS review of the target word, exactly as an arcade card would be — one
 * pool, one scheduler.
 *
 * Only words already in arcade state fall. The mode never teaches; it drills,
 * under more pressure than the session does. The etymology strip and every
 * other teaching aid stay out of it for the same reason they stay off graded
 * prompts (README, "Encounter only").
 */

import type { Corpus, Vocab } from '../data/corpus'
import type { ItemRow } from '../db/db'
import { modeFor } from '../srs/scheduler'
import { hash, mulberry32, pickDistinct, shuffled } from '../srs/rng'
import { faceFor, wordPool } from '../cards/build'
import {
  RAIN_FALL_MAX_S,
  RAIN_FALL_MIN_S,
  RAIN_FLOOR_AT_WAVE,
  RAIN_LANES,
  RAIN_LISTEN_EVERY,
  RAIN_MAX_WAVES,
} from '../config'

export type DropState = 'falling' | 'hit' | 'wrong' | 'gone'

export interface Drop {
  id: number
  /** the written word */
  w: string
  lane: number
  /** 0 = top of the field, 1 = touching the ground */
  y: number
  target: boolean
  state: DropState
  /** seconds after the wave starts before this glyph enters the field */
  enterAt: number
}

export type Outcome = 'hit' | 'wrong' | 'missed'

export type PromptKind = 'meaning' | 'listen'

export interface Wave {
  n: number
  word: Vocab
  item: ItemRow
  /** the meaning shown, or the reading spoken */
  promptKind: PromptKind
  face: 'mincho' | 'gothic'
  drops: Drop[]
  /** field-heights per second */
  speed: number
  /** seconds since the wave began */
  elapsed: number
  outcome?: Outcome
  /** where the target was when it was hit, 0..1 — the speed grade */
  hitY?: number
  /** seconds since the outcome landed */
  since: number
}

/** Everything that may fall: in Review, past the graduation threshold. */
export function rainPool(corpus: Corpus, items: ItemRow[]): ItemRow[] {
  return items.filter((i) => corpus.byWord.has(i.w) && modeFor(i) === 'arcade')
}

/**
 * Order a run: what is due first, then what was reviewed longest ago. The
 * game is more fun when it is also useful, and this is what makes each run
 * clear real reviews rather than re-drill yesterday's.
 */
export function planRun(pool: ItemRow[], now: Date, seed: number): ItemRow[] {
  const rand = mulberry32(seed)
  const t = now.getTime()
  const jitter = new Map(pool.map((i) => [i.w, rand()]))
  return pool
    .slice()
    .sort((a, b) => {
      const ad = a.due.getTime() <= t ? 0 : 1
      const bd = b.due.getTime() <= t ? 0 : 1
      if (ad !== bd) return ad - bd
      const al = a.last_review?.getTime() ?? 0
      const bl = b.last_review?.getTime() ?? 0
      if (al !== bl) return al - bl
      return (jitter.get(a.w) ?? 0) - (jitter.get(b.w) ?? 0)
    })
    .slice(0, RAIN_MAX_WAVES)
}

/** Seconds for one glyph to cross the field. Shrinks as the run goes on. */
export function fallSeconds(wave: number): number {
  const t = Math.min(1, Math.max(0, (wave - 1) / RAIN_FLOOR_AT_WAVE))
  return RAIN_FALL_MAX_S - (RAIN_FALL_MAX_S - RAIN_FALL_MIN_S) * t
}

let nextDropId = 1

export function makeWave(
  corpus: Corpus,
  word: Vocab,
  item: ItemRow,
  n: number,
  seenKanji: Set<string>,
): Wave {
  const rand = mulberry32(hash(`rain:${word.w}:${item.reps}:${n}`))
  const promptKind: PromptKind = n % RAIN_LISTEN_EVERY === 0 ? 'listen' : 'meaning'
  // a homophone, or a word with the same gloss, would be a second right answer
  const pool = wordPool(corpus, word, seenKanji).filter((v) =>
    promptKind === 'listen' ? v.r !== word.r : v.m.toLowerCase() !== word.m.toLowerCase(),
  )
  const wrong = pickDistinct(pool.slice(0, 24), RAIN_LANES - 1, rand, (v) => v.w).map((v) => v.w)
  // never fewer than four: pad from the corpus so a wave cannot be easier
  for (const v of corpus.vocab) {
    if (wrong.length >= RAIN_LANES - 1) break
    if (v.w !== word.w && !wrong.includes(v.w)) wrong.push(v.w)
  }

  const chars = shuffled([word.w, ...wrong], rand)
  const lanes = shuffled(Array.from({ length: RAIN_LANES }, (_, i) => i), rand)
  const fall = fallSeconds(n)
  // glyphs enter one at a time; the target's turn in the order is random, so
  // the learner cannot learn to always tap the first (or the last) to appear
  const gap = fall * 0.16

  return {
    n,
    word,
    item,
    promptKind,
    face: faceFor(word.w),
    drops: chars.map((w, i) => ({
      id: nextDropId++,
      w,
      lane: lanes[i],
      y: -0.2,
      target: w === word.w,
      state: 'falling',
      enterAt: i * gap,
    })),
    speed: 1 / fall,
    elapsed: 0,
    since: 0,
  }
}

/** Advance the wave by dt seconds. Mutates in place; returns the outcome if
 *  this step produced one. */
export function stepWave(wave: Wave, dt: number): Outcome | undefined {
  wave.elapsed += dt
  if (wave.outcome) {
    wave.since += dt
    return undefined
  }
  let produced: Outcome | undefined
  for (const d of wave.drops) {
    if (d.state !== 'falling') continue
    const t = wave.elapsed - d.enterAt
    d.y = t <= 0 ? -0.2 : t * wave.speed
    if (d.y >= 1) {
      if (d.target) {
        wave.outcome = produced = 'missed'
        d.y = 1
      } else {
        d.state = 'gone'
      }
    }
  }
  return produced
}

/** The learner tapped a glyph. */
export function tapDrop(wave: Wave, id: number): Outcome | undefined {
  if (wave.outcome) return undefined
  const d = wave.drops.find((x) => x.id === id)
  if (!d || d.state !== 'falling' || d.y < 0) return undefined
  if (d.target) {
    d.state = 'hit'
    wave.outcome = 'hit'
    wave.hitY = Math.max(0, Math.min(1, d.y))
  } else {
    d.state = 'wrong'
    wave.outcome = 'wrong'
  }
  return wave.outcome
}

/** Points for a hit: more the higher it was caught, more on a combo. */
export function hitPoints(hitY: number, combo: number): number {
  return Math.round((100 + 100 * (1 - hitY)) * (1 + 0.1 * Math.min(combo, 10)))
}
