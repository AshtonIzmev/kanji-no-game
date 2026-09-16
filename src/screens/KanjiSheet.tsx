/**
 * Tapping a square on the collection sheet opens the character. Read-only —
 * this is a reference, not a study mode. The scheduler decides what gets
 * studied and when; browsing must not be able to smuggle a review in.
 *
 * There is no card for a character: its progress is the progress of the words
 * that contain it, listed below the panel.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import type { Corpus, Kanji } from '../data/corpus'
import { db } from '../db/db'
import { kanjiTierFrom, tierFor } from '../srs/scheduler'
import { EncounterPanel } from './EncounterPanel'
import { TIER_LABEL } from '../components/CollectionGrid'
import { speak } from '../audio/speak'

interface Props {
  corpus: Corpus
  kanji: Kanji
  onClose: () => void
}

export function KanjiSheet({ corpus, kanji, onClose }: Props) {
  const words = corpus.wordsByKanji.get(kanji.c) ?? []
  const items = useLiveQuery(
    () => db.items.bulkGet(words.map((v) => v.w)),
    [kanji.c],
  )
  const tier = kanjiTierFrom(items ?? [])
  const met = (items ?? []).filter((i) => i !== undefined).length

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

      <section className="border-t border-rule pt-3">
        <h3 className="font-mono text-[0.65rem] tracking-widest text-ink-faint uppercase">
          words · {met}/{words.length} met
        </h3>
        {words.length === 0 ? (
          <p className="mt-2 text-sm text-ink-faint">
            No N5/N4 word on the list uses this character, so it is never taught.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-rule-soft border-y border-rule-soft">
            {words.map((v, i) => {
              const item = items?.[i]
              const t = tierFor(item)
              return (
                <li key={v.w} className="flex items-baseline gap-3 py-2">
                  <button
                    type="button"
                    onClick={() => void speak(v.r)}
                    className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
                  >
                    <span className="shrink-0 font-gothic text-lg leading-none whitespace-nowrap">{v.w}</span>
                    <span className="shrink-0 font-gothic text-[0.8rem] text-ink-soft whitespace-nowrap">{v.r}</span>
                    <span className="truncate text-[0.8rem] text-ink-faint">{v.m}</span>
                  </button>
                  <span
                    className={`shrink-0 font-mono text-[0.6rem] tracking-widest uppercase ${
                      t === 'unseen' ? 'text-ink-faint/60' : t === 'learning' ? 'text-ink-soft' : 'text-mastery'
                    }`}
                  >
                    {item
                      ? `${TIER_LABEL[t]} · ${item.due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                      : 'unseen'}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <p className="font-mono text-[0.65rem] tracking-widest text-ink-faint uppercase">
        N{kanji.jlpt}
        {kanji.freq ? ` · frequency rank ${kanji.freq}` : ''}
      </p>
    </div>
  )
}
