#!/usr/bin/env python3
"""Subset Noto Sans JP / Noto Serif JP down to the glyphs this app can show.

Spec §7 makes the Mincho/Gothic alternation pedagogical, not cosmetic: a
learner who only ever sees one form fails to recognise the other. Shipping the
fonts is therefore not optional — we cannot rely on the phone having a Mincho
face installed (Android generally does not). Full Noto JP is ~5MB each, which
is unacceptable on a phone; subset to the corpus and it is ~40KB each.

    python3 scripts/build_data.py     # first — defines the glyph set
    python3 scripts/build_fonts.py

Fonts are SIL Open Font License 1.1. See public/fonts/OFL.txt.
"""

import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "scripts", "sources", "fonts")
OUT = os.path.join(ROOT, "public", "fonts")
DATA = os.path.join(ROOT, "public", "data")

# Only two faces ship. Latin UI text uses the platform system font, which
# costs nothing and looks native on a phone; the JP faces exist solely so the
# Mincho/Gothic alternation in §7 is guaranteed rather than hoped for.
FACES = [
    ("NotoSansJP-Regular.ttf", "noto-sans-jp-400.woff2"),
    ("NotoSerifJP.ttf", "noto-serif-jp-500.woff2"),
]


def glyph_set():
    chars = set()
    with open(os.path.join(DATA, "kanji.json"), encoding="utf-8") as f:
        for k in json.load(f):
            chars.add(k["c"])
            chars.update("".join(k["on"]) + "".join(k["kun"]))
            for comp in k["comp"]:
                chars.add(comp["c"])
    with open(os.path.join(DATA, "vocab.json"), encoding="utf-8") as f:
        for v in json.load(f):
            chars.update(v["w"] + v["r"] + "".join(v["d"]))
    with open(os.path.join(DATA, "clusters.json"), encoding="utf-8") as f:
        for cl in json.load(f):
            chars.update(cl)
    # kana in full, plus the Latin/punctuation the UI itself renders in JP faces
    chars.update(chr(c) for c in range(0x3040, 0x30FF))
    chars.update("　、。・ー～！？「」『』（）〜…")
    chars.update(" abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
    chars.update(".,:;!?'\"()[]/-–—+×%")
    return "".join(sorted(chars))


def main():
    if not os.path.isdir(SRC):
        sys.exit(f"missing {SRC} — run scripts/fetch_sources.py first")
    os.makedirs(OUT, exist_ok=True)
    text = glyph_set()
    print(f"  glyph set: {len(text)} characters")
    for src, dst in FACES:
        subprocess.run(
            [
                sys.executable, "-m", "fontTools.subset",
                os.path.join(SRC, src),
                f"--text={text}",
                "--layout-features=kern,liga,palt,vert,locl",
                "--flavor=woff2",
                "--no-hinting",
                "--desubroutinize",
                f"--output-file={os.path.join(OUT, dst)}",
            ],
            check=True,
        )
        kb = os.path.getsize(os.path.join(OUT, dst)) / 1024
        print(f"  {dst:26s} {kb:6.1f} KB")


if __name__ == "__main__":
    main()
