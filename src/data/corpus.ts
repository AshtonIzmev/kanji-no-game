/**
 * The corpus: three static JSON files built by scripts/build_data.py (spec §4).
 * Fetched once at boot, indexed in memory, never written to. There is no
 * runtime database for content.
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
  vocab: Vocab[]
  clusters: string[][]
  /** character -> ancient forms. Partial by nature; Encounter renders the
   *  strip only where something exists. */
  etymology: Record<string, Etymology>
  byChar: Map<string, Kanji>
  /** stroke count -> characters, for the fallback distractor rule (spec §3) */
  byStrokes: Map<number, string[]>
  /** import.meta.env.BASE_URL, so components can resolve /etym/*.svg */
  base: string
}

let cached: Corpus | null = null

export async function loadCorpus(): Promise<Corpus> {
  if (cached) return cached

  const base = import.meta.env.BASE_URL
  const [kanji, vocab, clusters, etymology] = await Promise.all([
    fetch(`${base}data/kanji.json`).then((r) => r.json() as Promise<Kanji[]>),
    fetch(`${base}data/vocab.json`).then((r) => r.json() as Promise<Vocab[]>),
    fetch(`${base}data/clusters.json`).then((r) => r.json() as Promise<string[][]>),
    // Supplementary: an empty or missing file just means no strip anywhere.
    fetch(`${base}data/etymology.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, Etymology>>) : {}))
      .catch(() => ({}) as Record<string, Etymology>),
  ])

  const byChar = new Map(kanji.map((k) => [k.c, k]))
  const byStrokes = new Map<number, string[]>()
  for (const k of kanji) {
    const list = byStrokes.get(k.strokes)
    if (list) list.push(k.c)
    else byStrokes.set(k.strokes, [k.c])
  }

  cached = { kanji, vocab, clusters, etymology, byChar, byStrokes, base }
  return cached
}
