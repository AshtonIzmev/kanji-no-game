#!/usr/bin/env python3
"""Generate the app icon: a genkō yōshi cell with 字 inked into it.

The icon is the same single idea as the rest of the app (spec §7) — one
manuscript square, its centring cross, nothing else. The SVG embeds the glyph
as an outline so it does not depend on the viewer having a Mincho face.
"""

import os

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERIF = os.path.join(ROOT, "scripts", "sources", "fonts", "NotoSerifJP.ttf")
OUT = os.path.join(ROOT, "public")

PAPER = (237, 239, 232)
INK = (26, 29, 26)
RULE = (184, 194, 180)
RULE_SOFT = (210, 217, 207)
GLYPH = "字"


def svg_icon() -> str:
    font = TTFont(SERIF)
    glyphs = font.getGlyphSet()
    pen = SVGPathPen(glyphs)
    glyphs[font.getBestCmap()[ord(GLYPH)]].draw(pen)
    upem = font["head"].unitsPerEm
    # font units are y-up from the baseline; flip and centre in a 512 box
    scale = 300 / upem
    tx = 256 - (300 / 2)
    ty = 256 + (300 * 0.36)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="rgb{PAPER}"/>
  <path d="M256 56V456M56 256H456" stroke="rgb{RULE_SOFT}" stroke-width="6"/>
  <rect x="56" y="56" width="400" height="400" fill="none" stroke="rgb{RULE}" stroke-width="8"/>
  <g transform="translate({tx:.2f} {ty:.2f}) scale({scale:.5f} {-scale:.5f})">
    <path fill="rgb{INK}" d="{pen.getCommands()}"/>
  </g>
</svg>
"""


def png_icon(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), PAPER)
    d = ImageDraw.Draw(img)
    m = round(size * 0.109)
    d.line([(size / 2, m), (size / 2, size - m)], fill=RULE_SOFT, width=max(1, size // 85))
    d.line([(m, size / 2), (size - m, size / 2)], fill=RULE_SOFT, width=max(1, size // 85))
    d.rectangle([m, m, size - m, size - m], outline=RULE, width=max(1, size // 64))
    font = ImageFont.truetype(SERIF, int(size * 0.58))
    d.text((size / 2, size / 2), GLYPH, font=font, fill=INK, anchor="mm")
    return img


if __name__ == "__main__":
    with open(os.path.join(OUT, "icon.svg"), "w", encoding="utf-8") as f:
        f.write(svg_icon())
    for size in (192, 512):
        png_icon(size).save(os.path.join(OUT, f"icon-{size}.png"), optimize=True)
    print("  icon.svg, icon-192.png, icon-512.png")
