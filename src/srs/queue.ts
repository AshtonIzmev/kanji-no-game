/**
 * Session queue assembly: everything FSRS says is due, plus a hard-capped
 * trickle of new words (spec §5).
 */

import type { Corpus, Vocab } from '../data/corpus'
import { db, dayKey, getMeta, setMeta, type ItemRow } from '../db/db'
import { MAX_SESSION_CARDS, NEW_PER_DAY, NEW_PER_SESSION } from '../config'

export interface QueueEntry {
  word: Vocab
  item?: ItemRow
  isNew: boolean
}

export async function newIntroducedToday(): Promise<number> {
  return getMeta(`new:${dayKey()}`, 0)
}

export async function noteNewIntroduced(n = 1): Promise<void> {
  const key = `new:${dayKey()}`
  await setMeta(key, (await getMeta(key, 0)) + n)
}

export interface QueueStats {
  due: number
  newAvailable: number
  /** how many new words today's cap still allows */
  newAllowance: number
  total: number
}

export async function buildQueue(
  corpus: Corpus,
  now: Date = new Date(),
): Promise<{ queue: QueueEntry[]; stats: QueueStats }> {
  const items = await db.items.toArray()
  const byWord = new Map(items.map((i) => [i.w, i]))

  const due = items
    .filter((i) => i.due.getTime() <= now.getTime())
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .map<QueueEntry>((item) => ({ word: corpus.byWord.get(item.w)!, item, isNew: false }))
    .filter((e) => e.word)

  const introducedToday = await newIntroducedToday()
  const allowance = Math.max(0, Math.min(NEW_PER_SESSION, NEW_PER_DAY - introducedToday))

  // Teaching order is baked into the corpus: each word introduces at most one
  // character the learner has not met, so "next unseen" is simply the first gap.
  const unseen = corpus.vocab.filter((v) => !byWord.has(v.w))
  const fresh = unseen.slice(0, allowance).map<QueueEntry>((word) => ({ word, isNew: true }))

  const stats: QueueStats = {
    due: due.length,
    newAvailable: unseen.length,
    newAllowance: allowance,
    total: 0,
  }

  // New words are slow (Encounter mode, ~20s each). Spreading them through the
  // session rather than front-loading keeps the session from opening with two
  // minutes of reading before a single card gets answered.
  const reviews = due.slice(0, Math.max(0, MAX_SESSION_CARDS - fresh.length))
  const queue: QueueEntry[] = []
  if (fresh.length === 0) {
    queue.push(...reviews)
  } else {
    const gap = Math.max(1, Math.floor((reviews.length + fresh.length) / fresh.length))
    let f = 0
    for (let i = 0; i < reviews.length; i++) {
      queue.push(reviews[i])
      if (f < fresh.length && (i + 1) % gap === 0) queue.push(fresh[f++])
    }
    while (f < fresh.length) queue.push(fresh[f++])
  }

  stats.total = queue.length
  return { queue, stats }
}
