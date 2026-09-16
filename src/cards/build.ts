/**
 * Card construction (spec §3). One pool of words, one scheduler, four renders.
 * All the difficulty lives in the distractors.
 *
 *   MEANING  word    → 4 meanings      what does it mean
 *   WHICH    meaning → 4 written words  which word (the discrimination card)
 *   READ     word    → 4 kana readings  how is it read
 *   LISTEN   spoken  → 4 written words  what did you hear
 *
 * LISTEN degrades gracefully: with no voice, or after LISTEN_REVEAL_MS, the
 * kana is shown and the card becomes reading → written form. Still a card.
 */

import type { Corpus, Kanji, Vocab } from '../data/corpus'
import type { ItemRow } from '../db/db'
import type { Mode } from '../srs/scheduler'
import { arcadeSeconds, modeFor } from '../srs/scheduler'
import { hash, mulberry32, pickDistinct, shuffled } from '../srs/rng'

export type CardKind = 'meaning' | 'which' | 'read' | 'listen'

export interface Choice {
  label: string
  /** how to typeset it — kanji and kana want the JP faces, English does not */
  script: 'jp' | 'en'
}

export interface RenderedCard {
  word: Vocab
  /** the word's characters, in order */
  kanji: Kanji[]
  /** characters no other met word contains — what the teaching panel dwells on */
  newKanji: Kanji[]
  kind: CardKind
  mode: Mode
  /** what fills the manuscript square; for LISTEN, the kana to speak */
  prompt: string
  promptScript: 'jp' | 'en' | 'audio'
  /** small line under the prompt, shown at feedback */
  hint?: string
  choices: Choice[]
  answer: number
  /** seconds allowed; 0 in encounter mode, which has no clock */
  seconds: number
  /** true the very first time this word is met — it gets taught before it is
   *  probed, where a returning word is probed first and taught after */
  first: boolean
  /** Mincho or Gothic — alternates per word, stable across reviews (spec §7) */
  face: 'mincho' | 'gothic'
}

/**
 * Mincho matches printed books, Gothic matches screens and signage. A learner
 * who only ever sees one form fails to recognise the other, so the choice is
 * fixed per item — never random, or the same word flickers between forms.
 */
export function faceFor(key: string): 'mincho' | 'gothic' {
  return hash(key) % 2 === 0 ? 'mincho' : 'gothic'
}

const KINDS: CardKind[] = ['meaning', 'which', 'read', 'listen']

/** Rotate through the types rather than picking at random, so every type
 *  comes round on a predictable cadence. The first probe after teaching is
 *  always MEANING — the plainest question there is. */
export function kindFor(word: Vocab, presented: number): CardKind {
  if (presented === 0) return 'meaning'
  return KINDS[(presented + (hash(word.w) % KINDS.length)) % KINDS.length]
}

// --- distractor sourcing ----------------------------------------------------

/** Cluster peers first — visual near-twins are the whole point (spec §3). */
export function clusterPeers(corpus: Corpus, kanji: Kanji): string[] {
  const out: string[] = []
  for (const idx of kanji.cl) {
    for (const c of corpus.clusters[idx]) {
      if (c !== kanji.c && !out.includes(c)) out.push(c)
    }
  }
  return out
}

/**
 * Fallback distractor rule (spec §3): same stroke count ±1, drawn from the
 * learner's already-seen set. Falling back further to the same JLPT band keeps
 * a card constructible on day one, when nothing has been seen yet.
 */
export function strokeNeighbours(corpus: Corpus, kanji: Kanji, seen: Set<string>): string[] {
  const near: string[] = []
  for (const delta of [0, -1, 1]) {
    for (const c of corpus.byStrokes.get(kanji.strokes + delta) ?? []) {
      if (c !== kanji.c) near.push(c)
    }
  }
  const known = near.filter((c) => seen.has(c))
  if (known.length >= 3) return known
  const band = corpus.kanji
    .filter((k) => k.jlpt === kanji.jlpt && k.c !== kanji.c && !near.includes(k.c))
    .map((k) => k.c)
  return [...known, ...near.filter((c) => !seen.has(c)), ...band]
}

/**
 * Words that could be mistaken for this one, best first: words sharing a
 * character (学校 against 学生 and 高校), then words built on a visual
 * near-twin of one of its characters (犬 against 大 and 太), then words of the
 * same shape from the same band, then anything. The learner's own met set is
 * preferred at each step — confusion is between things you have seen.
 */
export function wordPool(corpus: Corpus, word: Vocab, seenKanji: Set<string>): Vocab[] {
  const out: Vocab[] = []
  const taken = new Set<string>([word.w])
  const add = (v: Vocab | undefined) => {
    if (v && !taken.has(v.w)) {
      taken.add(v.w)
      out.push(v)
    }
  }
  const addAll = (list: Vocab[]) => {
    const met = list.filter((v) => v.k.every((c) => seenKanji.has(c)))
    met.forEach(add)
    list.forEach(add)
  }

  const chars = word.k.map((c) => corpus.byChar.get(c)).filter((k): k is Kanji => !!k)
  for (const k of chars) addAll(corpus.wordsByKanji.get(k.c) ?? [])
  for (const k of chars) {
    for (const peer of [...clusterPeers(corpus, k), ...strokeNeighbours(corpus, k, seenKanji)]) {
      addAll(corpus.wordsByKanji.get(peer) ?? [])
    }
  }
  addAll(
    corpus.vocab.filter(
      (v) => v.jlpt === word.jlpt && v.w.length === word.w.length && v.jukugo === word.jukugo,
    ),
  )
  addAll(corpus.vocab)
  return out
}

// --- the four card types ----------------------------------------------------

interface Built {
  prompt: string
  promptScript: 'jp' | 'en' | 'audio'
  choices: Choice[]
  answer: number
  hint?: string
}

function finish(right: Choice, wrong: Choice[], rand: () => number): Pick<Built, 'choices' | 'answer'> {
  const choices = shuffled([right, ...wrong], rand)
  return { choices, answer: choices.indexOf(right) }
}

function buildMeaning(pool: Vocab[], word: Vocab, rand: () => number): Built {
  const taken = new Set([word.m.toLowerCase()])
  const wrong = pickDistinct(
    pool.filter((v) => !taken.has(v.m.toLowerCase())).slice(0, 24),
    3,
    rand,
    (v) => v.m.toLowerCase(),
  ).map<Choice>((v) => ({ label: v.m, script: 'en' }))
  return {
    prompt: word.w,
    promptScript: 'jp',
    hint: word.r,
    ...finish({ label: word.m, script: 'en' }, wrong, rand),
  }
}

function buildWhich(pool: Vocab[], word: Vocab, rand: () => number): Built {
  // a word with the same gloss would be a second right answer
  const wrong = pickDistinct(
    pool.filter((v) => v.m.toLowerCase() !== word.m.toLowerCase()).slice(0, 24),
    3,
    rand,
    (v) => v.w,
  ).map<Choice>((v) => ({ label: v.w, script: 'jp' }))
  return {
    prompt: word.m,
    promptScript: 'en',
    hint: word.r,
    ...finish({ label: word.w, script: 'jp' }, wrong, rand),
  }
}

function buildRead(word: Vocab, rand: () => number): Built {
  const wrong = word.d.slice(0, 3).map<Choice>((r) => ({ label: r, script: 'jp' }))
  return {
    prompt: word.w,
    promptScript: 'jp',
    hint: word.m,
    ...finish({ label: word.r, script: 'jp' }, wrong, rand),
  }
}

function buildListen(pool: Vocab[], word: Vocab, rand: () => number): Built {
  // a homophone would be a second right answer (火 and 日 are both ひ)
  const wrong = pickDistinct(
    pool.filter((v) => v.r !== word.r).slice(0, 24),
    3,
    rand,
    (v) => v.w,
  ).map<Choice>((v) => ({ label: v.w, script: 'jp' }))
  return {
    prompt: word.r,
    promptScript: 'audio',
    hint: word.m,
    ...finish({ label: word.w, script: 'jp' }, wrong, rand),
  }
}

// --- entry point ------------------------------------------------------------

export function buildCard(
  corpus: Corpus,
  word: Vocab,
  item: ItemRow | undefined,
  seenKanji: Set<string>,
): RenderedCard {
  const presented = item?.presented ?? 0
  const mode = item ? modeFor(item) : 'encounter'
  const kind = kindFor(word, presented)
  // seeded by word and review count: reproducible, but never the same layout
  // twice in a row
  const rand = mulberry32(hash(word.w + ':' + presented + ':' + kind))
  const pool = wordPool(corpus, word, seenKanji)

  const built =
    kind === 'meaning'
      ? buildMeaning(pool, word, rand)
      : kind === 'which'
        ? buildWhich(pool, word, rand)
        : kind === 'read'
          ? buildRead(word, rand)
          : buildListen(pool, word, rand)

  // A card is always four choices. Nothing above can realistically come up
  // short, but a three-choice card would silently make the item easier, which
  // would quietly corrupt the scheduler's difficulty estimate.
  const choices = built.choices.slice()
  const used = new Set(choices.map((ch) => ch.label))
  const script = built.choices[0].script
  for (const v of corpus.vocab) {
    if (choices.length >= 4) break
    const label = kind === 'meaning' ? v.m : kind === 'read' ? v.r : v.w
    if (!label || used.has(label)) continue
    used.add(label)
    choices.push({ label, script })
  }

  const kanji = word.k.map((c) => corpus.byChar.get(c)).filter((k): k is Kanji => !!k)
  return {
    word,
    kanji,
    newKanji: kanji.filter((k) => !seenKanji.has(k.c)),
    kind,
    mode,
    prompt: built.prompt,
    promptScript: built.promptScript,
    hint: built.hint,
    choices,
    answer: built.answer,
    seconds: mode === 'arcade' ? arcadeSeconds(item?.stability ?? 0) : 0,
    first: presented === 0,
    face: faceFor(word.w),
  }
}
