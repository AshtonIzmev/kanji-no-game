/**
 * End of session. Accuracy, and the ghost — your own previous best run, which
 * is the only competitor in a single-player app (spec §5).
 */

import type { SessionState } from '../session/useSession'

interface Props {
  state: SessionState
  streak: number
  onHome: () => void
  onAgain: () => void
  moreDue: boolean
}

export function SummaryScreen({ state, streak, onHome, onAgain, moreDue }: Props) {
  const accuracy = state.answered > 0 ? Math.round((100 * state.correct) / state.answered) : 0
  const ghostFinal = state.ghost?.at(-1) ?? 0
  const raced = state.score > 0 || ghostFinal > 0
  const beat = state.score > ghostFinal

  return (
    <div className="flex min-h-dvh flex-col gap-6 px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <h2 className="font-mincho text-xl tracking-[0.3em]">お疲れさま</h2>

      <dl className="grid grid-cols-2 gap-px border border-rule bg-rule">
        <Stat label="answered" value={String(state.answered)} />
        <Stat label="accuracy" value={`${accuracy}%`} />
        <Stat label="best combo" value={`${state.bestCombo}×`} />
        <Stat label="new learned" value={String(state.newIntroduced)} />
      </dl>

      {raced && (
        <section className="border border-rule bg-paper p-4">
          <h3 className="font-mono text-[0.65rem] tracking-widest text-ink-faint uppercase">
            ghost — your previous best
          </h3>
          <div className="mt-3 space-y-2">
            <Bar label="you" value={state.score} max={Math.max(state.score, ghostFinal, 1)} tone="ink" />
            <Bar label="ghost" value={ghostFinal} max={Math.max(state.score, ghostFinal, 1)} tone="faint" />
          </div>
          <p className={`mt-3 text-sm ${beat ? 'text-mastery' : 'text-ink-soft'}`}>
            {ghostFinal === 0
              ? 'First timed run — this one becomes the ghost.'
              : beat
                ? `New best, by ${state.score - ghostFinal}.`
                : `${ghostFinal - state.score} short.`}
          </p>
        </section>
      )}

      <p className="font-mono text-[0.7rem] tracking-widest text-ink-soft uppercase">
        {streak} day streak
      </p>

      <div className="mt-auto flex flex-col gap-2">
        {moreDue && (
          <button
            type="button"
            onClick={onAgain}
            className="w-full rounded-[3px] border border-ink bg-ink py-4 font-mincho text-base tracking-[0.3em] text-paper"
          >
            もう一度
          </button>
        )}
        <button
          type="button"
          onClick={onHome}
          className="w-full rounded-[3px] border border-rule bg-paper py-3.5 font-mono text-xs tracking-widest text-ink-soft uppercase"
        >
          collection
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper px-4 py-3">
      <dt className="font-mono text-[0.62rem] tracking-widest text-ink-faint uppercase">{label}</dt>
      <dd className="font-mono text-2xl">{value}</dd>
    </div>
  )
}

function Bar({
  label,
  value,
  max,
  tone,
}: {
  label: string
  value: number
  max: number
  tone: 'ink' | 'faint'
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-11 shrink-0 font-mono text-[0.62rem] tracking-widest text-ink-faint uppercase">
        {label}
      </span>
      <div className="h-2.5 flex-1 bg-paper-deep">
        <div
          className={`h-full ${tone === 'ink' ? 'bg-mastery' : 'bg-ink-faint/50'}`}
          style={{ width: `${Math.round((100 * value) / max)}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right font-mono text-xs">{value}</span>
    </div>
  )
}
