/**
 * Audio is a cue, never a requirement. The phone's own Japanese voice reads a
 * word aloud through the Web Speech API — offline, no assets, no backend —
 * and everything that speaks also shows the kana a moment later, because the
 * ringer switch, a train, or a phone with no Japanese voice must never make a
 * card unanswerable.
 *
 * Speech input is deliberately absent: it is slow, server-bound on iOS, and
 * hopeless in noise. Speaking stays a non-goal.
 */

let muted = false
let voice: SpeechSynthesisVoice | null = null

export function audioSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!audioSupported()) return null
  if (voice) return voice
  const voices = speechSynthesis.getVoices().filter((v) => /^ja(-|_|$)/i.test(v.lang))
  if (voices.length === 0) return null
  // The system voices Apple and Google ship are the ones people have heard
  // before; prefer them, then anything local, then anything at all.
  const preferred = ['kyoko', 'o-ren', 'otoya', 'hattori', '日本語', 'japan']
  voices.sort((a, b) => {
    const ap = preferred.findIndex((p) => a.name.toLowerCase().includes(p))
    const bp = preferred.findIndex((p) => b.name.toLowerCase().includes(p))
    const ar = ap === -1 ? 99 : ap
    const br = bp === -1 ? 99 : bp
    if (ar !== br) return ar - br
    return Number(b.localService) - Number(a.localService)
  })
  voice = voices[0]
  return voice
}

if (audioSupported()) {
  // voices arrive asynchronously on most browsers; refresh the pick when they do
  speechSynthesis.addEventListener?.('voiceschanged', () => {
    voice = null
    pickVoice()
  })
  pickVoice()
}

/** True when there is a Japanese voice to speak with, right now. */
export function hasJapaneseVoice(): boolean {
  return !muted && pickVoice() !== null
}

export function setMuted(m: boolean): void {
  muted = m
  if (m && audioSupported()) speechSynthesis.cancel()
}

export function isMuted(): boolean {
  return muted
}

/**
 * Speak a word. Resolves when speech ends, errors, or after a bounded wait,
 * so callers can chain a clock to it without ever hanging on the audio stack.
 */
export function speak(text: string): Promise<void> {
  const v = hasJapaneseVoice() ? pickVoice() : null
  if (!v) return Promise.resolve()
  return new Promise((resolve) => {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.voice = v
    u.lang = v.lang
    u.rate = 0.9
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(t)
      resolve()
    }
    u.onend = finish
    u.onerror = finish
    const t = setTimeout(finish, 3000)
    speechSynthesis.speak(u)
  })
}
