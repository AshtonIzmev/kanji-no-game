#!/usr/bin/env python3
"""
Kanji-No-Game data pipeline (spec §4).

Build-time only. Reads the four sources in scripts/sources/ and emits three
static JSON files into public/data/. There is no runtime database for content.

    python3 scripts/fetch_sources.py     # once
    python3 scripts/build_data.py        # emits public/data/*.json + yield check

Source substitutions, and why:

  KANJIDIC2            -> davidluzgouveia/kanji-data `kanji.json`
        edrdg.org is not reachable from the build environment. This file is a
        straight KANJIDIC2 derivative and carries every field the spec asks
        for: meanings, on/kun readings, jlpt_new, grade, stroke count, freq.

  jmdict-simplified    -> jamsinclair/open-anki-jlpt-decks `src/n{5,4,3}.csv`
        The jmdict-simplified release artifacts are not reachable either. The
        spec wanted JMdict's `common` tag as a quality filter; the JLPT lists
        are a *better* filter at this level — every word is both common and
        level-appropriate, which `common` alone does not guarantee.

  cjkvi-ids `ids.txt`  -> unchanged.
  clusters.json        -> hand-curated, data/clusters.json.
"""

import csv
import json
import os
import random
import re
import sys

from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "scripts", "sources")
OUT = os.path.join(ROOT, "public", "data")
CURATED = os.path.join(ROOT, "data")

BANDS = (5, 4)  # JLPT levels in the v1 corpus

KANJI_RE = re.compile(r"[一-龯㐀-䶿]")
KANA_RE = re.compile(r"^[぀-ゟ゠-ヿーー]+$")
IDC = set("⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺⿻⿼⿽⿾⿿")

# Components that are not standalone kanji, or whose kanji meaning is not the
# meaning they carry as a component. Encounter mode shows these names (spec §2).
RADICAL_NAMES = {
    "亻": "person", "彳": "step / go", "氵": "water", "冫": "ice",
    "忄": "heart / feeling", "扌": "hand", "犭": "beast", "阝": "hill / village",
    "艹": "grass", "宀": "roof", "冖": "cover", "广": "lean-to roof",
    "厂": "cliff", "疒": "sickness", "衤": "clothing", "礻": "altar / spirit",
    "糹": "thread", "糸": "thread", "訁": "speech", "讠": "speech",
    "钅": "metal", "飠": "food", "辶": "road / movement", "⻌": "road / movement",
    "廴": "stride", "勹": "wrap", "匚": "box", "囗": "enclosure",
    "夂": "go slowly", "夊": "trail", "尢": "lame", "巛": "river",
    "彡": "hair / rays", "攵": "strike / action", "斤": "axe",
    "殳": "weapon", "灬": "fire", "爫": "claw", "牜": "cow", "王": "king / jade",
    "耂": "old", "肀": "brush", "覀": "cover", "见": "see", "隹": "small bird",
    "頁": "head / page", "髟": "long hair", "鬥": "fight", "亠": "lid",
    "儿": "legs", "冂": "open box", "凵": "container", "刂": "knife",
    "卩": "seal", "厶": "private", "又": "again / hand", "寸": "measure / hand",
    "尸": "corpse / flag", "巾": "cloth", "干": "dry / shield", "幺": "tiny",
    "廾": "two hands", "弋": "stake", "彐": "pig snout", "斗": "ladle",
    "无": "not", "毋": "do not", "比": "compare", "氏": "clan", "爻": "mix",
    "爿": "split wood", "片": "slice", "牙": "fang", "疋": "bolt of cloth",
    "癶": "footsteps", "皮": "skin", "矛": "spear", "禸": "track",
    "禾": "grain", "穴": "hole / cave", "立": "stand", "缶": "jar",
    "网": "net", "羽": "feathers", "而": "rake", "耒": "plough", "耳": "ear",
    "聿": "brush", "臣": "retainer", "至": "arrive", "臼": "mortar",
    "舌": "tongue", "舛": "oppose", "舟": "boat", "艮": "stopping",
    "色": "colour", "虍": "tiger", "虫": "insect", "血": "blood",
    "衣": "clothes", "襾": "cover", "角": "horn", "谷": "valley",
    "豆": "bean", "豕": "pig", "豸": "badger", "貝": "shell / money",
    "赤": "red", "走": "run", "足": "foot", "身": "body", "車": "vehicle",
    "辛": "bitter", "辰": "dragon", "酉": "wine jar", "釆": "distinguish",
    "里": "village", "金": "metal / gold", "長": "long", "門": "gate",
    "隶": "capture", "雨": "rain", "青": "blue / green", "非": "wrong",
    "面": "face", "革": "leather", "韋": "tanned leather", "韭": "leek",
    "音": "sound", "風": "wind", "飛": "fly", "食": "eat", "首": "neck",
    "香": "fragrance", "馬": "horse", "骨": "bone", "高": "tall",
    "鬯": "herbs", "鬲": "cauldron", "鬼": "ghost", "魚": "fish",
    "鳥": "bird", "鹵": "salt", "鹿": "deer", "麥": "wheat", "麻": "hemp",
    "黃": "yellow", "黍": "millet", "黑": "black", "黹": "embroidery",
    "黽": "frog", "鼎": "tripod", "鼓": "drum", "鼠": "rat", "鼻": "nose",
    "齊": "even", "齒": "tooth", "龍": "dragon", "龜": "turtle", "龠": "flute",
    "乚": "hidden / hook", "亅": "hook", "丿": "slash", "乀": "stroke",
    "丶": "dot", "一": "one", "丨": "line", "二": "two",
    "罒": "net", "灬": "fire", "𠘨": "table", "㇒": "stroke",
}

# ids.txt uses circled digits and other placeholders where a component has no
# Unicode codepoint. They are noise on the Encounter screen.
COMPONENT_JUNK = re.compile(r"[①-⑳⓪㊀-㊰&-]")

# --- kana helpers -----------------------------------------------------------

VOICING = {
    "か": "が", "き": "ぎ", "く": "ぐ", "け": "げ", "こ": "ご",
    "さ": "ざ", "し": "じ", "す": "ず", "せ": "ぜ", "そ": "ぞ",
    "た": "だ", "ち": "ぢ", "つ": "づ", "て": "で", "と": "ど",
    "は": "ば", "ひ": "び", "ふ": "ぶ", "へ": "べ", "ほ": "ぼ",
}
UNVOICING = {v: k for k, v in VOICING.items()}
HANDAKU = {"は": "ぱ", "ひ": "ぴ", "ふ": "ぷ", "へ": "ぺ", "ほ": "ぽ"}
UNHANDAKU = {v: k for k, v in HANDAKU.items()}
LONG_PARTNER = {  # vowel that lengthens each row
    "あ": "あ", "か": "あ", "さ": "あ", "た": "あ", "な": "あ", "は": "あ",
    "ま": "あ", "や": "あ", "ら": "あ", "わ": "あ",
    "い": "い", "き": "い", "し": "い", "ち": "い", "に": "い", "ひ": "い",
    "み": "い", "り": "い",
    "う": "う", "く": "う", "す": "う", "つ": "う", "ぬ": "う", "ふ": "う",
    "む": "う", "ゆ": "う", "る": "う",
    "え": "い", "け": "い", "せ": "い", "て": "い", "ね": "い", "へ": "い",
    "め": "い", "れ": "い",
    "お": "う", "こ": "う", "そ": "う", "と": "う", "の": "う", "ほ": "う",
    "も": "う", "よ": "う", "ろ": "う",
}
SMALL_TSU_TRIGGERS = set("かきくけこさしすせそたちつてとはひふへほぱぴぷぺぽ")


def kata_to_hira(s):
    out = []
    for ch in s:
        o = ord(ch)
        if 0x30A1 <= o <= 0x30F6:
            out.append(chr(o - 0x60))
        else:
            out.append(ch)
    return "".join(out)


def clean_reading(r):
    """KANJIDIC-style readings carry okurigana markers and prefix/suffix dots."""
    return kata_to_hira(r.replace("-", "").replace(".", "").replace("！", "").replace("!", ""))


def okurigana_stem(r):
    """`た.べる` -> `た`. Used when composing fake compound readings."""
    r = r.replace("-", "").replace("!", "")
    return kata_to_hira(r.split(".")[0])


# --- load -------------------------------------------------------------------

def load_kanji():
    with open(os.path.join(SRC, "kanji.json"), encoding="utf-8") as f:
        return json.load(f)


def load_ids():
    """char -> list of component chars (one decomposition level, IDCs stripped)."""
    out = {}
    with open(os.path.join(SRC, "ids.txt"), encoding="utf-8") as f:
        for line in f:
            if line.startswith("#"):
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            ch = parts[1]
            # Prefer the Japanese-tagged decomposition when several are listed.
            cand = None
            for field in parts[2:]:
                field = field.strip()
                if not field:
                    continue
                tag = re.search(r"\[([A-Z]+)\]$", field)
                body = re.sub(r"\[[A-Z]+\]$", "", field)
                if tag and "J" in tag.group(1):
                    cand = body
                    break
                if cand is None and tag is None:
                    cand = body
            if cand is None:
                continue
            comps = [c for c in cand if c not in IDC and c != ch]
            out[ch] = comps
    return out


# One word, two readings in the source: the first row wins below, so say which.
READING_PREFERENCE = {
    "日本": "にほん",
}

# Words the N5 list omits (they sit on the N3 sheet) that every N5 learner
# already knows. Kept regardless of the N3-as-fallback rule.
ALWAYS_KEEP = {"日本"}


def load_vocab_rows():
    rows = []
    for level in (5, 4, 3):
        path = os.path.join(SRC, f"jlpt_n{level}.csv")
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                expr = (row.get("expression") or "").strip()
                read = kata_to_hira((row.get("reading") or "").strip())
                mean = (row.get("meaning") or "").strip()
                if not expr or not read or not mean:
                    continue
                # The JLPT lists gloss suru-verbs as 運動 / うんどうする. The
                # reading must match the written form or the card is a lie.
                # Only する/します: an earlier version also stripped な/だ for
                # na-adjectives, which turned 大人 into おと, 女 into おん and
                # 魚 into さか — every such row in the source is a plain noun.
                for suffix in ("する", "します"):
                    if read.endswith(suffix) and not expr.endswith(suffix):
                        read = read[: -len(suffix)]
                        break
                if not read:
                    continue
                # Where the source lists two readings for one word, keep the
                # one the N5 textbooks teach.
                if READING_PREFERENCE.get(expr, read) != read:
                    continue
                rows.append({"w": expr, "r": read, "m": mean, "jlpt": level})
    return rows


def load_clusters():
    with open(os.path.join(CURATED, "clusters.json"), encoding="utf-8") as f:
        return json.load(f)["clusters"]


# --- component naming -------------------------------------------------------

def clean_meaning(m):
    """`Net Radical (no. 122)` -> `net`. KANJIDIC glosses carry radical numbers."""
    m = re.sub(r"\s*\(no\.\s*\d+\)", "", m)
    m = re.sub(r"\s*\bradical\b\s*(variant)?", "", m, flags=re.I)
    return m.strip().lower()


def component_name(ch, kanji_src):
    """A component is only usable if we can name it. No Unicode-name fallback:
    `④ (circled digit four)` is worse than showing nothing."""
    if COMPONENT_JUNK.search(ch):
        return None
    if ch in RADICAL_NAMES:
        return RADICAL_NAMES[ch]
    entry = kanji_src.get(ch)
    # Only Joyo characters get named from their own meaning. Obscure variants
    # like 冋 do have a KANJIDIC gloss, but telling a beginner that 高 is built
    # from "desert" is worse than telling them nothing.
    if entry and entry.get("meanings") and entry.get("grade"):
        name = clean_meaning(entry["meanings"][0])
        if name:
            return name
    return None


def decompose(ch, ids, kanji_src, depth=2):
    """One or two levels down, stopping as soon as a component has a name."""
    comps = ids.get(ch) or []
    if len(comps) < 2:
        return []
    out = []
    for c in comps:
        name = component_name(c, kanji_src)
        if name is None and depth > 1:
            sub = decompose(c, ids, kanji_src, depth - 1)
            if sub:
                out.extend(sub)
                continue
        if name:
            out.append({"c": c, "n": name})
    # dedupe, keep order
    seen, uniq = set(), []
    for c in out:
        if c["c"] in seen:
            continue
        seen.add(c["c"])
        uniq.append(c)
    return uniq if len(uniq) >= 2 else []


# --- READ-card reading distractors -----------------------------------------

def wellformed(r):
    """Reject strings that are not pronounceable Japanese. A distractor has to
    be a word the learner could believe, not noise."""
    if not r or not KANA_RE.match(r):
        return False
    if r[-1] in "っゃゅょ":
        return False
    if r[0] in "っゃゅょんー":
        return False
    for i, ch in enumerate(r[:-1]):
        # a small tsu only ever precedes an unvoiced consonant
        if ch == "っ" and r[i + 1] not in SMALL_TSU_TRIGGERS:
            return False
    return True


def compose_alternate(word, correct, kanji_src):
    """Plausible-but-wrong reading built from the word's own characters.

    The single most useful wrong answer for a jukugo is the right kanji read
    the wrong way — on where kun belongs, or a second on-reading. Okurigana
    and other kana in the word are carried through literally, so 早い yields
    そうい rather than a bare そう.
    """
    slots = []
    for ch in word:
        if KANJI_RE.match(ch):
            e = kanji_src.get(ch)
            if not e:
                return []
            pool = [clean_reading(r) for r in e.get("readings_on", [])]
            pool += [okurigana_stem(r) for r in e.get("readings_kun", [])]
            pool = [r for r in dict.fromkeys(pool)
                    if r and KANA_RE.match(r) and r[0] not in "ぢづゐゑ"]
            if not pool:
                return []
            slots.append(pool)
        else:
            slots.append([ch])

    literal = [not KANJI_RE.match(ch) for ch in word]

    def join(parts):
        # 買 read ばい in 買い物 gives ばいい — the doubled kana is a tell and
        # no learner would ever pick it. Drop it rather than emit a dead choice.
        for i in range(len(parts) - 1):
            if literal[i + 1] and parts[i] and parts[i][-1] == parts[i + 1][0]:
                return None
        return "".join(parts)

    base = [s[0] for s in slots]
    alts = [join(base)]
    # swap exactly one character's reading at a time -> near-miss, not noise
    for i, pool in enumerate(slots):
        for alt in pool[1:4]:
            cand = list(base)
            cand[i] = alt
            alts.append(join(cand))
    return [a for a in dict.fromkeys(alts) if a and a != correct and wellformed(a)]


def perturb(correct):
    """Phonetic near-misses: rendaku, gemination, vowel length."""
    out = []
    for i, ch in enumerate(correct):
        for table in (VOICING, UNVOICING, HANDAKU, UNHANDAKU):
            if ch in table:
                out.append(correct[:i] + table[ch] + correct[i + 1:])
    # Only the final mora lengthens, and only for the o/e rows — that is the
    # real trap (こう vs こ, せい vs せ). Lengthening 犬 いぬ into いいぬ is not
    # a mistake anybody makes.
    last = correct[-1]
    if last in LONG_PARTNER and LONG_PARTNER[last] in ("う", "い") and last not in "あいうえお":
        if LONG_PARTNER[last] == "う" and last in "おこそとのほもよろごぞどぼぽ":
            out.append(correct + "う")
        elif LONG_PARTNER[last] == "い" and last in "えけせてねへめれげぜでべぺ":
            out.append(correct + "い")
    if "っ" in correct:
        out.append(correct.replace("っ", "", 1))
    else:
        for i in range(1, len(correct)):
            if correct[i] in SMALL_TSU_TRIGGERS:
                out.append(correct[:i] + "っ" + correct[i:])
                break
    for i, ch in enumerate(correct):
        if ch in "うい" and i > 0:
            out.append(correct[:i] + correct[i + 1:])
    return [o for o in out if o != correct and wellformed(o)]


def neighbour_pool(corpus, kanji_src):
    """Real readings from across the corpus, bucketed by kana length. Used only
    as a last resort — short single-kanji prompts can exhaust the good sources."""
    by_len = defaultdict(list)
    for c in sorted(corpus):
        e = kanji_src[c]
        for r in e.get("readings_kun", []) + e.get("readings_on", []):
            r = okurigana_stem(r)
            if r and wellformed(r):
                by_len[len(r)].append((r, c))
    return by_len


def reading_distractors(word, correct, kanji_src, pool_by_len, n=3):
    """Three wrong readings, best first: the word's own kanji misread, then a
    phonetic near-miss, then a real reading borrowed from another kanji."""
    seen = {correct}
    picked = []
    cands = compose_alternate(word, correct, kanji_src) + perturb(correct)
    if len(cands) < n:
        # deterministic per word, so a card never reshuffles between reviews
        rng = random.Random(sum(ord(c) * 131 ** i for i, c in enumerate(word)))
        borrowed = [r for r, c in pool_by_len.get(len(correct), []) if c not in word]
        rng.shuffle(borrowed)
        cands += borrowed
    for cand in cands:
        if cand in seen or not wellformed(cand):
            continue
        seen.add(cand)
        picked.append(cand)
        if len(picked) == n:
            break
    return picked


# --- build ------------------------------------------------------------------

def main():
    kanji_src = load_kanji()
    ids = load_ids()
    vocab_rows = load_vocab_rows()
    clusters = load_clusters()

    corpus = {c: v for c, v in kanji_src.items() if v.get("jlpt_new") in BANDS}
    order = sorted(
        corpus,
        key=lambda c: (-corpus[c]["jlpt_new"], corpus[c].get("freq") or 99999, c),
    )

    # --- clusters: keep only clusters that touch the corpus ------------------
    cluster_out, cluster_of = [], defaultdict(list)
    for raw in clusters:
        members = [c for c in dict.fromkeys(raw) if KANJI_RE.match(c)]
        if len(members) < 2 or not any(c in corpus for c in members):
            continue
        idx = len(cluster_out)
        cluster_out.append(members)
        for c in members:
            if c in corpus:
                cluster_of[c].append(idx)

    # --- vocab: keep words that teach a corpus kanji -------------------------
    vocab_out, vocab_of = [], defaultdict(list)
    seen_words = set()
    pool_by_len = neighbour_pool(corpus, kanji_src)
    for row in vocab_rows:
        word = row["w"]
        if word in seen_words:
            continue
        chars = [c for c in word if KANJI_RE.match(c)]
        targets = [c for c in chars if c in corpus]
        if not targets:
            continue
        # every kanji in the word must be in the corpus: a READ card must not
        # require reading a character the learner has never been taught
        if any(c not in corpus for c in chars):
            continue
        if not KANA_RE.match(row["r"]):
            continue
        # The learner is working towards N4. N3 vocabulary is a fallback for
        # the handful of characters (不 京 公 友 田 野) that no N5/N4 word on the
        # list happens to cover — never the default READ prompt. Rows arrive
        # N5, N4, N3, so by now vocab_of holds every level-appropriate word.
        if row["jlpt"] == 3 and word not in ALWAYS_KEEP and all(vocab_of.get(c) for c in targets):
            continue
        # 人々 / 色々: the iteration mark is a rendaku exercise, not a kanji
        # reading, and it is outside the subsetted fonts.
        if "々" in word:
            continue
        seen_words.add(word)
        d = reading_distractors(word, row["r"], kanji_src, pool_by_len)
        if len(d) < 3:
            continue
        idx = len(vocab_out)
        vocab_out.append({
            "w": word,
            "r": row["r"],
            "m": row["m"].split(";")[0].strip(),
            "jlpt": row["jlpt"],
            "k": targets,
            "d": d,
            "jukugo": len(chars) > 1,
        })
        for c in targets:
            vocab_of[c].append(idx)

    # --- kanji records -------------------------------------------------------
    kanji_out = []
    for rank, c in enumerate(order):
        e = corpus[c]
        comps = decompose(c, ids, kanji_src)
        # prefer jukugo, then lower JLPT (easier), then shorter
        vids = sorted(
            vocab_of.get(c, []),
            key=lambda i: (
                not vocab_out[i]["jukugo"],
                -vocab_out[i]["jlpt"],
                len(vocab_out[i]["w"]),
            ),
        )[:6]
        meanings = [m for m in dict.fromkeys(e.get("meanings", [])) if m]
        primary = [m for m in meanings if "radical" not in m.lower()] or meanings
        on = dict.fromkeys(clean_reading(r) for r in e.get("readings_on", []))
        kun = dict.fromkeys(
            clean_reading(r) for r in e.get("readings_kun", []) if not r.startswith("-")
        )
        kanji_out.append({
            "c": c,
            "m": [re.sub(r"\s*\(no\.\s*\d+\)", "", m) for m in primary][:4],
            "on": [r for r in on if r][:3],
            "kun": [r for r in kun if r][:3],
            "jlpt": e["jlpt_new"],
            "grade": e.get("grade"),
            "strokes": e.get("strokes"),
            "freq": e.get("freq"),
            "order": rank,
            "comp": comps,
            "cl": cluster_of.get(c, []),
            "v": vids,
        })

    os.makedirs(OUT, exist_ok=True)
    for name, payload in (
        ("kanji.json", kanji_out),
        ("vocab.json", vocab_out),
        ("clusters.json", cluster_out),
    ):
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    yield_check(kanji_out, vocab_out, cluster_out)


# --- Milestone 0 yield check (spec §4) --------------------------------------

def yield_check(kanji_out, vocab_out, cluster_out):
    total = len(kanji_out)
    with_cluster = sum(1 for k in kanji_out if k["cl"])
    with_read = sum(1 for k in kanji_out if k["v"])
    with_jukugo = sum(1 for k in kanji_out if any(vocab_out[i]["jukugo"] for i in k["v"]))
    with_comp = sum(1 for k in kanji_out if k["comp"])
    sizes = {}
    for name in ("kanji.json", "vocab.json", "clusters.json"):
        sizes[name] = os.path.getsize(os.path.join(OUT, name))

    def pct(n):
        return f"{n:4d} / {total}  ({100 * n / total:5.1f}%)"

    print("=" * 66)
    print("  MILESTONE 0 — YIELD CHECK")
    print("=" * 66)
    print(f"  kanji in corpus (N5+N4)        {total}")
    print(f"    N5                           {sum(1 for k in kanji_out if k['jlpt'] == 5)}")
    print(f"    N4                           {sum(1 for k in kanji_out if k['jlpt'] == 4)}")
    print(f"  vocabulary words kept          {len(vocab_out)}  "
          f"({sum(1 for v in vocab_out if v['jukugo'])} jukugo)")
    print(f"  confusion clusters kept        {len(cluster_out)}")
    print()
    print(f"  RECOGNISE constructible        {pct(total)}")
    print(f"  DISCRIMINATE w/ real cluster   {pct(with_cluster)}")
    print(f"    (rest fall back to stroke-count ±1 distractors)")
    print(f"  READ constructible             {pct(with_read)}")
    print(f"    of which with a jukugo       {pct(with_jukugo)}")
    print(f"  ENCOUNTER w/ decomposition     {pct(with_comp)}")
    print()
    print("  output size (raw / gzip):")
    tot_raw = 0
    import gzip
    for name, n in sizes.items():
        raw = os.path.join(OUT, name)
        gz = len(gzip.compress(open(raw, "rb").read(), 9))
        tot_raw += n
        print(f"    {name:16s} {n / 1024:7.1f} KB  /{gz / 1024:7.1f} KB")
    allgz = sum(len(gzip.compress(open(os.path.join(OUT, n), "rb").read(), 9)) for n in sizes)
    print(f"    {'TOTAL':16s} {tot_raw / 1024:7.1f} KB  /{allgz / 1024:7.1f} KB"
          f"   {'OK (<800KB)' if allgz < 800 * 1024 else 'OVER BUDGET'}")
    print()
    print("=" * 66)
    print("  30 RANDOM ITEMS — READ THESE YOURSELF (spec §4)")
    print("=" * 66)
    rng = random.Random(20260801)
    for k in rng.sample(kanji_out, 30):
        v = vocab_out[k["v"][0]] if k["v"] else None
        comp = " + ".join(f"{c['c']}({c['n']})" for c in k["comp"]) or "—"
        cl = "  ".join("".join(cluster_out[i]) for i in k["cl"]) or "—"
        print(f"\n  {k['c']}  N{k['jlpt']}  {k['strokes']}str  #{k['freq']}")
        print(f"     RECOGNISE   {' / '.join(k['m'])}")
        print(f"     DISCRIM     {cl}")
        if v:
            print(f"     READ        {v['w']}  →  {v['r']}   ({v['m']})")
            print(f"                 distractors: {'  '.join(v['d'])}")
        else:
            print(f"     READ        — no vocabulary")
        print(f"     ENCOUNTER   {comp}")
        print(f"                 on {'・'.join(k['on']) or '—'}   kun {'・'.join(k['kun']) or '—'}")
    print()


if __name__ == "__main__":
    sys.exit(main())
