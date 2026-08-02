#!/usr/bin/env python3
"""Subset the shipped typefaces down to the glyphs this app can show.

Spec §7 makes the Mincho/Gothic alternation pedagogical, not cosmetic: a
learner who only ever sees one form fails to recognise the other. Shipping the
fonts is therefore not optional — we cannot rely on the phone having a Mincho
face installed (Android generally does not). Full Noto JP is ~5MB each, which
is unacceptable on a phone; subset to the corpus and it is ~40KB each.

    python3 scripts/build_data.py     # first — defines the glyph set
    python3 scripts/build_fonts.py

Also subsets LXGW Seal for the Encounter etymology strip — see
scripts/build_etymology.py for why that strip exists and where it may appear.

All fonts are SIL Open Font License 1.1. See public/fonts/OFL.txt (Noto) and
public/fonts/OFL-LXGWSeal.txt (seal).
"""

import json
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "scripts", "sources", "fonts")
OUT = os.path.join(ROOT, "public", "fonts")
DATA = os.path.join(ROOT, "public", "data")

# Only two text faces ship. Latin UI text uses the platform system font, which
# costs nothing and looks native on a phone; the JP faces exist solely so the
# Mincho/Gothic alternation in §7 is guaranteed rather than hoped for.
FACES = [
    ("NotoSansJP-Regular.ttf", "noto-sans-jp-400.woff2"),
    ("NotoSerifJP.ttf", "noto-serif-jp-500.woff2"),
]

# The seal face is not a text face — it renders one glyph at a time in the
# Encounter etymology strip. It is subsetted against whatever it actually
# covers rather than the whole corpus.
SEAL_SRC = "LXGWSeal-Regular.ttf"
SEAL_OUT = "seal.woff2"

# LXGW Seal carries Reserved Font Names ('霞鹜' and friends) under OFL 1.1 §4.
# Subsetting is a modification, so the derivative must not ship under those
# names. Renaming is the compliant path, not a cosmetic choice.
SEAL_FAMILY = "KNG Seal Subset"


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
    build_seal()


def seal_coverage():
    """Which corpus characters LXGW Seal actually has a glyph for.

    The font is at version 0.001 and covers a few hundred characters, so this
    is genuinely partial. Encounter renders the strip only where a form exists,
    exactly as it already does for component decompositions.
    """
    from fontTools.ttLib import TTFont

    src = os.path.join(SRC, SEAL_SRC)
    if not os.path.exists(src):
        return []
    cmap = TTFont(src).getBestCmap()
    with open(os.path.join(DATA, "kanji.json"), encoding="utf-8") as f:
        chars = [k["c"] for k in json.load(f)]
    return [c for c in chars if ord(c) in cmap]


def build_seal():
    covered = seal_coverage()
    if not covered:
        print("  seal font not present — skipping (run scripts/fetch_sources.py)")
        return []
    out = os.path.join(OUT, SEAL_OUT)
    subprocess.run(
        [
            sys.executable, "-m", "fontTools.subset",
            os.path.join(SRC, SEAL_SRC),
            f"--text={''.join(covered)}",
            "--flavor=woff2",
            "--no-hinting",
            f"--name-IDs=*",
            f"--output-file={out}",
        ],
        check=True,
    )
    rename_family(out, SEAL_FAMILY)
    # OFL 1.1 §2: the licence travels with the font, original and derivative.
    licence = os.path.join(SRC, "LXGWSeal-OFL.txt")
    if os.path.exists(licence):
        shutil.copy(licence, os.path.join(OUT, "OFL-LXGWSeal.txt"))
    print(f"  {SEAL_OUT:26s} {os.path.getsize(out) / 1024:6.1f} KB  "
          f"({len(covered)} characters)")
    return covered


def rename_family(path, family):
    """OFL 1.1 §4: a modified font may not carry the original's Reserved Font
    Name. Rewrite the family/full/PostScript names on the subset."""
    from fontTools.ttLib import TTFont

    font = TTFont(path)
    ps = family.replace(" ", "")
    for record in font["name"].names:
        if record.nameID in (1, 16):
            record.string = family
        elif record.nameID in (4, 18):
            record.string = family
        elif record.nameID == 6:
            record.string = ps
        elif record.nameID == 3:
            record.string = f"{ps};subset"
    font.save(path)


if __name__ == "__main__":
    main()
