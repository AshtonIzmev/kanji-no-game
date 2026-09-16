/**
 * Every tunable number in the app, in one file, with the reason it has the
 * value it has. Spec §2 and §5.
 */

/**
 * Graduation threshold T (spec §2). Below it an item is taught in ENCOUNTER
 * mode; at or above it, drilled in ARCADE mode.
 *
 * "start at FSRS stability >= 3 days. Tune empirically after two weeks of real
 * data. Do not tune before." — leave this alone until 14 days of reviews exist.
 */
export const GRADUATION_STABILITY_DAYS = 3

/** Mastery tiers, derived from FSRS stability only. No invented metric. */
export const TIER_SOLID_DAYS = 3
export const TIER_BURNED_DAYS = 21

/**
 * New-item caps (spec §5): "the most important number in the spec".
 * Uncapped intake creates a review avalanche on day four and kills the app.
 */
export const NEW_PER_SESSION = 5
export const NEW_PER_DAY = 15

/** Session length. Short enough to do standing up on a train. */
export const MAX_SESSION_CARDS = 24

/** Arcade timer, seconds. Shrinks as stability rises — that is the mechanism
 *  that forces retrieval to automate. */
export const ARCADE_TIME_MAX = 6
export const ARCADE_TIME_MIN = 2.5
/** Stability (days) at which the timer reaches its floor. */
export const ARCADE_TIME_FLOOR_AT = 60

/** Encounter mode holds the teaching panel for at least this long before the
 *  probe is answerable — depth of processing is the entire point. */
export const ENCOUNTER_MIN_STUDY_MS = 2200

/** The day boundary. 4am, not midnight: a session at 1am belongs to the day
 *  that is ending, not the one starting. */
export const DAY_ROLLOVER_HOUR = 4

/**
 * "I already know N5." Seeded items enter as Review with this stability, so
 * they are drilled in arcade from day one instead of being taught. One failed
 * drill drops them into relearning — the claim is checked, never trusted.
 */
export const KNOWN_SEED_STABILITY_DAYS = 10
/** …and their first review is spread across this many days, so marking 79
 *  characters known does not make tomorrow a 79-review day. */
export const KNOWN_SEED_SPREAD_DAYS = 10

/**
 * 雨 — kanji rain. A DISCRIMINATE card with the choices falling. Every number
 * here is a first guess; the only one that matters pedagogically is
 * RAIN_UNLOCK, which keeps the game from ever *teaching*.
 */
/** Characters in arcade state needed before the mode opens. */
export const RAIN_UNLOCK = 8
export const RAIN_LIVES = 3
/** A run is at most this many waves — one graded review each. */
export const RAIN_MAX_WAVES = 40
/** Seconds for a glyph to fall the height of the field, wave 1 → floor. */
export const RAIN_FALL_MAX_S = 7
export const RAIN_FALL_MIN_S = 3
/** Wave at which the fall time reaches its floor. */
export const RAIN_FLOOR_AT_WAVE = 30
export const RAIN_LANES = 4
