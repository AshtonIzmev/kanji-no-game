/**
 * The one scheduler (spec §2). FSRS owns every interval; nothing else in the
 * app is allowed to invent one.
 *
 * Mode routing lives here too, because it is a pure function of FSRS state:
 * below the graduation threshold an item is *taught*, above it the item is
 * *drilled*. Mode is never a user-facing toggle.
 */

import { fsrs, generatorParameters, createEmptyCard, Rating, State } from 'ts-fsrs'
import type { Card as FsrsCard, Grade } from 'ts-fsrs'
import {
  GRADUATION_STABILITY_DAYS,
  TIER_BURNED_DAYS,
  TIER_SOLID_DAYS,
  ARCADE_TIME_MAX,
  ARCADE_TIME_MIN,
  ARCADE_TIME_FLOOR_AT,
} from '../config'
import type { ItemRow } from '../db/db'

export const scheduler = fsrs(
  generatorParameters({
    // Fuzz spreads same-day loads out; with a single-digit daily intake it
    // mostly just makes intervals unpredictable for no benefit.
    enable_fuzz: false,
    enable_short_term: true,
    request_retention: 0.9,
    maximum_interval: 365 * 3,
  }),
)

export type Mode = 'encounter' | 'arcade'

export function newCard(now: Date = new Date()): FsrsCard {
  return createEmptyCard(now)
}

/**
 * ENCOUNTER for anything still being learned, ARCADE once the memory is stable
 * enough that the useful thing to train is *speed*.
 *
 * Relearning counts as learning: a lapsed item has demonstrably not stuck, and
 * drilling it faster is the wrong response.
 */
export function modeFor(item: Pick<ItemRow, 'state' | 'stability'>): Mode {
  if (item.state !== State.Review) return 'encounter'
  return item.stability >= GRADUATION_STABILITY_DAYS ? 'arcade' : 'encounter'
}

export type Tier = 'unseen' | 'learning' | 'solid' | 'burned'

/** Four states, four colours, derived directly from stability (spec §5). */
export function tierFor(item: Pick<ItemRow, 'state' | 'stability'> | undefined): Tier {
  if (!item || item.state === State.New) return 'unseen'
  if (item.stability >= TIER_BURNED_DAYS) return 'burned'
  if (item.stability >= TIER_SOLID_DAYS && item.state === State.Review) return 'solid'
  return 'learning'
}

/** Seconds allowed for one arcade card. Shrinks with stability. */
export function arcadeSeconds(stability: number): number {
  const t = Math.min(1, Math.max(0, (stability - GRADUATION_STABILITY_DAYS) / ARCADE_TIME_FLOOR_AT))
  return ARCADE_TIME_MAX - (ARCADE_TIME_MAX - ARCADE_TIME_MIN) * t
}

/**
 * Map a four-choice outcome onto an FSRS rating.
 *
 * Encounter has no clock, so it is pass/fail. Arcade grades on speed, because
 * in arcade the thing being measured *is* speed — a correct answer that took
 * the full six seconds is a deduction, not a retrieval, and should come back
 * sooner.
 */
export function gradeFor(
  mode: Mode,
  correct: boolean,
  elapsedMs: number,
  limitMs: number,
): Grade {
  if (!correct) return Rating.Again
  if (mode === 'encounter') return Rating.Good
  const fraction = elapsedMs / limitMs
  if (fraction <= 0.4) return Rating.Easy
  if (fraction >= 0.8) return Rating.Hard
  return Rating.Good
}

export function applyGrade(card: FsrsCard, grade: Grade, now: Date = new Date()): FsrsCard {
  return scheduler.next(card, now, grade).card
}

export { Rating, State }
