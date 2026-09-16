/**
 * Everything the app knows about you, in one scroll. Also the only place the
 * no-backend decision needs an answer: the phone holds the only copy of your
 * SRS state, so export/import is the device-transfer path.
 */

import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Corpus } from '../data/corpus'
import { db, dayKey, exportState, getMeta, importState, setMeta } from '../db/db'
import { tierFor, type Tier } from '../srs/scheduler'
import { KNOWN_SEED_SPREAD_DAYS, NEW_PER_DAY } from '../config'
import { newIntroducedToday } from '../srs/queue'
import { bandWords, markBandKnown } from '../srs/seed'
import { isMuted, setMuted } from '../audio/speak'

export function StatsScreen({ corpus, onClose }: { corpus: Corpus; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [muted, setMutedState] = useState(isMuted())
  const fileInput = useRef<HTMLInputElement>(null)

  const data = useLiveQuery(async () => {
    const items = await db.items.toArray()
    const sessions = await db.sessions.reverse().limit(14).toArray()
    const reviews = await db.reviews.count()
    const counts: Record<Tier, number> = { unseen: 0, learning: 0, solid: 0, burned: 0 }
    for (const i of items) counts[tierFor(i)]++
    const have = new Set(items.map((i) => i.w))
    const now = Date.now()
    return {
      n5Unseen: bandWords(corpus, 5).filter((v) => !have.has(v.w)).length,
      rainBest: await getMeta<number>('rain:best', 0),
      rainRuns: await getMeta<number>('rain:runs', 0),
      counts,
      reviews,
      sessions,
      due: items.filter((i) => i.due.getTime() <= now).length,
      streak: await getMeta<number>('streak:count', 0),
      bestStreak: await getMeta<number>('streak:best', 0),
      introducedToday: await newIntroducedToday(),
      bestScore: (await db.sessions.orderBy('score').last())?.score ?? 0,
    }
  }, [corpus])

  async function markN5Known() {
    const n = data?.n5Unseen ?? 0
    const ok = confirm(
      `Mark the ${n} unseen words written with N5 characters as known?\n\nThey come back as quick reviews over the next ${KNOWN_SEED_SPREAD_DAYS} days. Any you miss go back into learning.`,
    )
    if (!ok) return
    setBusy('seed')
    await markBandKnown(corpus, 5)
    setBusy(null)
  }

  async function doExport() {
    setBusy('export')
    const json = await exportState()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kanji-no-game-${dayKey()}.json`
    a.click()
    URL.revokeObjectURL(url)
    setBusy(null)
  }

  async function doImport(file: File) {
    setBusy('import')
    try {
      await importState(await file.text())
      location.reload()
    } catch {
      setBusy(null)
      alert('That file could not be read as a Kanji No Game backup.')
    }
  }

  async function toggleMute() {
    const next = !muted
    setMuted(next)
    setMutedState(next)
    await setMeta('audio:muted', next)
  }

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
      </header>

      <dl className="grid grid-cols-2 gap-px border border-rule bg-rule">
        <Stat label="streak" value={`${data?.streak ?? 0}`} sub={`best ${data?.bestStreak ?? 0}`} />
        <Stat label="due now" value={`${data?.due ?? 0}`} />
        <Stat
          label="new today"
          value={`${data?.introducedToday ?? 0}`}
          sub={`cap ${NEW_PER_DAY}`}
        />
        <Stat label="reviews all time" value={`${data?.reviews ?? 0}`} />
        <Stat label="words solid" value={`${data?.counts.solid ?? 0}`} />
        <Stat label="words burned" value={`${data?.counts.burned ?? 0}`} />
        <Stat label="arcade best" value={`${data?.bestScore ?? 0}`} />
        <Stat
          label="rain best"
          value={`${data?.rainBest ?? 0}`}
          sub={data?.rainRuns ? `${data.rainRuns} runs` : undefined}
        />
      </dl>

      <section>
        <h3 className="font-mono text-[0.65rem] tracking-widest text-ink-faint uppercase">
          last sessions
        </h3>
        {data?.sessions.length ? (
          <ul className="mt-2 divide-y divide-rule-soft border-y border-rule-soft">
            {data.sessions.map((s) => (
              <li key={s.id} className="flex items-baseline gap-3 py-2 font-mono text-xs">
                <span className="w-20 shrink-0 text-ink-faint">{s.day}</span>
                <span className="w-14">{s.answered} cards</span>
                <span className="w-12">
                  {s.answered ? Math.round((100 * s.correct) / s.answered) : 0}%
                </span>
                <span className="ml-auto text-ink-soft">{s.score || '—'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-faint">No sessions yet.</p>
        )}
      </section>

      <section className="mt-auto space-y-2 border-t border-rule pt-4">
        <h3 className="font-mono text-[0.65rem] tracking-widest text-ink-faint uppercase">
          placement
        </h3>
        <p className="text-[0.8rem] leading-snug text-ink-soft">
          {data?.n5Unseen
            ? `${data.n5Unseen} words written with N5 characters have not been met yet. If you already know them, skip the teaching: they enter as known and are checked in arcade over the next ${KNOWN_SEED_SPREAD_DAYS} days.`
            : 'Every N5 word has been met. New words now bring in N4 characters.'}
        </p>
        {!!data?.n5Unseen && (
          <button
            type="button"
            onClick={() => void markN5Known()}
            disabled={busy !== null}
            className="w-full rounded-[3px] border border-rule bg-paper py-3 font-mono text-xs tracking-widest text-ink uppercase disabled:text-ink-faint"
          >
            {busy === 'seed' ? 'marking…' : 'mark N5 as known'}
          </button>
        )}
      </section>

      <section className="space-y-2 border-t border-rule pt-4">
        <h3 className="font-mono text-[0.65rem] tracking-widest text-ink-faint uppercase">
          audio
        </h3>
        <p className="text-[0.8rem] leading-snug text-ink-soft">
          Words are read aloud by the phone's own Japanese voice. Listen cards
          show the kana a moment later either way, so nothing depends on it.
        </p>
        <button
          type="button"
          onClick={() => void toggleMute()}
          className="w-full rounded-[3px] border border-rule bg-paper py-3 font-mono text-xs tracking-widest text-ink uppercase"
        >
          {muted ? 'sound off · tap to turn on' : 'sound on · tap to mute'}
        </button>
      </section>

      <section className="space-y-2 border-t border-rule pt-4">
        <h3 className="font-mono text-[0.65rem] tracking-widest text-ink-faint uppercase">
          this phone holds the only copy
        </h3>
        <p className="text-[0.8rem] leading-snug text-ink-soft">
          There is no account and no server. Export before you change devices or
          clear the browser's storage.
        </p>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={doExport}
            disabled={busy !== null}
            className="flex-1 rounded-[3px] border border-rule bg-paper py-3 font-mono text-xs tracking-widest text-ink uppercase"
          >
            export
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy !== null}
            className="flex-1 rounded-[3px] border border-rule bg-paper py-3 font-mono text-xs tracking-widest text-ink uppercase"
          >
            import
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void doImport(f)
          }}
        />
      </section>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-paper px-4 py-3">
      <dt className="font-mono text-[0.6rem] tracking-widest text-ink-faint uppercase">{label}</dt>
      <dd className="font-mono text-2xl">
        {value}
        {sub && <span className="ml-2 text-[0.65rem] text-ink-faint">{sub}</span>}
      </dd>
    </div>
  )
}
