/**
 * 雨 — kanji rain. The game logic, kept free of React so it can be reasoned
 * about (and, one day, tested) on its own.
 *
 * It is a DISCRIMINATE card with the choices falling: an English meaning sits
 * at the bottom of the screen, four characters descend in four lanes, and the
 * learner taps the one that matches before it reaches the ground. A wrong tap
 * or a landing costs a life. Every wave is one graded FSRS review of the target
 * character, exactly as an arcade card would be — one pool, one scheduler.
 *
 * Only characters already in arcade state fall. The mode never teaches; it
 * drills, under more pressure than the session does. The etymology strip and
 * every other teaching aid stay out of it for the same reason they stay off
 * graded prompts (README, "Encounter only").
 */

import type { Corpus, Kanji } from '../data/corpus'
import type { ItemRow } from '../db/db'
import { modeFor } from '../srs/scheduler'
import { hash, mulberry32, pickDistinct, shuffled } from '../srs/rng'
import { clusterPeers, faceFor, strokeNeighbours } from '../cards/build'
import {
  RAIN_FALL_MAX_S,
  RAIN_FALL_MIN_S,
  RAIN_FLOOR_AT_WAVE,
  RAIN_LANES,
  RAIN_MAX_WAVES,
} from '../config'

export type DropState = 'falling' | 'hit' | 'wrong' | 'gone'

export interface Drop {
  id: number
  c: string
  lane: number
  /** 0 = top of the field, 1 = touching the ground */
  y: number
  target: boolean
  state: DropState
  /** seconds after the wave starts before this glyph enters the field */
  enterAt: number
}

export type Outcome = 'hit' | 'wrong' | 'missed'

export interface Wave {
  n: number
  kanji: Kanji
  item: ItemRow
  prompt: string
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
  return items.filter((i) => corpus.byChar.has(i.c) && modeFor(i) === 'arcade')
}

/**
 * Order a run: what is due first, then what was reviewed longest ago. The
 * game is more fun when it is also useful, and this is what makes each run
 * clear real reviews rather than re-drill yesterday's.
 */
export function planRun(pool: ItemRow[], now: Date, seed: number): ItemRow[] {
  const rand = mulberry32(seed)
  const t = now.getTime()
  const jitter = new Map(pool.map((i) => [i.c, rand()]))
  return pool
    .slice()
    .sort((a, b) => {
      const ad = a.due.getTime() <= t ? 0 : 1
      const bd = b.due.getTime() <= t ? 0 : 1
      if (ad !== bd) return ad - bd
      const al = a.last_review?.getTime() ?? 0
      const bl = b.last_review?.getTime() ?? 0
      if (al !== bl) return al - bl
      return (jitter.get(a.c) ?? 0) - (jitter.get(b.c) ?? 0)
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
  kanji: Kanji,
  item: ItemRow,
  n: number,
  seen: Set<string>,
): Wave {
  const rand = mulberry32(hash(`rain:${kanji.c}:${item.reps}:${n}`))
  const peers = clusterPeers(corpus, kanji)
  const pool = peers.length >= 3 ? peers : [...peers, ...strokeNeighbours(corpus, kanji, seen)]
  const wrong = pickDistinct(pool, RAIN_LANES - 1, rand, (c) => c)
  // never fewer than four: pad from the corpus so a wave cannot be easier
  for (const k of corpus.kanji) {
    if (wrong.length >= RAIN_LANES - 1) break
    if (k.c !== kanji.c && !wrong.includes(k.c)) wrong.push(k.c)
  }

  const chars = shuffled([kanji.c, ...wrong], rand)
  const lanes = shuffled(Array.from({ length: RAIN_LANES }, (_, i) => i), rand)
  const fall = fallSeconds(n)
  // glyphs enter one at a time; the target's turn in the order is random, so
  // the learner cannot learn to always tap the first (or the last) to appear
  const gap = fall * 0.16

  return {
    n,
    kanji,
    item,
    prompt: kanji.m[0],
    face: faceFor(kanji.c),
    drops: chars.map((c, i) => ({
      id: nextDropId++,
      c,
      lane: lanes[i],
      y: -0.2,
      target: c === kanji.c,
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
