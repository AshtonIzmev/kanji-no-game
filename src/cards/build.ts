/**
 * Card construction (spec §3). Three types, one pool, one scheduler, different
 * render. All the difficulty lives in the distractors.
 */

import type { Corpus, Kanji, Vocab } from '../data/corpus'
import type { ItemRow } from '../db/db'
import type { Mode } from '../srs/scheduler'
import { arcadeSeconds, modeFor } from '../srs/scheduler'
import { hash, mulberry32, pickDistinct, shuffled } from '../srs/rng'

export type CardKind = 'recognise' | 'discriminate' | 'read'

export interface Choice {
  label: string
  /** how to typeset it — kanji and kana want the JP faces, English does not */
  script: 'jp' | 'en'
}

export interface RenderedCard {
  kanji: Kanji
  kind: CardKind
  mode: Mode
  /** what fills the manuscript square */
  prompt: string
  promptScript: 'jp' | 'en'
  /** small line under the prompt: the jukugo's meaning, on READ cards */
  hint?: string
  choices: Choice[]
  answer: number
  /** seconds allowed; 0 in encounter mode, which has no clock */
  seconds: number
  /** true the very first time this character is met — it gets taught before
   *  it is probed, where a returning item is probed first and taught after */
  first: boolean
  /** Mincho or Gothic — alternates per item, stable across reviews (spec §7) */
  face: 'mincho' | 'gothic'
  /** the vocabulary word a READ card was built from */
  vocab?: Vocab
}

/**
 * Mincho matches printed books, Gothic matches screens and signage. A learner
 * who only ever sees one form fails to recognise the other, so the choice is
 * fixed per item — never random, or the same kanji flickers between forms.
 */
export function faceFor(c: string): 'mincho' | 'gothic' {
  return hash(c) % 2 === 0 ? 'mincho' : 'gothic'
}

function kindsFor(kanji: Kanji): CardKind[] {
  const kinds: CardKind[] = ['recognise', 'discriminate']
  if (kanji.v.length > 0) kinds.push('read')
  return kinds
}

/** Rotate through the available types rather than picking at random, so every
 *  type comes round on a predictable cadence. */
export function kindFor(kanji: Kanji, presented: number): CardKind {
  const kinds = kindsFor(kanji)
  return kinds[(presented + (hash(kanji.c) % kinds.length)) % kinds.length]
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

// --- the three card types ---------------------------------------------------

interface Built {
  prompt: string
  promptScript: 'jp' | 'en'
  choices: Choice[]
  answer: number
  hint?: string
  vocab?: Vocab
}

function buildRecognise(
  corpus: Corpus,
  kanji: Kanji,
  seen: Set<string>,
  rand: () => number,
): Built {
  const taken = new Set(kanji.m.map((m) => m.toLowerCase()))
  const pool = [...clusterPeers(corpus, kanji), ...strokeNeighbours(corpus, kanji, seen)]
    .map((c) => corpus.byChar.get(c))
    .filter((k): k is Kanji => !!k)
    .filter((k) => {
      const m = k.m[0]?.toLowerCase()
      if (!m || taken.has(m)) return false
      taken.add(m)
      return true
    })

  const wrong = pickDistinct(pool.slice(0, 24), 3, rand, (k) => k.m[0]).map<Choice>((k) => ({
    label: k.m[0],
    script: 'en',
  }))
  const right: Choice = { label: kanji.m[0], script: 'en' }
  const choices = shuffled([right, ...wrong], rand)
  return {
    prompt: kanji.c,
    promptScript: 'jp',
    choices,
    answer: choices.indexOf(right),
  }
}

function buildDiscriminate(
  corpus: Corpus,
  kanji: Kanji,
  seen: Set<string>,
  rand: () => number,
): Built {
  const peers = clusterPeers(corpus, kanji)
  const pool = peers.length >= 3 ? peers : [...peers, ...strokeNeighbours(corpus, kanji, seen)]
  const wrong = pickDistinct(pool, 3, rand, (c) => c).map<Choice>((c) => ({
    label: c,
    script: 'jp',
  }))
  const right: Choice = { label: kanji.c, script: 'jp' }
  const choices = shuffled([right, ...wrong], rand)
  return {
    prompt: kanji.m[0],
    promptScript: 'en',
    choices,
    answer: choices.indexOf(right),
  }
}

function buildRead(
  corpus: Corpus,
  kanji: Kanji,
  rand: () => number,
  presented: number,
): Built {
  // rotate through the kanji's vocabulary so the same word is not the only
  // context this character is ever met in
  const vocab = corpus.vocab[kanji.v[presented % kanji.v.length]]
  const wrong = vocab.d.slice(0, 3).map<Choice>((r) => ({ label: r, script: 'jp' }))
  const right: Choice = { label: vocab.r, script: 'jp' }
  const choices = shuffled([right, ...wrong], rand)
  return {
    prompt: vocab.w,
    promptScript: 'jp',
    hint: vocab.m,
    choices,
    answer: choices.indexOf(right),
    vocab,
  }
}

// --- entry point ------------------------------------------------------------

export function buildCard(
  corpus: Corpus,
  kanji: Kanji,
  item: ItemRow | undefined,
  seen: Set<string>,
): RenderedCard {
  const presented = item?.presented ?? 0
  const mode = item ? modeFor(item) : 'encounter'
  const kind = kindFor(kanji, presented)
  // seeded by item and review count: reproducible, but never the same layout
  // twice in a row
  const rand = mulberry32(hash(kanji.c + ':' + presented + ':' + kind))

  const built =
    kind === 'recognise'
      ? buildRecognise(corpus, kanji, seen, rand)
      : kind === 'discriminate'
        ? buildDiscriminate(corpus, kanji, seen, rand)
        : buildRead(corpus, kanji, rand, presented)

  // A card is always four choices. Nothing above can realistically come up
  // short, but a three-choice card would silently make the item easier, which
  // would quietly corrupt the scheduler's difficulty estimate.
  const choices = built.choices.slice()
  const used = new Set(choices.map((ch) => ch.label))
  for (const k of corpus.kanji) {
    if (choices.length >= 4) break
    const label = built.choices[0].script === 'en' ? k.m[0] : k.c
    if (!label || used.has(label)) continue
    used.add(label)
    choices.push({ label, script: built.choices[0].script })
  }

  return {
    kanji,
    kind,
    mode,
    prompt: built.prompt,
    promptScript: built.promptScript,
    hint: built.hint,
    choices,
    answer: built.answer,
    seconds: mode === 'arcade' ? arcadeSeconds(item?.stability ?? 0) : 0,
    first: presented === 0,
    face: faceFor(kanji.c),
    vocab: built.vocab,
  }
}
