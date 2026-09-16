/**
 * One screen for both modes (spec §2). The scheduler routes silently: the
 * learner never picks between "study" and "play", they just see the next card.
 *
 * ENCOUNTER — no clock, and the teaching panel is always shown: before the
 * probe the first time a character is met, as elaborative feedback every time
 * after that.
 * ARCADE    — a clock that shrinks with stability, a combo that fills the
 * manuscript square's centring cross, and the previous best run as a ghost.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Corpus } from '../data/corpus'
import type { SessionState } from '../session/useSession'
import { GenkoCell } from '../components/GenkoCell'
import { ChoiceGrid } from '../components/ChoiceGrid'
import { WordPanel } from './WordPanel'
import { ENCOUNTER_MIN_STUDY_MS, LISTEN_REVEAL_MS } from '../config'
import { hasJapaneseVoice, speak } from '../audio/speak'

const KIND_LABEL: Record<string, string> = {
  meaning: 'what does it mean',
  which: 'which word',
  read: 'how is it read',
  listen: 'what did you hear',
}

/** Combo caps out at 8 for display: past that the cross is simply full. */
const COMBO_FULL = 8

interface Props {
  corpus: Corpus
  state: SessionState
  onAnswer: (choice: number) => void
  onAdvance: () => void
  onQuit: () => void
}

export function SessionScreen({ corpus, state, onAnswer, onAdvance, onQuit }: Props) {
  const card = state.card ?? state.feedback?.card
  const revealed = state.phase === 'feedback'
  const [studying, setStudying] = useState(false)
  const [studyReady, setStudyReady] = useState(false)
  const [remaining, setRemaining] = useState(1)
  // LISTEN: the clock waits for the voice, and the kana appears after a while
  const [heard, setHeard] = useState(true)
  const [kanaShown, setKanaShown] = useState(false)
  const answerRef = useRef(onAnswer)
  answerRef.current = onAnswer

  const key = card ? `${card.word.w}:${state.index}` : 'none'

  // --- encounter: teach before the probe, but only on the first meeting -----
  useEffect(() => {
    if (!card || state.phase !== 'card') return
    const needsStudy = card.mode === 'encounter' && card.first
    setStudying(needsStudy)
    setStudyReady(!needsStudy)
    if (!needsStudy) return
    const t = setTimeout(() => setStudyReady(true), ENCOUNTER_MIN_STUDY_MS)
    return () => clearTimeout(t)
  }, [key, state.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- listen: speak, then reveal -------------------------------------------
  useEffect(() => {
    if (!card || state.phase !== 'card' || studying) return
    if (card.promptScript !== 'audio') {
      setHeard(true)
      setKanaShown(false)
      return
    }
    let cancelled = false
    const voiced = hasJapaneseVoice()
    setHeard(!voiced)
    setKanaShown(!voiced)
    if (voiced) void speak(card.prompt).then(() => !cancelled && setHeard(true))
    const t = setTimeout(() => !cancelled && setKanaShown(true), LISTEN_REVEAL_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [key, state.phase, studying]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- speak the word at feedback, whatever the card asked --------------------
  useEffect(() => {
    if (state.phase !== 'feedback' || !card) return
    void speak(card.word.r)
  }, [state.phase, card])

  // --- arcade clock ---------------------------------------------------------
  useEffect(() => {
    if (!card || state.phase !== 'card' || card.seconds === 0 || studying || !heard) return
    const started = performance.now()
    const limit = card.seconds * 1000
    let raf = 0
    const tick = () => {
      const left = 1 - (performance.now() - started) / limit
      if (left <= 0) {
        setRemaining(0)
        answerRef.current(-1)
        return
      }
      setRemaining(left)
      raf = requestAnimationFrame(tick)
    }
    setRemaining(1)
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [key, state.phase, studying, heard]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- arcade auto-advance --------------------------------------------------
  const advance = useCallback(() => onAdvance(), [onAdvance])
  useEffect(() => {
    if (state.phase !== 'feedback' || !card || card.mode !== 'arcade') return
    const t = setTimeout(advance, state.feedback?.correct ? 420 : 1100)
    return () => clearTimeout(t)
  }, [state.phase, state.feedback?.correct, card, advance])

  if (!card) return null

  const combo = state.combo / COMBO_FULL
  const timerLow = remaining < 0.3
  const elaborating = revealed && card.mode === 'encounter'
  // How far ahead of your previous best you are, right now. Only meaningful
  // once there is a ghost to race and at least one arcade card has landed.
  const ghostDelta = state.ghost && state.answered > 0 ? state.score - state.ghostScore : null

  return (
    <div className="flex h-dvh flex-col overflow-hidden px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {/* progress + exit */}
      <header className="flex items-center gap-3 pb-2">
        <div className="flex h-1 flex-1 gap-px overflow-hidden">
          {Array.from({ length: state.total }, (_, i) => (
            <span
              key={i}
              className={`h-full flex-1 ${
                i < state.index ? 'bg-ink' : i === state.index ? 'bg-ink-soft' : 'bg-rule-soft'
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onQuit}
          aria-label="end session"
          className="-mr-1 px-2 font-mono text-xs text-ink-faint"
        >
          ✕
        </button>
      </header>

      {/* what is being asked, always; the clock, combo and ghost only in arcade */}
      <div className="flex h-4 items-center gap-3 font-mono text-[0.62rem] tracking-widest text-ink-faint uppercase">
        <span>{studying ? 'new word' : KIND_LABEL[card.kind]}</span>
        {card.mode === 'arcade' && ghostDelta !== null && (
          <span className={`ml-auto ${ghostDelta >= 0 ? 'text-mastery' : 'text-correction'}`}>
            ghost {ghostDelta >= 0 ? '+' : ''}
            {ghostDelta}
          </span>
        )}
        {card.mode === 'arcade' && state.combo > 1 && (
          <span className={`text-mastery ${ghostDelta === null ? 'ml-auto' : ''}`}>
            {state.combo}×
          </span>
        )}
      </div>
      <div className="mt-1 h-[2px] w-full bg-rule-soft">
        {card.mode === 'arcade' && !revealed && !studying && (
          <div
            className={`h-full origin-left ${timerLow ? 'bg-correction' : 'bg-ink'}`}
            style={{ transform: `scaleX(${remaining})` }}
          />
        )}
      </div>

      {studying ? (
        /* first meeting: teach, then probe */
        <div className="flex flex-1 flex-col overflow-y-auto pt-5">
          <WordPanel
            corpus={corpus}
            word={card.word}
            kanji={card.kanji}
            detail={card.newKanji}
            face={card.face}
            first
          />
          <button
            type="button"
            disabled={!studyReady}
            onClick={() => setStudying(false)}
            className="mt-auto w-full shrink-0 rounded-[3px] border border-ink bg-ink py-4 font-mincho text-base tracking-[0.3em] text-paper transition-opacity disabled:border-rule disabled:bg-paper disabled:text-ink-faint"
          >
            覚えた
          </button>
        </div>
      ) : elaborating ? (
        /* encounter feedback: the elaboration replaces the card rather than
           sitting below it, so the whole thing fits on one phone screen */
        <div className="flex flex-1 flex-col overflow-y-auto pt-4">
          <div className="mb-4 flex items-baseline gap-2 border-b border-rule-soft pb-3">
            <span
              className={`font-mono text-[0.62rem] tracking-widest uppercase ${
                state.feedback?.correct ? 'text-mastery' : 'text-correction'
              }`}
            >
              {state.feedback?.correct ? 'correct' : 'not quite'}
            </span>
            <span className={`ml-auto truncate ${card.face === 'mincho' ? 'font-mincho' : 'font-gothic'} text-lg`}>
              {card.promptScript === 'audio' ? card.word.r : card.prompt}
            </span>
            <span className="text-ink-faint">→</span>
            <span className="shrink-0 font-gothic text-lg text-mastery">
              {card.choices[card.answer].label}
            </span>
          </div>
          <WordPanel
            corpus={corpus}
            word={card.word}
            kanji={card.kanji}
            detail={card.kanji}
            face={card.face}
            first={false}
          />
          <button
            type="button"
            onClick={onAdvance}
            className="mt-auto w-full shrink-0 rounded-[3px] border border-ink bg-ink py-4 font-mincho text-base tracking-[0.3em] text-paper"
          >
            次へ
          </button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="flex flex-1 items-center justify-center py-3">
            <div className="w-[min(58vw,13.5rem)]">
              <GenkoCell
                face={card.face}
                combo={card.mode === 'arcade' ? combo : 0}
                error={revealed && state.feedback?.correct === false}
                inked={revealed && state.feedback?.correct === true}
              >
                {card.promptScript === 'jp' ? (
                  <span
                    className={
                      card.prompt.length === 1
                        ? 'text-[4.6rem]'
                        : card.prompt.length === 2
                          ? 'text-[2.9rem]'
                          : card.prompt.length === 3
                            ? 'text-[2.1rem]'
                            : 'text-[1.6rem]'
                    }
                  >
                    {card.prompt}
                  </span>
                ) : card.promptScript === 'audio' ? (
                  <button
                    type="button"
                    onClick={() => void speak(card.prompt)}
                    aria-label="hear it again"
                    className="flex h-full w-full flex-col items-center justify-center gap-3"
                  >
                    <span className="font-mincho text-[3.2rem] leading-none text-ink-soft">耳</span>
                    <span className="font-mono text-[0.62rem] tracking-widest text-ink-faint uppercase">
                      {kanaShown || revealed ? '' : hasJapaneseVoice() ? 'tap to hear again' : 'no japanese voice'}
                    </span>
                    <span className={`font-gothic text-[1.7rem] leading-none ${kanaShown || revealed ? '' : 'invisible'}`}>
                      {card.prompt}
                    </span>
                  </button>
                ) : (
                  <span
                    className={`font-ui leading-tight text-balance ${
                      card.prompt.length <= 10
                        ? 'text-3xl'
                        : card.prompt.length <= 22
                          ? 'text-2xl'
                          : 'text-lg'
                    }`}
                  >
                    {card.prompt}
                  </span>
                )}
              </GenkoCell>
            </div>
          </div>

          <p className="pb-2 text-center text-[0.85rem] text-ink-soft">
            {card.hint && revealed ? card.hint : '\u3000'}
          </p>

          <ChoiceGrid
            choices={card.choices}
            chosen={state.feedback?.chosen ?? null}
            answer={card.answer}
            revealed={revealed}
            face={card.face}
            onPick={onAnswer}
          />
        </div>
      )}
    </div>
  )
}
