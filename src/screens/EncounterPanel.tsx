/**
 * ENCOUNTER mode's teaching panel (spec §2). Slow, elaborative, components and
 * context. You cannot speed-retrieve what you have not encoded — depth of
 * processing on day one, speed on day ten.
 *
 * No LLM-generated mnemonics at v1 (spec §9): the "story" here is the honest
 * one the data already contains — what the character is built from.
 */

import type { Corpus, Kanji } from '../data/corpus'
import { GenkoCell } from '../components/GenkoCell'
import { faceFor } from '../cards/build'

interface Props {
  corpus: Corpus
  kanji: Kanji
  /** true the very first time this character is met */
  first: boolean
}

export function EncounterPanel({ corpus, kanji, first }: Props) {
  const face = faceFor(kanji.c)
  const examples = kanji.v.slice(0, 2).map((i) => corpus.vocab[i])

  return (
    <div className="anim-rise flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <div className="w-28 shrink-0">
          <GenkoCell face={face} inked>
            <span className="text-[4.2rem]">{kanji.c}</span>
          </GenkoCell>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5 pt-0.5">
          <p className="font-mono text-[0.65rem] tracking-widest text-ink-faint uppercase">
            {first ? 'new' : 'learning'} · N{kanji.jlpt} · {kanji.strokes} strokes
          </p>
          <p className="text-[1.05rem] leading-tight">{kanji.m.slice(0, 3).join(', ')}</p>
          <dl className="mt-0.5 space-y-0.5 font-mono text-[0.7rem] text-ink-soft">
            {kanji.on.length > 0 && (
              <div className="flex gap-2">
                <dt className="w-8 shrink-0 tracking-widest uppercase">on</dt>
                <dd className="font-gothic text-[0.85rem] text-ink">{kanji.on.join('・')}</dd>
              </div>
            )}
            {kanji.kun.length > 0 && (
              <div className="flex gap-2">
                <dt className="w-8 shrink-0 tracking-widest uppercase">kun</dt>
                <dd className="font-gothic text-[0.85rem] text-ink">{kanji.kun.join('・')}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {kanji.comp.length > 0 && (
        <section className="border-t border-rule-soft pt-3">
          <h3 className="font-mono text-[0.65rem] tracking-widest text-ink-faint uppercase">
            built from
          </h3>
          <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            {kanji.comp.map((comp, i) => (
              <li key={comp.c + i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-ink-faint">+</span>}
                <span className="font-gothic text-2xl leading-none">{comp.c}</span>
                <span className="text-[0.8rem] text-ink-soft">{comp.n}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {examples.length > 0 && (
        <section className="border-t border-rule-soft pt-3">
          <h3 className="font-mono text-[0.65rem] tracking-widest text-ink-faint uppercase">
            in use
          </h3>
          <ul className="mt-2 space-y-1.5">
            {examples.map((v) => (
              <li key={v.w} className="flex items-baseline gap-2">
                <span className="font-gothic text-lg leading-none">{v.w}</span>
                <span className="font-gothic text-[0.8rem] text-ink-soft">{v.r}</span>
                <span className="truncate text-[0.8rem] text-ink-faint">{v.m}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
