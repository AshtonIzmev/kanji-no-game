/**
 * Tapping a square on the collection sheet opens the character. Read-only —
 * this is a reference, not a study mode. The scheduler decides what gets
 * studied and when; browsing must not be able to smuggle a review in.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import type { Corpus, Kanji } from '../data/corpus'
import { db } from '../db/db'
import { tierFor } from '../srs/scheduler'
import { EncounterPanel } from './EncounterPanel'
import { TIER_LABEL } from '../components/CollectionGrid'

interface Props {
  corpus: Corpus
  kanji: Kanji
  onClose: () => void
}

export function KanjiSheet({ corpus, kanji, onClose }: Props) {
  const item = useLiveQuery(() => db.items.get(kanji.c), [kanji.c])
  const tier = tierFor(item)
  const due = item?.due

  return (
    <div className="flex min-h-dvh flex-col gap-5 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="-ml-1 px-2 py-1 font-mono text-xs tracking-widest text-ink-soft uppercase"
        >
          ← collection
        </button>
        <span className="font-mono text-[0.65rem] tracking-widest text-ink-faint uppercase">
          {TIER_LABEL[tier]}
        </span>
      </header>

      <EncounterPanel corpus={corpus} kanji={kanji} first={tier === 'unseen'} />

      <dl className="grid grid-cols-3 gap-px border border-rule bg-rule font-mono">
        <Cell label="stability" value={item ? `${item.stability.toFixed(1)}d` : '—'} />
        <Cell label="reviews" value={item ? String(item.reps) : '—'} />
        <Cell label="lapses" value={item ? String(item.lapses) : '—'} />
      </dl>

      <p className="font-mono text-[0.65rem] tracking-widest text-ink-faint uppercase">
        {due
          ? `next review ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
          : 'not yet introduced'}
        {kanji.freq ? ` · frequency rank ${kanji.freq}` : ''}
      </p>
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper px-3 py-2.5">
      <dt className="text-[0.58rem] tracking-widest text-ink-faint uppercase">{label}</dt>
      <dd className="text-lg">{value}</dd>
    </div>
  )
}
