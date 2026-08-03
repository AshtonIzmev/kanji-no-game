/**
 * Local persistence. Dexie over IndexedDB — not LocalStorage, which is capped
 * at 5MB and synchronous (spec §6).
 *
 * There is no sync layer and no backend. This is a phone-only app: the phone
 * holds the only copy of the SRS state, so `exportState` / `importState` exist
 * as the manual escape hatch for moving to a new device.
 */

import Dexie, { type Table } from 'dexie'
import type { Card as FsrsCard } from 'ts-fsrs'
import { DAY_ROLLOVER_HOUR } from '../config'

/** One FSRS card per kanji — one pool, one scheduler (spec §2). */
export interface ItemRow {
  c: string
  due: Date
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review?: Date
  /** how many times this item has been presented, used to rotate card type */
  presented: number
}

export interface ReviewRow {
  id?: number
  c: string
  at: Date
  /** FSRS rating 1..4 */
  rating: number
  correct: 0 | 1
  /** card type shown */
  kind: string
  /** 'encounter' | 'arcade' */
  mode: string
  /** answer latency in ms */
  ms: number
}

export interface SessionRow {
  id?: number
  /** local day key, YYYY-MM-DD, with a 4am rollover */
  day: string
  startedAt: Date
  endedAt: Date
  answered: number
  correct: number
  newItems: number
  /** arcade score, spec §5 ghost runs */
  score: number
  /** cumulative score after each arcade card — the ghost's trace */
  trace: number[]
}

export interface MetaRow {
  key: string
  value: unknown
}

class KanjiDB extends Dexie {
  items!: Table<ItemRow, string>
  reviews!: Table<ReviewRow, number>
  sessions!: Table<SessionRow, number>
  meta!: Table<MetaRow, string>

  constructor() {
    super('kanji-no-game')
    this.version(1).stores({
      items: 'c, due, state, stability',
      reviews: '++id, c, at',
      sessions: '++id, day, endedAt, score',
      meta: 'key',
    })
  }
}

export const db = new KanjiDB()

// --- day keys ---------------------------------------------------------------

export function dayKey(d: Date = new Date()): string {
  const shifted = new Date(d.getTime() - DAY_ROLLOVER_HOUR * 3600_000)
  const y = shifted.getFullYear()
  const m = String(shifted.getMonth() + 1).padStart(2, '0')
  const day = String(shifted.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function previousDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 1)
  return dayKey(new Date(dt.getTime() + DAY_ROLLOVER_HOUR * 3600_000))
}

// --- meta helpers -----------------------------------------------------------

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

// --- FSRS card <-> row ------------------------------------------------------

export function toFsrsCard(row: ItemRow): FsrsCard {
  return {
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps ?? 0,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review,
  } as FsrsCard
}

export function fromFsrsCard(c: string, card: FsrsCard, presented: number): ItemRow {
  return {
    c,
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: (card as unknown as { learning_steps?: number }).learning_steps ?? 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review,
    presented,
  }
}

// --- manual device transfer -------------------------------------------------

export async function exportState(): Promise<string> {
  const [items, reviews, sessions, meta] = await Promise.all([
    db.items.toArray(),
    db.reviews.toArray(),
    db.sessions.toArray(),
    db.meta.toArray(),
  ])
  return JSON.stringify({ v: 1, exportedAt: new Date(), items, reviews, sessions, meta })
}

export async function importState(json: string): Promise<void> {
  const parsed = JSON.parse(json, (key, value) =>
    key === 'due' || key === 'last_review' || key === 'at' || key === 'startedAt' || key === 'endedAt'
      ? new Date(value as string)
      : value,
  )
  await db.transaction('rw', db.items, db.reviews, db.sessions, db.meta, async () => {
    await Promise.all([db.items.clear(), db.reviews.clear(), db.sessions.clear(), db.meta.clear()])
    await db.items.bulkPut(parsed.items ?? [])
    await db.reviews.bulkPut(parsed.reviews ?? [])
    await db.sessions.bulkPut(parsed.sessions ?? [])
    await db.meta.bulkPut(parsed.meta ?? [])
  })
}
