#!/usr/bin/env python3
"""Build the Encounter etymology strip's data: public/data/etymology.json.

Why this exists at all. The N5/N4 core is overwhelmingly pictographs — 75 of
the 245 characters in the corpus have no component decomposition, because they
are not built from anything: they *are* pictures. Those are precisely the cards
where the Encounter panel has nothing to say beyond meanings and readings, and
precisely where an image is a historical fact rather than an invented mnemonic.
山 has three peaks because it was drawn as three peaks.

Deliberately Encounter-only. An ancient form must never appear on a graded
prompt or among the choices: reading is glyph → meaning under time pressure,
and a picture beside the glyph would become the retrieval cue. That is the same
Transfer-Appropriate Processing argument the spec used to kill Iteration 1.

Two sources, both optional, merged per character:

  seal    LXGW Seal (SIL OFL 1.1) maps modern codepoints straight to Small Seal
          Script glyphs, so coverage costs a subsetted font rather than one
          asset per character. At v0.001 it covers a few hundred characters.

  drop-in Any SVG placed in data/etymology/ named <character>-<era>.svg, where
          era is oracle | bronze | seal. This is the Wikimedia Commons naming
          convention on purpose: upload.wikimedia.org is blocked by this
          session's egress policy, so the public-domain per-character tracings
          cannot be fetched here. Drop them into that directory and re-run —
          no code change, and they take precedence over the font.

    python3 scripts/build_etymology.py
"""

import json
import os
import re
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_FONT = os.path.join(ROOT, "scripts", "sources", "fonts", "LXGWSeal-Regular.ttf")
DROP_IN = os.path.join(ROOT, "data", "etymology")
DATA = os.path.join(ROOT, "public", "data")
ASSETS = os.path.join(ROOT, "public", "etym")

ERAS = ("oracle", "bronze", "seal")
DROP_IN_RE = re.compile(r"^(.)-(oracle|bronze|seal)\.svg$")


def seal_covered(chars):
    if not os.path.exists(SRC_FONT):
        return set()
    from fontTools.ttLib import TTFont

    cmap = TTFont(SRC_FONT).getBestCmap()
    return {c for c in chars if ord(c) in cmap}


def drop_ins():
    """character -> {era: filename}, from data/etymology/."""
    found = {}
    if not os.path.isdir(DROP_IN):
        return found
    for name in sorted(os.listdir(DROP_IN)):
        m = DROP_IN_RE.match(name)
        if not m:
            continue
        found.setdefault(m.group(1), {})[m.group(2)] = name
    return found


def main():
    with open(os.path.join(DATA, "kanji.json"), encoding="utf-8") as f:
        kanji = json.load(f)
    chars = [k["c"] for k in kanji]
    no_components = {k["c"] for k in kanji if not k["comp"]}

    font_seal = seal_covered(chars)
    svgs = drop_ins()

    if os.path.isdir(ASSETS):
        shutil.rmtree(ASSETS)

    out = {}
    copied = 0
    for c in chars:
        forms = []
        for era in ERAS:
            name = svgs.get(c, {}).get(era)
            if name:
                os.makedirs(ASSETS, exist_ok=True)
                shutil.copy(os.path.join(DROP_IN, name), os.path.join(ASSETS, name))
                copied += 1
                forms.append({"era": era, "svg": name})
        # the font only supplies seal, and only if no drop-in already did
        if c in font_seal and not any(f["era"] == "seal" for f in forms):
            forms.append({"era": "seal", "font": True})
        if forms:
            out[c] = forms

    with open(os.path.join(DATA, "etymology.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    size = os.path.getsize(os.path.join(DATA, "etymology.json")) / 1024
    pictographs = sum(1 for c in out if c in no_components)
    print("  etymology.json")
    print(f"    characters with a form   {len(out):4d} / {len(chars)}"
          f"  ({100 * len(out) / len(chars):.1f}%)")
    print(f"      from the seal font     {len(font_seal):4d}")
    print(f"      from data/etymology/   {copied:4d} SVG files")
    print(f"    of the {len(no_components)} pictographs      {pictographs:4d}"
          f"  ({100 * pictographs / len(no_components):.0f}% — the set this "
          f"feature exists for)")
    print(f"    payload                  {size:.1f} KB")
    if not svgs:
        print()
        print("    No drop-in SVGs. For full coverage put per-character files in")
        print("    data/etymology/ named 山-oracle.svg, 山-bronze.svg, 山-seal.svg")
        print("    (Wikimedia Commons' own naming) and re-run this script.")


if __name__ == "__main__":
    main()
