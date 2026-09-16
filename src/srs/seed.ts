/**
 * Placement. The teaching order is N5 first, fifteen a day, hard — which for
 * someone who already passed N5 is six sessions of being taught 日 and 一
 * before the first N4 character appears. That is how the app dies on day two.
 *
 * "Known" is a claim, so it is recorded as FSRS state rather than as a skip:
 * the characters enter as Review items with a moderate stability and a first
 * review spread over the next days. Each one is then drilled once in arcade
 * mode; a miss drops it into relearning like any other lapse.
 */

import { State } from 'ts-fsrs'
import type { Corpus } from '../data/corpus'
import { db, dayKey, setMeta, type ItemRow } from '../db/db'
import { hash, mulberry32 } from './rng'
import { KNOWN_SEED_SPREAD_DAYS, KNOWN_SEED_STABILITY_DAYS } from '../config'

/** Characters in the band the learner has never met. */
export async function unseenInBand(corpus: Corpus, band: number): Promise<number> {
  const have = new Set((await db.items.toArray()).map((i) => i.c))
  return corpus.kanji.filter((k) => k.jlpt === band && !have.has(k.c)).length
}

/** Seed every unseen character of a band as already known. Returns how many. */
export async function markBandKnown(
  corpus: Corpus,
  band: number,
  now: Date = new Date(),
): Promise<number> {
  const have = new Set((await db.items.toArray()).map((i) => i.c))
  const targets = corpus.kanji.filter((k) => k.jlpt === band && !have.has(k.c))
  // deterministic for the day, so a double-tap cannot reshuffle the spread
  const rand = mulberry32(hash(`known:${band}:${dayKey(now)}`))

  const rows: ItemRow[] = targets.map((k) => {
    const inDays = rand() * KNOWN_SEED_SPREAD_DAYS
    return {
      c: k.c,
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
      // presented ≥ 1: a returning item is probed first and taught after
      presented: 1,
    }
  })

  await db.items.bulkPut(rows)
  await setMeta(`known:${band}`, now.toISOString())
  return rows.length
}
