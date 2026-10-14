"""Author the clean vector deck. Default: prototype; --game: client assets.

Requires fonttools + DejaVu Serif. Glyphs are outlined at authoring time, so
cards contain no SVG text, emoji, runtime fonts or external image references.
Suit shapes are original; classic court illustrations come from the pinned SVG-cards source.
"""
from pathlib import Path
import argparse
from copy import deepcopy
import re
import xml.etree.ElementTree as ET
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--game", action="store_true", help="Write the same deck to web/public/cards instead of the prototype")
args = parser.parse_args()
OUTPUT = ROOT / ("web/public/cards" if args.game else "docs/design-v3/cards")
OUTPUT.mkdir(parents=True, exist_ok=True)
font = TTFont("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf")
glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
SUITS = {
    "CLUBS": '<circle cx="16" cy="8" r="7"/><circle cx="8" cy="18" r="7"/><circle cx="24" cy="18" r="7"/><path d="M14 17h4c0 6 1 10 5 14H9c4-4 5-8 5-14Z"/>',
    "DIAMONDS": '<path d="M16 0 30 16 16 32 2 16Z"/>',
    "HEARTS": '<path d="M16 30C12 25 1 17 1 9 1-2 13-2 16 6 19-2 31-2 31 9c0 8-11 16-15 21Z"/>',
    "SPADES": '<path d="M16 0C11 7 1 13 1 21c0 9 11 11 15 3 4 8 15 6 15-3 0-8-10-14-15-21Z"/><path d="M14 21h4c0 4 2 8 5 11H9c3-3 5-7 5-11Z"/>',
}
RANKS = {"SEVEN": "7", "EIGHT": "8", "NINE": "9", "TEN": "10",
         "JACK": "J", "QUEEN": "Q", "KING": "K", "ACE": "A"}

def rank_paths(label):
    paths, offset = [], 0
    low, high = 0, 0
    for char in label:
        glyph = glyphs[cmap[ord(char)]]
        path, bounds = SVGPathPen(glyphs), BoundsPen(glyphs)
        glyph.draw(path)
        glyph.draw(bounds)
        low = min(low, bounds.bounds[1])
        high = max(high, bounds.bounds[3])
        paths.append(f'<path d="{path.getCommands()}" transform="translate({offset} 0)"/>')
        offset += glyph.width
    sy = 46 / (high - low)
    sx = min(sy, 42 / offset)
    return f'<g transform="translate(12 {10 + high * sy:.3f}) scale({sx:.6f} {-sy:.6f})">{"".join(paths)}</g>'

def pip(x, y, size=32, inverted=False):
    turn = 'rotate(180)' if inverted else ''
    return f'<use href="#suit" transform="translate({x} {y}) {turn} scale({size / 32}) translate(-16 -16)"/>'

SVG = "http://www.w3.org/2000/svg"
XLINK = "http://www.w3.org/1999/xlink"
ET.register_namespace("", SVG)
ET.register_namespace("xlink", XLINK)
source = ET.parse(ROOT / "assets/card-source/svg-cards.svg")
by_id = {e.get("id"): e for e in source.iter() if e.get("id")}

def court(rank, suit):
    upstream = {"CLUBS": "club", "DIAMONDS": "diamond", "HEARTS": "heart", "SPADES": "spade"}[suit]
    original = by_id[f"{upstream}_{rank.lower()}"]
    body = ET.Element(f"{{{SVG}}}g", {"transform": original.get("transform", "")})
    for child in original:
        href = child.get(f"{{{XLINK}}}href", "")
        if href.startswith(f"#{rank.lower()}_"):
            body.append(deepcopy(child))
    assert len(body) == 2, (rank, suit)
    found, pending = set(), [body]
    while pending:
        element = pending.pop()
        for e in element.iter():
            refs = re.findall(r"url\(#([^)]+)\)", " ".join(e.attrib.values()))
            href = e.get(f"{{{XLINK}}}href", "")
            if href.startswith("#"): refs.append(href[1:])
            for ref in refs:
                if ref not in found:
                    found.add(ref)
                    pending.append(by_id[ref])
    defs = ET.Element(f"{{{SVG}}}defs")
    for ref in sorted(found): defs.append(deepcopy(by_id[ref]))
    assert not defs.findall(f".//{{{SVG}}}text")
    return ET.tostring(defs, encoding="unicode") + '<g transform="translate(18 14) scale(.9)">' + ET.tostring(body, encoding="unicode") + '</g>'

for suit, shape in SUITS.items():
    ink = "#cf292e" if suit in ["HEARTS", "DIAMONDS"] else "#121719"
    defs = f'<defs><g id="suit">{shape}</g></defs>'
    for rank, label in RANKS.items():
        index = rank_paths(label) + pip(33, 77, 33)
        if rank == "ACE":
            body = pip(96, 122, 66)
        elif rank in ["JACK", "QUEEN", "KING"]:
            body = court(rank, suit)
        else:
            count = int(label)
            rows = [70, 105, 139, 174] if count >= 8 else [70, 122, 174]
            # Keep pips away from corner indices, including the inverted one.
            body = ''.join(pip(x, y, 28, y > 122) for y in rows for x in [65, 111])
            extra = {7: [96], 8: [], 9: [122], 10: [88, 156]}[count]
            body += ''.join(pip(88, y, 26, y > 122) for y in extra)
        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 168 244">
<title>{label} of {suit.lower()}</title>{defs}
<rect width="168" height="244" rx="10" fill="#fff"/>
<g fill="{ink}">{index}<g transform="translate(168 244) rotate(180) scale(.78)">{index}</g>{body}</g>
</svg>'''
        (OUTPUT / f"{suit}-{rank}.svg").write_text(svg)
    (OUTPUT / f"{suit}.svg").write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 34 34"><g fill="{ink}">{shape}</g></svg>')
(OUTPUT / "FONT-LICENSE").write_bytes((ROOT / "web/public/cards/FONT-LICENSE").read_bytes())
print(f"Authored 32 clean card faces with classic courts and 4 suit icons in {OUTPUT.relative_to(ROOT)}.")
