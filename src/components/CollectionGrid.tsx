/**
 * The collection sheet (spec §5). A sheet of genkō yōshi squares, one per kanji
 * in the JLPT band: empty → outlined → inked as mastery rises. This is the home
 * screen, and it is the only progress display — no invented metrics.
 */

import type { Kanji } from '../data/corpus'
import type { Tier } from '../srs/scheduler'
import { faceFor } from '../cards/build'

export const TIER_LABEL: Record<Tier, string> = {
  unseen: 'unseen',
  learning: 'learning',
  solid: 'solid',
  burned: 'burned',
}

interface Props {
  kanji: Kanji[]
  tiers: Map<string, Tier>
  onSelect: (k: Kanji) => void
}

export function CollectionGrid({ kanji, tiers, onSelect }: Props) {
  return (
    <div className="grid grid-cols-7 gap-px border border-rule bg-rule">
      {kanji.map((k) => {
        const tier = tiers.get(k.c) ?? 'unseen'
        return (
          <button
            key={k.c}
            type="button"
            onClick={() => onSelect(k)}
            aria-label={`${k.c} — ${k.m[0]} — ${TIER_LABEL[tier]}`}
            className={[
              'genko-cross relative flex aspect-square items-center justify-center',
              'text-[1.35rem] leading-none transition-colors',
              faceFor(k.c) === 'mincho' ? 'font-mincho' : 'font-gothic',
              tier === 'unseen' && 'bg-paper text-ink-faint/25',
              tier === 'learning' && 'bg-paper text-ink/60',
              tier === 'solid' && 'bg-mastery/12 text-ink',
              tier === 'burned' && 'bg-mastery text-paper',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {k.c}
          </button>
        )
      })}
    </div>
  )
}

export function TierLegend({ counts }: { counts: Record<Tier, number> }) {
  const items: { tier: Tier; swatch: string }[] = [
    { tier: 'unseen', swatch: 'bg-paper border-rule' },
    { tier: 'learning', swatch: 'bg-paper border-ink/50' },
    { tier: 'solid', swatch: 'bg-mastery/25 border-mastery/40' },
    { tier: 'burned', swatch: 'bg-mastery border-mastery' },
  ]
  return (
    <div className="flex items-center justify-between font-mono text-[0.68rem] tracking-wide text-ink-soft uppercase">
      {items.map(({ tier, swatch }) => (
        <span key={tier} className="flex items-center gap-1.5">
          <span className={`inline-block size-2.5 border ${swatch}`} />
          {TIER_LABEL[tier]}
          <span className="text-ink">{counts[tier]}</span>
        </span>
      ))}
    </div>
  )
}
