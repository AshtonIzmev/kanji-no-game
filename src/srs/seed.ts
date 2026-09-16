/**
 * Placement. The teaching order is N5 first, fifteen words a day, hard — which
 * for someone who already passed N5 is ten sessions of being taught 日 and 一
 * before the first N4 character appears. That is how the app dies on day two.
 *
 * "Known" is a claim, so it is recorded as FSRS state rather than as a skip:
 * every word made only of the band's characters enters as a Review item with
 * a moderate stability and a first review spread over the next days. Each one
 * is then drilled once in arcade mode; a miss drops it into relearning like
 * any other lapse.
 */

import { State } from 'ts-fsrs'
import type { Corpus, Vocab } from '../data/corpus'
import { db, dayKey, setMeta, type ItemRow } from '../db/db'
import { hash, mulberry32 } from './rng'
import { KNOWN_SEED_SPREAD_DAYS, KNOWN_SEED_STABILITY_DAYS } from '../config'

/** Words written entirely with characters of the band. */
export function bandWords(corpus: Corpus, band: number): Vocab[] {
  return corpus.vocab.filter((v) => v.k.every((c) => corpus.byChar.get(c)?.jlpt === band))
}

/** Band words the learner has never met. */
export async function unseenInBand(corpus: Corpus, band: number): Promise<number> {
  const have = new Set((await db.items.toArray()).map((i) => i.w))
  return bandWords(corpus, band).filter((v) => !have.has(v.w)).length
}

/** Seed every unseen word of a band as already known. Returns how many. */
export async function markBandKnown(
  corpus: Corpus,
  band: number,
  now: Date = new Date(),
): Promise<number> {
  const have = new Set((await db.items.toArray()).map((i) => i.w))
  const targets = bandWords(corpus, band).filter((v) => !have.has(v.w))
  // deterministic for the day, so a double-tap cannot reshuffle the spread
  const rand = mulberry32(hash(`known:${band}:${dayKey(now)}`))

  const rows: ItemRow[] = targets.map((v) => {
    const inDays = rand() * KNOWN_SEED_SPREAD_DAYS
    return {
      w: v.w,
      due: new Date(now.getTime() + inDays * 86_400_000),
      stability: KNOWN_SEED_STABILITY_DAYS,
      // FSRS difficulty is 1..10; 5 is "no opinion yet"
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: Math.max(1, Math.round(inDays)),
      learning_steps: 0,
      reps: 1,
      lapses: 0,
      state: State.Review,
      last_review: now,
      // presented ≥ 1: a returning word is probed first and taught after
      presented: 1,
    }
  })

  await db.items.bulkPut(rows)
  await setMeta(`known:${band}`, now.toISOString())
  return rows.length
}
