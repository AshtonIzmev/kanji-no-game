# 漢字 — Kanji No Game

A JLPT-ordered kanji **recognition** trainer. Phone only. No backend.

Implements Build Spec v1: one item pool, one FSRS scheduler, two presentations
(Encounter and Arcade), three card types, and a genkō yōshi collection sheet as
the home screen.

```
npm install
npm run data          # fetch corpora + build public/data/*.json (prints the yield check)
npm run fonts         # subset the JP + seal faces, rebuild the etymology strip
npm run dev
```

The built corpus, fonts and icons are committed, so `npm install && npm run dev`
works without touching Python.

---

## The two changes to the spec, and why

**No backend.** §6 carved out one deviation from "zero backend" — a two-endpoint
FastAPI service so SRS state would not fork between phone and desktop. That
deviation is dropped: this build is phone-only, so there is no second device to
fork against and no reason for a server to exist. Everything lives in IndexedDB.

The honest consequence is that the phone holds the only copy of your SRS state.
Rather than pretend otherwise, the stats screen says so and offers
export/import of the whole database as a JSON file — the device-transfer path,
and the backup to take before clearing browser storage. §6's sync endpoints
remain the right answer the day a second device appears; nothing in the data
model prevents adding them.

**Phone only, meant literally.** Layouts are `dvh`-height flex columns with
safe-area insets, thumb-reachable 2×2 choices, and a hard `26rem` column cap on
wider screens — not a responsive app that happens to work small. There are no
desktop breakpoints because there is no desktop design.

### Two source substitutions in the data pipeline

Neither original is reachable from the build environment; both stand-ins carry
the same fields. Documented at the top of `scripts/build_data.py`.

| Spec | Used | Why |
|---|---|---|
| KANJIDIC2 (edrdg.org) | `davidluzgouveia/kanji-data` | Straight KANJIDIC2 derivative: meanings, on/kun, `jlpt_new`, grade, strokes, freq |
| jmdict-simplified | `jamsinclair/open-anki-jlpt-decks` | Spec wanted JMdict's `common` tag as a quality filter; JLPT lists filter for common **and** level-appropriate |

`cjkvi-ids` and the hand-curated clusters are as specified. KanjiVG is not used
at all, as directed.

---

## Milestone 0 — the yield check

`npm run data` prints this and dumps 30 random items to stdout. Read them.

```
kanji in corpus (N5+N4)        245        N5 79 · N4 166
vocabulary words kept          715        (351 jukugo)
confusion clusters kept         74

RECOGNISE constructible         245 / 245  (100.0%)
DISCRIMINATE w/ real cluster    144 / 245  ( 58.8%)   rest → stroke-count ±1 fallback
READ constructible              243 / 245  ( 99.2%)
  of which with a jukugo        213 / 245  ( 86.9%)
ENCOUNTER w/ decomposition      170 / 245  ( 69.4%)

TOTAL  152.6 KB raw / 39.9 KB gzip        (budget: 800 KB)
```

Go. The 30% of characters with no decomposition are the pictographs — 日 山 川
have no components, and inventing some would be a lie. They get the etymology
strip instead (below).

READ distractors are generated three ways, best first: the word's own kanji read
the wrong way (学校 → がくこう), a phonetic near-miss (rendaku, gemination, vowel
length), and only as a last resort a real reading borrowed from another kanji.
Everything is filtered for pronounceability, so no card offers a choice nobody
could believe.

---

## Architecture

```
                    ┌─────────────────┐
                    │  FSRS scheduler │   one pool: one card per kanji
                    └────────┬────────┘
              stability < 3d │ stability ≥ 3d
            ┌────────────────┴────────────────┐
            ▼                                 ▼
     ENCOUNTER MODE                     ARCADE MODE
     no clock                           6s → 2.5s, shrinks with stability
     teach → probe (first meeting)      4-choice, combo, ghost
     probe → teach (every one after)    auto-advance
```

Mode is never a user-facing toggle — `modeFor()` in `src/srs/scheduler.ts` is a
pure function of FSRS state. Relearning routes back to Encounter: an item that
lapsed has demonstrably not stuck, and drilling it *faster* is the wrong answer.

One deliberate reading of §2: the teaching panel is shown **before** the probe
only the first time a character is met. On later Encounter reviews the probe
comes first and the panel is the feedback, so elaboration never costs the
retrieval practice.

### Card types (§3)

| Type | Prompt | Choices | Distractor source |
|---|---|---|---|
| RECOGNISE | kanji glyph | 4 English meanings | cluster peers, then stroke-count ±1 |
| DISCRIMINATE | English meaning | 4 kanji | the confusion cluster; fallback stroke-count ±1 from the seen set |
| READ | jukugo | 4 kana readings | precomputed at build time |

Type rotates deterministically per item, so every type comes round on a
predictable cadence. Choice order is seeded by (item, review count):
reproducible, never the same layout twice running.

### The etymology strip (字源)

Encounter shows how a character got its shape: ancient forms → today.

**Encounter only, and that is load-bearing.** An ancient form must never appear
on a graded prompt or among the choices. Reading is glyph → meaning under time
pressure; a picture beside the glyph becomes the retrieval cue, and the learner
gets faster at pictures instead of kanji. That is the Transfer-Appropriate
Processing argument the spec used to kill Iteration 1, and it applies here
exactly as hard.

It goes where the gap already was. The 75 characters with no component
decomposition are the pictographs — they have no components because they are
not built from anything. Those cards previously had nothing structural to say,
and they are the only characters where an image is a historical fact rather
than an invented mnemonic. 山 has three peaks because it was drawn as three
peaks.

**Coverage today: 50 / 245 characters (34 of them N5).** Honest accounting:

- Seal forms come from [LXGW Seal](https://github.com/lxgw/LxgwSeal) (OFL 1.1),
  which maps modern codepoints straight to Small Seal Script — so coverage costs
  an 11 KB subsetted font rather than one asset per character. The font is at
  v0.001 and covers a few hundred characters in total.
- Oracle bone and bronze forms need per-character art. Wikimedia Commons has
  exactly that, public domain, already named `山-oracle.svg` — but
  `upload.wikimedia.org` is denied by this project's build-environment egress
  policy, and the build does not route around it.

So the mechanism is complete and the corpus is not. Drop SVGs into
`data/etymology/` using Commons' own naming and re-run `npm run fonts` — no code
change, and drop-ins take precedence over the font. `scripts/build_etymology.py`
prints coverage every run. Where there is no form, the strip does not render, the
same way "built from" already doesn't.

The subset is renamed `KNG Seal Subset` because LXGW Seal carries Reserved Font
Names under OFL 1.1 §4 and subsetting is a modification.

### Retention (§5)

Collection sheet as home, four mastery tiers straight off FSRS stability, a
daily streak that counts on one answered card, ghost runs against your own best
timed session (live delta in the arcade header, full comparison at the summary),
and the caps: **5 new per session, 15 per day, hard**.

### Visual direction (§7)

One idea: the manuscript square. Prompts render in one, the combo meter fills
its centring cross from the middle outward, the collection grid is a sheet of
them. Paper `#EDEFE8`, sumi ink, genkō rules, 朱書き red on errors only, celadon
for mastery.

Mincho and Gothic alternate per item, fixed by a hash of the character so a
kanji never flickers between forms. Both faces ship subsetted to the corpus
(~220 KB total) rather than relying on the phone having a Mincho face — Android
usually does not, and the alternation is pedagogical, not decorative.

Motion is one thing: correct answers ink the glyph in over 180ms, errors flash
the cell border red. `prefers-reduced-motion` collapses both.

---

## Layout

```
scripts/
  fetch_sources.py    corpora → scripts/sources/ (gitignored)
  build_data.py       → public/data/*.json + the yield check
  build_fonts.py      → public/fonts/*.woff2 (subset to the corpus)
  build_etymology.py  → public/data/etymology.json + public/etym/ (字源 strip)
  build_icons.py      → public/icon*.{svg,png}
  smoke.mjs           walk a session in an iPhone viewport, screenshot each state
  smoke-arcade.mjs    same, with mature FSRS state seeded so arcade is reachable
data/clusters.json    hand-curated visual confusion sets — do not generate these
data/etymology/       drop-in ancient-form SVGs (see its README)
src/
  config.ts           every tunable number, with the reason it has that value
  data/corpus.ts      load + index the static JSON
  db/db.ts            Dexie schema, day keys, export/import
  srs/scheduler.ts    FSRS, mode routing, tiers, arcade clock, grading
  srs/queue.ts        due reviews + capped new items
  cards/build.ts      the three card types and their distractors
  session/useSession  queue, grading, persistence, score
  components/         GenkoCell · ChoiceGrid · CollectionGrid · EtymologyStrip
  screens/            Home · Session · Encounter · Summary · KanjiSheet · Stats
```

The smoke scripts need Playwright (`npm i -D playwright`); they are a way to
look at the app, not a test suite.

---

## Do not tune yet

`GRADUATION_STABILITY_DAYS = 3` is the spec's starting value. Leave it until
fourteen days of real reviews exist. Same for the new-item caps — they are the
most important numbers in the build, and raising them is how the app dies on
day four.

Per §8, M2–M4 shipped alongside M1 rather than behind the seven-day gate. The
gate's purpose stands: **if this ships and you don't play it for seven days, the
conclusion is that the design is wrong, not that it needs more features.**

---

## Parked

Isolated Jukugo Minimal Pairs (§9) is a fourth card type with no architectural
change — `ids.txt` is already parsed and the reverse index is ~30 lines. Revisit
at N3, when the phonetic-series density exists. LLM mnemonics and voice-tutor
coupling stay parked.

Handwriting production and speaking remain explicit non-goals.

---

Fonts are Noto Sans JP / Noto Serif JP and a renamed subset of LXGW Seal, all
under the SIL Open Font License 1.1
(`public/fonts/OFL.txt`). Kanji data derives from KANJIDIC2 and JMdict
(Electronic Dictionary Research and Development Group, CC BY-SA); component
decompositions from CHISE / cjkvi-ids.
