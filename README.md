# 漢字 — Kanji No Game

A JLPT-ordered kanji **recognition** trainer that teaches through words. Phone
only. No backend.

Implements Build Spec v1 with one structural change: the unit of study is the
**word**, not the character. One item pool of 420 N5/N4 words, one FSRS
scheduler, two presentations (Encounter and Arcade), four card types, a falling
game, and a genkō yōshi collection sheet of kanji as the home screen — each
square's progress derived from the words that contain it.

```
npm install
npm run data          # fetch corpora + build public/data/*.json (prints the yield check)
npm run fonts         # subset the JP + seal faces, rebuild the etymology strip
npm run dev
```

The built corpus, fonts and icons are committed, so `npm install && npm run dev`
works without touching Python.

---

## The three changes to the spec, and why

**Words, not characters.** The spec's item was the kanji, with one FSRS card
blending its meaning and all its readings. That card has a homophone problem
(し is read by 13 characters in this corpus, こう by 9) and a granularity
problem (knowing 生 means "life" says nothing about whether you know せい, い or
なま). Both dissolve when the item is a word: 学生, 生きる and 生まれる are
three cards with three schedules, and a spoken word is unambiguous where a
spoken reading is not. The next reading of a character arrives when the next
word containing it arrives, under the same daily cap — no facet machinery.
The kanji sheet stays: a square is *learning* once any word containing the
character has been met, *solid* once one is solid, *burned* once all are. The
JLPT N4 exam tests words in context and never bare kanji, so this is also the
more honest target.

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

The database is at v3. v1 held one card per kanji; there is no honest way to
turn a kanji card into word cards, so opening the app over a v1 database drops
the item and review tables and keeps the streak and session history. v1 backups
are refused on import for the same reason.

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
vocabulary words kept          420        (183 jukugo)
confusion clusters kept         74

RECOGNISE constructible         245 / 245  (100.0%)
DISCRIMINATE w/ real cluster    144 / 245  ( 58.8%)   rest → stroke-count ±1 fallback
READ constructible              243 / 245  ( 99.2%)
  of which with a jukugo        174 / 245  ( 71.0%)
ENCOUNTER w/ decomposition      170 / 245  ( 69.4%)

TOTAL  152.6 KB raw / 39.9 KB gzip        (budget: 800 KB)
```

Go. The 30% of characters with no decomposition are the pictographs — 日 山 川
have no components, and inventing some would be a lie. They get the etymology
strip instead (below).

The vocabulary is N5 and N4 words only. The source lists also carry an N3
sheet; it is used as a fallback for exactly the characters no N5/N4 word on the
list happens to cover (不 京 公 友 田 野) plus 日本, which sits on the N3 sheet
for no reason an N5 learner would accept. Before this rule 42% of the READ deck
was N3 words like 特長 and 重なる. Words with the iteration mark (人々) are
dropped: that is a rendaku exercise, not a kanji reading.

One data bug worth recording so it does not come back: the loader stripped a
trailing な/だ from readings to normalise na-adjectives, and every row it
touched was a plain noun — 大人 shipped as おと, 女 as おん, 魚 as さか, 花 as は,
体 as から. Only する/します are stripped now.

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
| MEANING | written word | 4 English meanings | meanings of confusable words |
| WHICH | English meaning | 4 written words | words sharing a character, then words built on a visual near-twin (犬 against 大 and 太), then same shape and band |
| READ | written word | 4 kana readings | precomputed at build time |
| LISTEN | the word, spoken | 4 written words | as WHICH, minus homophones |

The first probe after a word is taught is always MEANING; after that the type
rotates deterministically per word, so every type comes round on a predictable
cadence. Choice order is seeded by (word, review count): reproducible, never
the same layout twice running. The confusion pool prefers words the learner has
already met — confusion is between things you have seen.

**Audio is a cue, never a requirement.** LISTEN speaks the word through the
phone's own Japanese voice (Web Speech API: offline, no assets) and shows the
kana `LISTEN_REVEAL_MS` later regardless — ringer switch, train, or a phone
with no Japanese voice must never make a card unanswerable. With no voice the
card degrades to kana → written form, still a card. In arcade the clock waits
for the voice to finish. Every card also speaks the word at feedback. Sound can
be muted on the stats screen. Speech *input* is deliberately absent: it is
slow, server-bound on iOS and hopeless in noise. Speaking remains a non-goal.

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

### Teaching order

Words are ordered at build time so that each one introduces **at most one
character the learner has not met**: a word becomes teachable once every
character in it has been reached in the kanji order (JLPT band, then
frequency), kun words before jukugo, shorter first. All 420 words satisfy this;
the first 147 use only N5 characters. The Encounter panel therefore almost
always has exactly one character to dwell on, shown in full (components,
etymology, other words), with the word's already-met characters listed
compactly beneath. A consequence worth knowing: 東 is reachable only through
東京, so it waits for 京.

### Placement — "I know N5"

The teaching order is N5 first, fifteen words a day, hard. For someone who
already passed N5 that is ten sessions of being taught 日 and 一 before the
first N4 character appears, and the seven-day gate below would then blame the
design for what was the onboarding.

So a fresh install offers, once, to mark N5 as known (the same button lives on
the stats screen afterwards). "Known" is a claim, and it is recorded as FSRS
state rather than as a skip: the 147 words written entirely with N5 characters
enter as Review items at `KNOWN_SEED_STABILITY_DAYS` (10) with their first
review spread over the next `KNOWN_SEED_SPREAD_DAYS` (10), so tomorrow is not a
147-review day. Each is then drilled once in arcade; a miss drops it into
relearning like any other lapse. Nothing is trusted, nothing is taught twice.
New words bring in N4 characters from the first session, and kanji rain
(below) is unlocked immediately.

### 雨 — kanji rain

The WHICH and LISTEN cards with the choices falling. A meaning sits along the
bottom edge, where the thumb already is — or, every `RAIN_LISTEN_EVERY`th
wave, the word is spoken and the kana appears a moment later; four written
words descend in four lanes; tap the one it names before it reaches the ground.
A wrong tap or a landing costs one of three lives. The fall takes 7 seconds on
wave 1 and 3 seconds by wave 30 — the session's arcade clock is a bar that
shrinks, here the clock is the word getting closer.

Two rules keep it honest:

- **It never teaches.** Only words already in arcade state fall
  (`modeFor(item) === 'arcade'`), and the mode is locked until eight of them
  exist. The etymology strip and every other teaching aid stay out for the same
  reason they stay off graded prompts.
- **Every wave is one real review.** The target is graded through the same
  `gradeFor('arcade', …)` rule as a session card — Easy if caught in the top
  40% of the field, Hard below 80%, Again on a miss — and written to the same
  FSRS row. A run is planned due-first, then longest-unreviewed, so it clears
  the review queue rather than re-drilling yesterday's words. Runs are capped
  at 40 waves. Rain scores are kept apart from arcade sessions so the ghost run
  is not polluted.

Logic lives in `src/game/rain.ts` with no React in it; `RainScreen.tsx` only
draws it. `scripts/smoke-rain.mjs` takes the placement offer, plays a few waves,
lets one land, throws the rest, and dumps what was written to IndexedDB.

### Retention (§5)

Collection sheet as home, four mastery tiers straight off FSRS stability (a
kanji's tier derived from its words), a
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
  smoke-rain.mjs      placement offer → kanji rain → run summary
  smoke-migrate.mjs   open the app over a v1 (kanji-keyed) database
data/clusters.json    hand-curated visual confusion sets — do not generate these
data/etymology/       drop-in ancient-form SVGs (see its README)
src/
  config.ts           every tunable number, with the reason it has that value
  data/corpus.ts      load + index the static JSON; words by kanji
  db/db.ts            Dexie schema (v3: one row per word), day keys, export/import
  audio/speak.ts      the phone's Japanese voice; muteable; never required
  srs/scheduler.ts    FSRS, mode routing, tiers, arcade clock, grading
  srs/queue.ts        due reviews + capped new items
  srs/seed.ts         placement: mark a band as known, as FSRS state
  game/rain.ts        雨 — waves, drops, planning, scoring; no React
  cards/build.ts      the four card types and the confusable-word pool
  session/useSession  queue, grading, persistence, score
  components/         GenkoCell · ChoiceGrid · CollectionGrid · EtymologyStrip
  screens/            Home · Session · WordPanel · Encounter · Summary · KanjiSheet · Stats · Rain
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

Isolated Jukugo Minimal Pairs (§9) is a fifth card type with no architectural
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
