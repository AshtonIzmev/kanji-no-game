/**
 * The session engine. Holds the queue, grades answers, writes FSRS state, and
 * keeps the running arcade score the ghost is raced against (spec §5).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Corpus } from '../data/corpus'
import {
  db,
  dayKey,
  fromFsrsCard,
  getMeta,
  previousDayKey,
  setMeta,
  toFsrsCard,
  type ItemRow,
} from '../db/db'
import { applyGrade, gradeFor, newCard, Rating } from '../srs/scheduler'
import { buildQueue, noteNewIntroduced, type QueueEntry, type QueueStats } from '../srs/queue'
import { buildCard, type RenderedCard } from '../cards/build'

export type Phase = 'loading' | 'ready' | 'card' | 'feedback' | 'done' | 'empty'

export interface Feedback {
  correct: boolean
  chosen: number
  card: RenderedCard
}

export interface SessionState {
  phase: Phase
  card?: RenderedCard
  feedback?: Feedback
  index: number
  total: number
  answered: number
  correct: number
  combo: number
  bestCombo: number
  score: number
  ghost?: number[]
  ghostScore: number
  stats?: QueueStats
  newIntroduced: number
}

const INITIAL: SessionState = {
  phase: 'loading',
  index: 0,
  total: 0,
  answered: 0,
  correct: 0,
  combo: 0,
  bestCombo: 0,
  score: 0,
  ghostScore: 0,
  newIntroduced: 0,
}

export function useSession(corpus: Corpus | null) {
  const [state, setState] = useState<SessionState>(INITIAL)

  // `finish` is reached from inside `advance`, which is memoised on the card
  // index. Reading tallies off `state` there would miss the final card, whose
  // answer lands without the index moving — so tallies are read from a ref.
  const latest = useRef(state)
  latest.current = state

  const queue = useRef<QueueEntry[]>([])
  const seen = useRef<Set<string>>(new Set())
  const repeated = useRef<Set<string>>(new Set())
  const trace = useRef<number[]>([])
  const startedAt = useRef<Date>(new Date())
  const shownAt = useRef<number>(0)
  const answering = useRef(false)

  // --- start ---------------------------------------------------------------

  const start = useCallback(async () => {
    if (!corpus) return
    setState({ ...INITIAL, phase: 'loading' })
    const [{ queue: q, stats }, items, best] = await Promise.all([
      buildQueue(corpus),
      db.items.toArray(),
      db.sessions.orderBy('score').last(),
    ])
    seen.current = new Set(items.map((i) => i.c))
    repeated.current = new Set()
    trace.current = []
    queue.current = q
    startedAt.current = new Date()

    if (q.length === 0) {
      setState((s) => ({ ...s, phase: 'empty', stats }))
      return
    }
    const first = buildCard(corpus, q[0].kanji, q[0].item, seen.current)
    shownAt.current = performance.now()
    answering.current = false
    setState({
      ...INITIAL,
      phase: 'card',
      card: first,
      total: q.length,
      stats,
      ghost: best?.trace,
    })
  }, [corpus])

  // --- answer --------------------------------------------------------------

  const answer = useCallback(
    async (chosen: number) => {
      if (!corpus || answering.current) return
      answering.current = true

      const entry = queue.current[state.index]
      const card = state.card
      if (!entry || !card) return

      const elapsed = performance.now() - shownAt.current
      const limitMs = card.seconds > 0 ? card.seconds * 1000 : elapsed || 1
      const correct = chosen === card.answer
      const grade = gradeFor(card.mode, correct, elapsed, limitMs)

      const previous = entry.item
      const fsrsCard = previous ? toFsrsCard(previous) : newCard(startedAt.current)
      const next = applyGrade(fsrsCard, grade)
      const row: ItemRow = fromFsrsCard(entry.kanji.c, next, (previous?.presented ?? 0) + 1)

      await db.items.put(row)
      await db.reviews.add({
        c: entry.kanji.c,
        at: new Date(),
        rating: grade,
        correct: correct ? 1 : 0,
        kind: card.kind,
        mode: card.mode,
        ms: Math.round(elapsed),
      })
      if (entry.isNew) {
        await noteNewIntroduced()
        seen.current.add(entry.kanji.c)
      }

      // Arcade score: a correct answer is worth more the faster it lands.
      // Encounter cards score nothing — they are not a performance.
      let gained = 0
      if (card.mode === 'arcade' && correct) {
        gained = Math.round(100 * (1 + Math.max(0, 1 - elapsed / limitMs)))
      }
      if (card.mode === 'arcade') {
        trace.current.push((trace.current.at(-1) ?? 0) + gained)
      }

      // An item you just got wrong comes back before the session ends — once.
      if (!correct && !repeated.current.has(entry.kanji.c)) {
        repeated.current.add(entry.kanji.c)
        queue.current.push({ ...entry, item: row, isNew: false })
      }

      setState((s) => {
        const combo = correct ? s.combo + 1 : 0
        return {
          ...s,
          phase: 'feedback',
          feedback: { correct, chosen, card },
          answered: s.answered + 1,
          correct: s.correct + (correct ? 1 : 0),
          combo,
          bestCombo: Math.max(s.bestCombo, combo),
          score: s.score + gained,
          total: queue.current.length,
          newIntroduced: s.newIntroduced + (entry.isNew ? 1 : 0),
          ghostScore: s.ghost?.[trace.current.length - 1] ?? s.ghostScore,
        }
      })
    },
    [corpus, state.index, state.card],
  )

  // --- finish --------------------------------------------------------------

  const finish = useCallback(async () => {
    const now = new Date()
    const final = latest.current
    if (final.answered > 0) {
      await db.sessions.add({
        day: dayKey(now),
        startedAt: startedAt.current,
        endedAt: now,
        answered: final.answered,
        correct: final.correct,
        newItems: final.newIntroduced,
        score: final.score,
        trace: trace.current,
      })
      await bumpStreak(now)
    }
    setState((s) => ({ ...s, phase: 'done', card: undefined, feedback: undefined }))
  }, [])

  // --- advance -------------------------------------------------------------

  const advance = useCallback(async () => {
    if (!corpus) return
    const nextIndex = state.index + 1
    if (nextIndex >= queue.current.length) {
      await finish()
      return
    }
    const entry = queue.current[nextIndex]
    // re-read the row: a repeated item's FSRS state changed since queue build
    const item = entry.item ?? (await db.items.get(entry.kanji.c))
    const card = buildCard(corpus, entry.kanji, item, seen.current)
    shownAt.current = performance.now()
    answering.current = false
    setState((s) => ({
      ...s,
      phase: 'card',
      card,
      feedback: undefined,
      index: nextIndex,
    }))
  }, [corpus, state.index, finish])


  useEffect(() => {
    if (corpus && state.phase === 'loading') setState((s) => ({ ...s, phase: 'ready' }))
  }, [corpus, state.phase])

  return { state, start, answer, advance, finish }
}

/** A session counts if at least one card was answered — deliberately trivial
 *  to maintain, because streak-breaking is the #1 churn cause (spec §5). */
export async function bumpStreak(now: Date): Promise<void> {
  const today = dayKey(now)
  const last = await getMeta<string | null>('streak:last', null)
  if (last === today) return
  const count = await getMeta<number>('streak:count', 0)
  const next = last === previousDayKey(today) ? count + 1 : 1
  await setMeta('streak:count', next)
  await setMeta('streak:best', Math.max(next, await getMeta<number>('streak:best', 0)))
  await setMeta('streak:last', today)
}

export { Rating }
