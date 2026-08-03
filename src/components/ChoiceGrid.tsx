/**
 * Four choices, 2×2, thumb-reachable. On a phone the bottom half of the screen
 * is the only comfortable target area, so the choices live there and the prompt
 * sits above them.
 */

import type { Choice } from '../cards/build'

interface Props {
  choices: Choice[]
  /** index the learner picked, or null while unanswered */
  chosen: number | null
  answer: number
  revealed: boolean
  disabled?: boolean
  onPick: (index: number) => void
  /** Mincho/Gothic — kanji choices must match the prompt's face or the DISCRIMINATE
   *  card becomes a font-matching exercise instead of a recognition one. */
  face: 'mincho' | 'gothic'
}

export function ChoiceGrid({ choices, chosen, answer, revealed, disabled, onPick, face }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {choices.map((choice, i) => {
        const isAnswer = i === answer
        const isChosen = i === chosen
        const state = !revealed
          ? 'idle'
          : isAnswer
            ? 'right'
            : isChosen
              ? 'wrong'
              : 'muted'

        return (
          <button
            key={`${choice.label}-${i}`}
            type="button"
            disabled={disabled || revealed}
            onClick={() => onPick(i)}
            className={[
              'flex min-h-[4.25rem] items-center justify-center rounded-[3px] border px-3 py-3',
              'text-center transition-colors duration-150 active:scale-[0.99]',
              choice.script === 'jp'
                ? `${face === 'mincho' ? 'font-mincho' : 'font-gothic'} ${
                    choice.label.length <= 2 ? 'text-4xl' : 'text-2xl'
                  } leading-tight`
                : 'font-ui text-[0.95rem] leading-snug',
              state === 'idle' && 'border-rule bg-paper text-ink',
              state === 'right' && 'border-mastery bg-mastery/10 text-mastery',
              state === 'wrong' && 'border-correction bg-correction/10 text-correction',
              state === 'muted' && 'border-rule-soft bg-paper text-ink-faint',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="line-clamp-3">{choice.label}</span>
          </button>
        )
      })}
    </div>
  )
}
