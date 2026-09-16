/**
 * 雨 — kanji rain. The screen: a field with four lanes, glyphs falling down
 * them, the meaning being hunted pinned along the bottom edge where the thumb
 * already is. All rules live in src/game/rain.ts; this file only draws them
 * and writes the results to FSRS.
 *
 * Stressful on purpose. The session's arcade clock is a bar that shrinks; here
 * the clock is the character itself, getting closer.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Corpus } from '../data/corpus'
import { db, fromFsrsCard, getMeta, setMeta, toFsrsCard, type ItemRow } from '../db/db'
import { applyGrade, gradeFor } from '../srs/scheduler'
import { hash } from '../srs/rng'
import { bumpStreak } from '../session/useSession'
import { LISTEN_REVEAL_MS, RAIN_LANES, RAIN_LIVES, RAIN_UNLOCK } from '../config'
import { hasJapaneseVoice, speak } from '../audio/speak'
import { seenKanji } from '../session/useSession'
import {
  hitPoints,
  makeWave,
  planRun,
  rainPool,
  stepWave,
  tapDrop,
  type Outcome,
  type Wave,
} from '../game/rain'

type Phase = 'ready' | 'playing' | 'over'

interface Run {
  plan: ItemRow[]
  idx: number
  wave: Wave
  lives: number
  score: number
  combo: number
  bestCombo: number
  hits: number
  /** waves resolved so far */
  waves: number
  /** points from the last hit, for the +N flash */
  lastPts: number
  finished: boolean
}

interface Result {
  score: number
  best: number
  newBest: boolean
  waves: number
  hits: number
  bestCombo: number
}

/** Glyph box, px. Big enough for a thumb, small enough for four lanes. */
const DROP_PX = 64
/** How long the outcome stays on screen before the next wave, seconds. */
const HOLD_HIT_S = 0.45
const HOLD_MISS_S = 1.15

/** One wave has ended: score it, and grade the character in FSRS exactly as
 *  an arcade card would have been — same rating rule, same scheduler. */
async function settle(r: Run, outcome: Outcome): Promise<void> {
  const w = r.wave
  r.waves += 1
  if (outcome === 'hit') {
    r.lastPts = hitPoints(w.hitY ?? 1, r.combo)
    r.score += r.lastPts
    r.combo += 1
    r.bestCombo = Math.max(r.bestCombo, r.combo)
    r.hits += 1
  } else {
    r.combo = 0
    r.lives -= 1
  }
  const limitMs = (1 / w.speed) * 1000
  const elapsedMs = (w.hitY ?? 1) * limitMs
  const grade = gradeFor('arcade', outcome === 'hit', elapsedMs, limitMs)
  const next = applyGrade(toFsrsCard(w.item), grade)
  await db.items.put(fromFsrsCard(w.word.w, next, w.item.presented + 1))
  await db.reviews.add({
    w: w.word.w,
    at: new Date(),
    rating: grade,
    correct: outcome === 'hit' ? 1 : 0,
    kind: w.promptKind === 'listen' ? 'listen' : 'which',
    mode: 'rain',
    ms: Math.round(elapsedMs),
  })
}

interface Props {
  corpus: Corpus
  onClose: () => void
}

export function RainScreen({ corpus, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('ready')
  const [, setTick] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [fieldH, setFieldH] = useState(0)
  const run = useRef<Run | null>(null)
  const seen = useRef<Set<string>>(new Set())
  const field = useRef<HTMLDivElement>(null)

  const live = useLiveQuery(async () => {
    const items = await db.items.toArray()
    return {
      pool: rainPool(corpus, items).length,
      best: await getMeta<number>('rain:best', 0),
      runs: await getMeta<number>('rain:runs', 0),
    }
  }, [corpus])

  // The field only exists while playing; measure it whenever it appears.
  useEffect(() => {
    const el = field.current
    if (!el) return
    const measure = () => setFieldH(el.clientHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [phase])

  // --- start ---------------------------------------------------------------

  const start = useCallback(async () => {
    const items = await db.items.toArray()
    seen.current = seenKanji(corpus, items)
    const now = new Date()
    const plan = planRun(rainPool(corpus, items), now, hash(`rain-run:${now.getTime()}`))
    if (plan.length === 0) return
    const first = plan[0]
    run.current = {
      plan,
      idx: 0,
      wave: makeWave(corpus, corpus.byWord.get(first.w)!, first, 1, seen.current),
      lives: RAIN_LIVES,
      score: 0,
      combo: 0,
      bestCombo: 0,
      hits: 0,
      waves: 0,
      lastPts: 0,
      finished: false,
    }
    setResult(null)
    setPhase('playing')
  }, [corpus])

  // --- the loop ------------------------------------------------------------

  const quitRef = useRef<() => void>(onClose)

  useEffect(() => {
    if (phase !== 'playing') return

    const finish = async (r: Run) => {
      if (r.finished) return
      r.finished = true
      const prev = await getMeta<number>('rain:best', 0)
      const newBest = r.score > prev
      if (newBest) await setMeta('rain:best', r.score)
      await setMeta('rain:runs', (await getMeta<number>('rain:runs', 0)) + 1)
      if (r.waves > 0) await bumpStreak(new Date())
      setResult({
        score: r.score,
        best: Math.max(prev, r.score),
        newBest,
        waves: r.waves,
        hits: r.hits,
        bestCombo: r.bestCombo,
      })
      setPhase('over')
    }

    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      const r = run.current
      if (!r || r.finished) return
      // clamp: a backgrounded tab must not land every glyph on resume
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      const outcome = stepWave(r.wave, dt)
      if (outcome) void settle(r, outcome)

      const w = r.wave
      if (w.outcome && w.since >= (w.outcome === 'hit' ? HOLD_HIT_S : HOLD_MISS_S)) {
        if (r.lives <= 0 || r.idx + 1 >= r.plan.length) {
          void finish(r)
          return
        }
        r.idx += 1
        const item = r.plan[r.idx]
        r.wave = makeWave(corpus, corpus.byWord.get(item.w)!, item, r.idx + 1, seen.current)
        announce(r.wave)
      }

      setTick((t) => t + 1)
      raf = requestAnimationFrame(frame)
    }
    announce(run.current!.wave)
    raf = requestAnimationFrame(frame)

    // quitting mid-run: what was answered is already graded; close the run out
    quitRef.current = () => void finish(run.current!).then(onClose)

    return () => cancelAnimationFrame(raf)
  }, [phase, corpus, onClose])

  // LISTEN waves: speak the word as the wave begins, show the kana a moment
  // later — or at once when there is no voice to speak with.
  const [kanaAt, setKanaAt] = useState(0)
  const announce = useCallback((w: Wave) => {
    if (w.promptKind !== 'listen') return
    const voiced = hasJapaneseVoice()
    if (voiced) void speak(w.word.r)
    setKanaAt(performance.now() + (voiced ? LISTEN_REVEAL_MS : 0))
  }, [])

  /** A tap scores at once — waiting for the next frame would let a fast
   *  second tap land before the wave is marked over. */
  const tap = useCallback((id: number) => {
    const r = run.current
    if (!r || r.finished) return
    const outcome = tapDrop(r.wave, id)
    if (!outcome) return
    void settle(r, outcome)
    setTick((t) => t + 1)
  }, [])

  // --- ready / locked ------------------------------------------------------

  if (phase === 'ready') {
    const pool = live?.pool ?? 0
    const locked = pool < RAIN_UNLOCK
    return (
      <Frame onClose={onClose}>
        <div className="flex flex-1 flex-col justify-center gap-6">
          <div>
            <h2 className="font-mincho text-6xl tracking-[0.3em]">雨</h2>
            <p className="mt-2 font-mono text-[0.68rem] tracking-widest text-ink-soft uppercase">
              kanji rain
            </p>
          </div>
          <p className="text-[0.95rem] leading-relaxed text-ink-soft">
            A meaning waits at the bottom, or a word is spoken. Four words fall.
            Tap the one it names before it lands. A wrong tap or a landing costs
            one of three lives, and the rain gets faster the longer you last.
          </p>
          <p className="text-[0.85rem] leading-relaxed text-ink-faint">
            Only words you already hold fall here — the game drills, it never
            teaches — and every catch is a real review, scheduled like any other.
          </p>
          <dl className="grid grid-cols-2 gap-px border border-rule bg-rule font-mono">
            <div className="bg-paper px-4 py-3">
              <dt className="text-[0.6rem] tracking-widest text-ink-faint uppercase">ready to fall</dt>
              <dd className="text-2xl">{pool}</dd>
            </div>
            <div className="bg-paper px-4 py-3">
              <dt className="text-[0.6rem] tracking-widest text-ink-faint uppercase">best run</dt>
              <dd className="text-2xl">{live?.best ?? 0}</dd>
            </div>
          </dl>
        </div>
        <button
          type="button"
          disabled={locked}
          onClick={() => void start()}
          className="w-full shrink-0 rounded-[3px] border border-ink bg-ink py-4 font-mincho text-lg tracking-[0.35em] text-paper disabled:border-rule disabled:bg-paper disabled:text-ink-faint"
        >
          {locked ? (
            <span className="font-mono text-[0.68rem] tracking-widest uppercase">
              unlocks at {RAIN_UNLOCK} solid · {pool}/{RAIN_UNLOCK}
            </span>
          ) : (
            '降らせる'
          )}
        </button>
      </Frame>
    )
  }

  // --- over ----------------------------------------------------------------

  if (phase === 'over' && result) {
    return (
      <Frame onClose={onClose}>
        <div className="flex flex-1 flex-col justify-center gap-6">
          <h2 className="font-mincho text-3xl tracking-[0.2em]">
            {result.hits === result.waves && result.waves > 0 ? '完璧' : '雨上がり'}
          </h2>
          <dl className="grid grid-cols-2 gap-px border border-rule bg-rule font-mono">
            <Stat label="score" value={result.score} sub={result.newBest ? 'new best' : `best ${result.best}`} />
            <Stat label="caught" value={`${result.hits}/${result.waves}`} />
            <Stat label="best combo" value={`${result.bestCombo}×`} />
            <Stat label="reviews" value={result.waves} sub="graded" />
          </dl>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[3px] border border-rule bg-paper py-4 font-mono text-xs tracking-widest text-ink uppercase"
          >
            collection
          </button>
          <button
            type="button"
            onClick={() => void start()}
            className="flex-1 rounded-[3px] border border-ink bg-ink py-4 font-mincho text-base tracking-[0.3em] text-paper"
          >
            もう一度
          </button>
        </div>
      </Frame>
    )
  }

  // --- playing -------------------------------------------------------------

  const r = run.current
  if (!r) return null
  const w = r.wave
  const travel = Math.max(0, fieldH - DROP_PX)
  const kanaShown = w.promptKind === 'listen' && (performance.now() >= kanaAt || w.outcome !== undefined)

  return (
    <div className="flex h-dvh flex-col overflow-hidden px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <header className="flex h-6 items-center gap-3 pb-1 font-mono text-[0.62rem] tracking-widest text-ink-faint uppercase">
        <span className="flex gap-1" aria-label={`${r.lives} lives`}>
          {Array.from({ length: RAIN_LIVES }, (_, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-[1px] border ${
                i < r.lives ? 'border-ink bg-ink' : 'border-correction'
              }`}
            />
          ))}
        </span>
        <span>
          {r.idx + 1}/{r.plan.length}
        </span>
        {r.combo > 1 && <span className="text-mastery">{r.combo}×</span>}
        <span className="ml-auto text-sm text-ink">{r.score}</span>
        <button
          type="button"
          onClick={() => quitRef.current()}
          aria-label="end run"
          className="-mr-1 px-2 text-xs"
        >
          ✕
        </button>
      </header>

      {/* the field */}
      <div
        ref={field}
        className="rain-lanes relative min-h-0 flex-1 overflow-hidden border-b-2 border-ink"
      >
        {w.drops.map((d) => {
          if (d.state === 'gone' || d.y <= -0.2) return null
          const faded = w.outcome !== undefined && d.state === 'falling' && !d.target
          const revealed = w.outcome !== undefined && w.outcome !== 'hit' && d.target
          return (
            <div
              key={d.id}
              className="absolute top-0 will-change-transform"
              style={{
                left: `${((d.lane + 0.5) * 100) / RAIN_LANES}%`,
                transform: `translate3d(-50%, ${d.y * travel}px, 0)`,
                width: `calc(${100 / RAIN_LANES}% - 6px)`,
              }}
            >
              <button
                type="button"
                onPointerDown={() => tap(d.id)}
                disabled={w.outcome !== undefined}
                className={[
                  'flex items-center justify-center rounded-[3px] border leading-none select-none',
                  'touch-manipulation transition-opacity',
                  w.face === 'mincho' ? 'font-mincho' : 'font-gothic',
                  d.state === 'hit' && 'anim-splash border-mastery bg-mastery/10 text-mastery',
                  d.state === 'wrong' && 'anim-correction border-correction bg-correction/10 text-correction',
                  d.state === 'falling' && revealed && w.outcome === 'missed' && 'anim-sink border-correction text-correction',
                  d.state === 'falling' && revealed && w.outcome === 'wrong' && 'border-mastery bg-mastery/10 text-mastery',
                  d.state === 'falling' && !revealed && 'border-rule bg-paper text-ink',
                  faded && 'opacity-30',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ width: '100%', height: DROP_PX, fontSize: dropFont(d.w) }}
              >
                {d.w}
              </button>
            </div>
          )
        })}
      </div>

      {/* the prompt: what is being hunted */}
      <div className="shrink-0 pt-3">
        <p className="font-mono text-[0.62rem] tracking-widest text-ink-faint uppercase">
          {w.promptKind === 'listen' ? 'what did you hear' : 'which word'}
        </p>
        <div
          data-kind={w.promptKind}
          onClick={() => w.promptKind === 'listen' && void speak(w.word.r)}
          className="mt-1.5 flex min-h-[4.75rem] items-center gap-3 rounded-[3px] border border-rule bg-paper-deep/40 px-4 py-3"
        >
          {w.promptKind === 'meaning' ? (
            <span className="font-ui text-2xl leading-tight text-balance">{w.word.m}</span>
          ) : (
            <>
              <span className="font-mincho text-3xl leading-none text-ink-soft">耳</span>
              <span className={`font-gothic text-2xl leading-none ${kanaShown ? '' : 'invisible'}`}>
                {w.word.r}
              </span>
            </>
          )}
          {w.outcome === 'hit' && (
            <span className="anim-rise ml-auto font-mono text-base text-mastery">+{r.lastPts}</span>
          )}
          {w.outcome !== undefined && w.outcome !== 'hit' && (
            <span
              className={`anim-rise ml-auto text-4xl leading-none text-mastery ${
                w.face === 'mincho' ? 'font-mincho' : 'font-gothic'
              }`}
            >
              {w.word.w}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/** Words up to four characters share a lane ~90px wide. */
function dropFont(w: string): string {
  return w.length <= 1 ? '2.35rem' : w.length === 2 ? '1.7rem' : w.length === 3 ? '1.25rem' : '1rem'
}

function Frame({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="flex h-dvh flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <header className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={onClose}
          className="-ml-1 px-2 py-1 font-mono text-xs tracking-widest text-ink-soft uppercase"
        >
          ← collection
        </button>
      </header>
      {children}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-paper px-4 py-3">
      <dt className="text-[0.6rem] tracking-widest text-ink-faint uppercase">{label}</dt>
      <dd className="text-2xl">
        {value}
        {sub && <span className="ml-2 text-[0.65rem] text-ink-faint">{sub}</span>}
      </dd>
    </div>
  )
}
