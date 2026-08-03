/**
 * 字源 — how the character got its shape.
 *
 * ENCOUNTER ONLY. This must never render on a graded prompt or beside the
 * choices. Reading is glyph → meaning under time pressure; a picture next to
 * the glyph would become the retrieval cue, and the learner would get faster
 * at pictures instead of kanji. Same argument the spec used against Iteration 1.
 *
 * It renders only where a form actually exists, exactly as the "built from"
 * section does — no placeholder, no invented etymology.
 */

import type { Etymology, EtymologyForm } from '../data/corpus'

const ERA_LABEL: Record<EtymologyForm['era'], string> = {
  oracle: 'oracle bone',
  bronze: 'bronze',
  seal: 'seal script',
}

interface Props {
  char: string
  forms: Etymology
  base: string
}

export function EtymologyStrip({ char, forms, base }: Props) {
  if (forms.length === 0) return null

  return (
    <section className="border-t border-rule-soft pt-3">
      <h3 className="font-mono text-[0.65rem] tracking-widest text-ink-faint uppercase">
        字源 — how it got its shape
      </h3>
      <ol className="mt-2.5 flex items-start gap-1">
        {forms.map((form) => (
          <Form key={form.era} label={ERA_LABEL[form.era]}>
            {form.svg ? (
              <img
                src={`${base}etym/${form.svg}`}
                alt={`${char} in ${ERA_LABEL[form.era]} form`}
                className="h-11 w-11 object-contain"
                loading="lazy"
              />
            ) : (
              <span className="font-seal text-[2.6rem] leading-none">{char}</span>
            )}
          </Form>
        ))}
        <li aria-hidden className="flex h-12 items-center px-0.5 text-ink-faint">
          →
        </li>
        <Form label="today">
          <span className="font-gothic text-[2.4rem] leading-none">{char}</span>
        </Form>
      </ol>
    </section>
  )
}

function Form({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // Fixed width so the era captions cannot run into each other — they are
    // wider than the glyphs they sit under.
    <li className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1">
      <span className="flex h-12 items-center justify-center">{children}</span>
      <span className="text-center font-mono text-[0.55rem] leading-tight tracking-wider text-ink-faint uppercase">
        {label}
      </span>
    </li>
  )
}
