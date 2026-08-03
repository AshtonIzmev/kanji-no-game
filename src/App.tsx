import { useCallback, useEffect, useState } from 'react'
import { loadCorpus, type Corpus, type Kanji } from './data/corpus'
import { useSession } from './session/useSession'
import { HomeScreen } from './screens/HomeScreen'
import { SessionScreen } from './screens/SessionScreen'
import { SummaryScreen } from './screens/SummaryScreen'
import { KanjiSheet } from './screens/KanjiSheet'
import { StatsScreen } from './screens/StatsScreen'
import { db, getMeta } from './db/db'

type View = 'home' | 'session' | 'summary' | 'kanji' | 'stats'

export function App() {
  const [corpus, setCorpus] = useState<Corpus | null>(null)
  const [view, setView] = useState<View>('home')
  const [selected, setSelected] = useState<Kanji | null>(null)
  const [streak, setStreak] = useState(0)
  const [moreDue, setMoreDue] = useState(false)
  const { state, start, answer, advance, finish } = useSession(corpus)

  useEffect(() => {
    void loadCorpus().then(setCorpus)
  }, [])

  // A session ending is the only thing that can change the streak.
  useEffect(() => {
    if (state.phase !== 'done') return
    void (async () => {
      setStreak(await getMeta<number>('streak:count', 0))
      const now = Date.now()
      setMoreDue((await db.items.toArray()).some((i) => i.due.getTime() <= now))
      setView('summary')
    })()
  }, [state.phase])

  useEffect(() => {
    if (state.phase === 'empty') setView('home')
  }, [state.phase])

  const begin = useCallback(async () => {
    setView('session')
    await start()
  }, [start])

  if (!corpus) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="font-mincho text-3xl tracking-[0.3em] text-ink-faint">漢字</span>
      </div>
    )
  }

  if (view === 'kanji' && selected) {
    return <KanjiSheet corpus={corpus} kanji={selected} onClose={() => setView('home')} />
  }

  if (view === 'stats') {
    return <StatsScreen onClose={() => setView('home')} />
  }

  if (view === 'session' && (state.phase === 'card' || state.phase === 'feedback')) {
    return (
      <SessionScreen
        corpus={corpus}
        state={state}
        onAnswer={answer}
        onAdvance={advance}
        onQuit={finish}
      />
    )
  }

  if (view === 'summary') {
    return (
      <SummaryScreen
        state={state}
        streak={streak}
        moreDue={moreDue}
        onHome={() => setView('home')}
        onAgain={() => void begin()}
      />
    )
  }

  return (
    <HomeScreen
      corpus={corpus}
      onStart={() => void begin()}
      onSelect={(k) => {
        setSelected(k)
        setView('kanji')
      }}
      onStats={() => setView('stats')}
    />
  )
}
