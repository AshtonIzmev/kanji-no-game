#!/usr/bin/env python3
"""Download the raw corpora into scripts/sources/ (gitignored).

Run once before scripts/build_data.py. See build_data.py's docstring for why
these particular mirrors stand in for KANJIDIC2 and jmdict-simplified.
"""

import os
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, "scripts", "sources")

SOURCES = {
    "kanji.json": "https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json",
    "ids.txt": "https://raw.githubusercontent.com/cjkvi/cjkvi-ids/master/ids.txt",
    "jlpt_n5.csv": "https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n5.csv",
    "jlpt_n4.csv": "https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n4.csv",
    "jlpt_n3.csv": "https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n3.csv",
    # Small Seal Script, for the etymology strip in Encounter mode. Maps modern
    # codepoints straight to seal glyphs, so it costs a subsetted font rather
    # than one asset per character. SIL OFL 1.1.
    "fonts/LXGWSeal-Regular.ttf": "https://raw.githubusercontent.com/lxgw/LxgwSeal/main/TTF/LXGWSeal-Regular.ttf",
    "fonts/LXGWSeal-OFL.txt": "https://raw.githubusercontent.com/lxgw/LxgwSeal/main/OFL.txt",
}

os.makedirs(DEST, exist_ok=True)
os.makedirs(os.path.join(DEST, "fonts"), exist_ok=True)
for name, url in SOURCES.items():
    path = os.path.join(DEST, name)
    if os.path.exists(path):
        print(f"  have  {name}")
        continue
    print(f"  fetch {name} <- {url}")
    urllib.request.urlretrieve(url, path)
print("done")
