/**
 * Home is the collection sheet (spec §5). Opening the app shows you the shape
 * of what you know, not a menu.
 */

import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Corpus, Kanji } from '../data/corpus'
import { db, getMeta } from '../db/db'
import { tierFor, type Tier } from '../srs/scheduler'
import { CollectionGrid, TierLegend } from '../components/CollectionGrid'
import { NEW_PER_DAY } from '../config'
import { newIntroducedToday } from '../srs/queue'

interface Props {
  corpus: Corpus
  onStart: () => void
  onSelect: (k: Kanji) => void
  onStats: () => void
}

export function HomeScreen({ corpus, onStart, onSelect, onStats }: Props) {
  const [band, setBand] = useState<5 | 4>(5)

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
      </div>
    </div>
  )
}
