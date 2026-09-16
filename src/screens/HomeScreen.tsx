/**
 * Home is the collection sheet (spec §5). Opening the app shows you the shape
 * of what you know, not a menu.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Corpus, Kanji } from '../data/corpus'
import { db, getMeta } from '../db/db'
import { tierFor, type Tier } from '../srs/scheduler'
import { CollectionGrid, TierLegend } from '../components/CollectionGrid'
import { KNOWN_SEED_SPREAD_DAYS, NEW_PER_DAY, RAIN_UNLOCK } from '../config'
import { newIntroducedToday } from '../srs/queue'
import { markBandKnown } from '../srs/seed'
import { rainPool } from '../game/rain'

interface Props {
  corpus: Corpus
  onStart: () => void
  onRain: () => void
  onSelect: (k: Kanji) => void
  onStats: () => void
}

export function HomeScreen({ corpus, onStart, onRain, onSelect, onStats }: Props) {
  const [band, setBand] = useState<5 | 4>(5)
  const bandChosen = useRef(false)
  const [seeding, setSeeding] = useState(false)

  const live = useLiveQuery(async () => {
    const items = await db.items.toArray()
    return {
      items,
      streak: await getMeta<number>('streak:count', 0),
      introducedToday: await newIntroducedToday(),
    }
  }, [])

  const tiers = useMemo(() => {
    const map = new Map<string, Tier>()
    for (const item of live?.items ?? []) map.set(item.c, tierFor(item))
    return map
  }, [live?.items])

  // Open on the band the learner is actually working in: once every N5
  // character has been met, that is N4.
  useEffect(() => {
    if (!live || bandChosen.current) return
    bandChosen.current = true
    const n5Left = corpus.kanji.some((k) => k.jlpt === 5 && !tiers.has(k.c))
    if (!n5Left) setBand(4)
  }, [live, corpus, tiers])

  const bandKanji = useMemo(() => corpus.kanji.filter((k) => k.jlpt === band), [corpus, band])

  const counts = useMemo(() => {
    const c: Record<Tier, number> = { unseen: 0, learning: 0, solid: 0, burned: 0 }
    for (const k of bandKanji) c[tiers.get(k.c) ?? 'unseen']++
    return c
  }, [bandKanji, tiers])

  const now = Date.now()
  const due = (live?.items ?? []).filter((i) => i.due.getTime() <= now).length
  const unseen = corpus.kanji.length - (live?.items.length ?? 0)
  const newLeft = Math.max(0, NEW_PER_DAY - (live?.introducedToday ?? 0))
  const nothingToDo = due === 0 && (newLeft === 0 || unseen === 0)
  const rainReady = live ? rainPool(corpus, live.items).length : 0
  const rainLocked = rainReady < RAIN_UNLOCK

  // Placement is offered exactly once: on a fresh install, before anything
  // has been studied. After that it lives on the stats screen.
  const n5Unseen = corpus.kanji.filter((k) => k.jlpt === 5 && !tiers.has(k.c)).length
  const offerPlacement = live !== undefined && live.items.length === 0 && n5Unseen > 0

  async function startAtN4() {
    const ok = confirm(
      `Mark all ${n5Unseen} N5 characters as known?\n\nThey still come back as quick reviews over the next ${KNOWN_SEED_SPREAD_DAYS} days. Any you miss go back into learning.`,
    )
    if (!ok) return
    setSeeding(true)
    await markBandKnown(corpus, 5)
    setSeeding(false)
    setBand(4)
  }

  return (
    <div className="flex h-dvh flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <header className="flex shrink-0 items-baseline justify-between pb-3">
        <h1 className="font-mincho text-2xl tracking-[0.2em]">漢字</h1>
        <button
          type="button"
          onClick={onStats}
          className="flex items-baseline gap-1.5 font-mono text-xs tracking-widest text-ink-soft uppercase"
        >
          <span className="text-base text-ink">{live?.streak ?? 0}</span>
          day streak
        </button>
      </header>

      <div className="flex shrink-0 gap-px border border-rule bg-rule font-mono text-[0.7rem] tracking-widest uppercase">
        {([5, 4] as const).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBand(b)}
            className={`flex-1 py-2 transition-colors ${
              band === b ? 'bg-ink text-paper' : 'bg-paper text-ink-soft'
            }`}
          >
            N{b}
          </button>
        ))}
      </div>

      {/* The sheet scrolls; the start button never does. Reaching for 始める
          must not require finding it first. */}
      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        {offerPlacement && (
          <div className="mb-3 rounded-[3px] border border-rule bg-paper-deep/40 px-4 py-3">
            <p className="font-mono text-[0.62rem] tracking-widest text-ink-faint uppercase">
              already passed N5?
            </p>
            <p className="mt-1 text-[0.85rem] leading-snug text-ink-soft">
              Skip being taught 日 and 一. Its {n5Unseen} characters enter as known
              and come back as quick checks; anything you miss is relearned.
            </p>
            <button
              type="button"
              disabled={seeding}
              onClick={() => void startAtN4()}
              className="mt-2.5 w-full rounded-[3px] border border-ink bg-paper py-2.5 font-mono text-[0.7rem] tracking-widest text-ink uppercase disabled:text-ink-faint"
            >
              {seeding ? 'marking…' : 'I know N5 — start at N4'}
            </button>
          </div>
        )}
        <CollectionGrid kanji={bandKanji} tiers={tiers} onSelect={onSelect} />
      </div>

      <div className="shrink-0 space-y-2.5 border-t border-rule pt-3">
        <TierLegend counts={counts} />
        <p className="text-center font-mono text-[0.68rem] tracking-widest text-ink-soft uppercase">
          {nothingToDo
            ? 'nothing due — come back tomorrow'
            : `${due} due · ${Math.min(newLeft, unseen)} new today`}
        </p>
        <button
          type="button"
          onClick={onStart}
          disabled={nothingToDo}
          className="w-full rounded-[3px] border border-ink bg-ink py-4 font-mincho text-lg tracking-[0.35em] text-paper transition-opacity disabled:border-rule disabled:bg-paper disabled:text-ink-faint"
        >
          始める
        </button>
        <button
          type="button"
          onClick={onRain}
          disabled={rainLocked}
          className="flex w-full items-center justify-center gap-3 rounded-[3px] border border-rule bg-paper py-2.5 font-mono text-[0.66rem] tracking-widest text-ink uppercase disabled:text-ink-faint"
        >
          <span className="font-mincho text-base tracking-normal normal-case">雨</span>
          {rainLocked
            ? `kanji rain · unlocks at ${RAIN_UNLOCK} solid · ${rainReady}/${RAIN_UNLOCK}`
            : `kanji rain · ${rainReady} ready`}
        </button>
      </div>
    </div>
  )
}
