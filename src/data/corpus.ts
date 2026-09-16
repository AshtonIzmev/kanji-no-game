/**
 * The corpus: three static JSON files built by scripts/build_data.py (spec §4).
 * Fetched once at boot, indexed in memory, never written to. There is no
 * runtime database for content.
 *
 * The unit of study is the word. Kanji records exist to teach (components,
 * etymology, readings) and to draw the collection sheet; a kanji's progress is
 * derived from the words that contain it.
 */

export interface Component {
  /** the component character */
  c: string
  /** its name in English */
  n: string
}

export interface Kanji {
  c: string
  /** meanings, best first */
  m: string[]
  on: string[]
  kun: string[]
  jlpt: number
  grade: number | null
  strokes: number
  freq: number | null
  /** teaching order: JLPT band descending, then frequency */
  order: number
  comp: Component[]
  /** indices into clusters */
  cl: number[]
  /** indices into vocab */
  v: number[]
}

export interface Vocab {
  w: string
  r: string
  m: string
  jlpt: number
  /** corpus kanji this word teaches */
  k: string[]
  /** three precomputed wrong readings */
  d: string[]
  jukugo: boolean
  /** teaching order: each word introduces at most one unmet character */
  o: number
}

/** One historical form of a character. Either a drop-in SVG or, for seal, a
 *  glyph the subsetted seal font can render from the modern codepoint. */
export interface EtymologyForm {
  era: 'oracle' | 'bronze' | 'seal'
  svg?: string
  font?: boolean
}

export type Etymology = EtymologyForm[]

export interface Corpus {
  kanji: Kanji[]
  /** sorted by teaching order */
  vocab: Vocab[]
  clusters: string[][]
  /** character -> ancient forms. Partial by nature; Encounter renders the
   *  strip only where something exists. */
  etymology: Record<string, Etymology>
  byChar: Map<string, Kanji>
  byWord: Map<string, Vocab>
  /** character -> the words that contain it, in teaching order */
  wordsByKanji: Map<string, Vocab[]>
  /** stroke count -> characters, for the fallback distractor rule (spec §3) */
  byStrokes: Map<number, string[]>
  /** import.meta.env.BASE_URL, so components can resolve /etym/*.svg */
  base: string
}

let cached: Corpus | null = null

export async function loadCorpus(): Promise<Corpus> {
  if (cached) return cached

  const base = import.meta.env.BASE_URL
  const [kanji, vocabRaw, clusters, etymology] = await Promise.all([
    fetch(`${base}data/kanji.json`).then((r) => r.json() as Promise<Kanji[]>),
    fetch(`${base}data/vocab.json`).then((r) => r.json() as Promise<Vocab[]>),
    fetch(`${base}data/clusters.json`).then((r) => r.json() as Promise<string[][]>),
    // Supplementary: an empty or missing file just means no strip anywhere.
    fetch(`${base}data/etymology.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, Etymology>>) : {}))
      .catch(() => ({}) as Record<string, Etymology>),
  ])

  // kanji.v indexes the array as built; keep that order, it is the teaching order
  const vocab = vocabRaw
  const byChar = new Map(kanji.map((k) => [k.c, k]))
  const byWord = new Map(vocab.map((v) => [v.w, v]))
  const wordsByKanji = new Map<string, Vocab[]>()
  for (const v of vocab) {
    for (const c of v.k) {
      const list = wordsByKanji.get(c)
      if (list) list.push(v)
      else wordsByKanji.set(c, [v])
    }
  }
  const byStrokes = new Map<number, string[]>()
  for (const k of kanji) {
    const list = byStrokes.get(k.strokes)
    if (list) list.push(k.c)
    else byStrokes.set(k.strokes, [k.c])
  }

  cached = { kanji, vocab, clusters, etymology, byChar, byWord, wordsByKanji, byStrokes, base }
  return cached
}
