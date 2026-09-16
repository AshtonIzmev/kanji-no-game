/**
 * ENCOUNTER mode's teaching panel, for a word (spec §2). The word first —
 * written form, reading, meaning — then the character it introduces, in full:
 * components, etymology, other words. Characters the learner already holds
 * through other words are listed, not re-taught.
 *
 * The corpus order guarantees at most one new character per word, so this
 * panel almost always dwells on exactly one thing.
 */

import type { Corpus, Kanji, Vocab } from '../data/corpus'
import { EncounterPanel } from './EncounterPanel'
import { speak } from '../audio/speak'

interface Props {
  corpus: Corpus
  word: Vocab
  kanji: Kanji[]
  /** characters shown in full — the new one when teaching, all of them when
   *  elaborating after an answer */
  detail: Kanji[]
  face: 'mincho' | 'gothic'
  /** true the very first time this word is met */
  first: boolean
}

export function WordPanel({ corpus, word, kanji, detail, face, first }: Props) {
  const known = kanji.filter((k) => !detail.some((n) => n.c === k.c))

  return (
    <div className="anim-rise flex flex-col gap-4">
      <button
        type="button"
        onClick={() => void speak(word.r)}
        aria-label={`hear ${word.r}`}
        className="flex items-baseline gap-3 text-left"
      >
        <span className={`${face === 'mincho' ? 'font-mincho' : 'font-gothic'} text-[2.6rem] leading-none`}>
          {word.w}
        </span>
        <span className="font-gothic text-lg text-ink-soft">{word.r}</span>
        <span className="ml-auto font-mono text-[0.62rem] tracking-widest text-ink-faint uppercase">
          {first ? 'new' : 'learning'} · N{word.jlpt}
        </span>
      </button>
      <p className="-mt-2 text-[1.05rem] leading-tight">{word.m}</p>

      {detail.map((k) => (
        <section key={k.c} className="border-t border-rule pt-4">
          <h3 className="mb-3 font-mono text-[0.65rem] tracking-widest text-ink-faint uppercase">
            {first ? 'new character' : 'character'}
          </h3>
          <EncounterPanel corpus={corpus} kanji={k} first={first} />
        </section>
      ))}

      {known.length > 0 && (
        <section className="border-t border-rule-soft pt-3">
          <h3 className="font-mono text-[0.65rem] tracking-widest text-ink-faint uppercase">
            {detail.length > 0 ? 'already met' : 'characters'}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {known.map((k) => (
              <li key={k.c} className="flex items-baseline gap-1.5">
                <span className="font-gothic text-2xl leading-none">{k.c}</span>
                <span className="text-[0.8rem] text-ink-soft">{k.m[0]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
