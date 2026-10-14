"""Generate local SVG faces with outlined indices; not required during app builds.

Requires fonttools and the DejaVu Serif Bold font. Source and licenses are pinned
in assets/card-source/README.md. Never downloads or executes upstream code.
"""
from pathlib import Path
from copy import deepcopy
import re
import xml.etree.ElementTree as ET
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parents[1]
SVG = "http://www.w3.org/2000/svg"
XLINK = "http://www.w3.org/1999/xlink"
ET.register_namespace("", SVG)
ET.register_namespace("xlink", XLINK)
tree = ET.parse(ROOT / "assets/card-source/svg-cards.svg")
font = TTFont("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf")
glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
# Turn font-dependent indices into paths once, keeping their original transforms.
for parent in tree.iter():
    for i, element in enumerate(list(parent)):
        if element.tag != f"{{{SVG}}}text":
            continue
        text = "".join(element.itertext())
        group = ET.Element(f"{{{SVG}}}g", {k: v for k, v in element.attrib.items()
                            if k in ["id", "transform", "fill"]})
        size = float(element.get("font-size", "43"))
        scale = size / font["head"].unitsPerEm
        offset = 0
        for char in text:
            if ord(char) not in cmap:
                continue
            glyph = glyphs[cmap[ord(char)]]
            pen = SVGPathPen(glyphs)
            glyph.draw(pen)
            ET.SubElement(group, f"{{{SVG}}}path", {
                "d": pen.getCommands(),
                "transform": f"translate({offset},0) scale({scale}, {-scale})",
            })
            offset += glyph.width * scale
        assert len(group), f"No outlined glyphs for {text!r}"
        parent[i] = group
by_id = {e.get("id"): e for e in tree.iter() if e.get("id")}
output = ROOT / "web/public/cards"
output.mkdir(exist_ok=True, parents=True)

def dependencies(element):
    found = set()
    pending = [element]
    while pending:
        current = pending.pop()
        for e in current.iter():
            refs = re.findall(r"url\(#([^)]+)\)", " ".join(e.attrib.values()))
            href = e.get(f"{{{XLINK}}}href", e.get("href", ""))
            if href.startswith("#"):
                refs.append(href[1:])
            for ref in refs:
                if ref not in found:
                    found.add(ref)
                    pending.append(by_id[ref])
    return sorted(found)

def write(name, element, viewbox):
    root = ET.Element(f"{{{SVG}}}svg", {"viewBox": viewbox, "version": "1.1"})
    defs = ET.SubElement(root, f"{{{SVG}}}defs")
    for ref in dependencies(element):
        defs.append(deepcopy(by_id[ref]))
    root.append(deepcopy(element))
    assert not root.findall(f".//{{{SVG}}}text")
    ET.ElementTree(root).write(output / f"{name}.svg", encoding="utf-8", xml_declaration=True)

for suit, upstream in [("CLUBS", "club"), ("DIAMONDS", "diamond"), ("HEARTS", "heart"), ("SPADES", "spade")]:
    for rank, upstream_rank in [("SEVEN", "7"), ("EIGHT", "8"), ("NINE", "9"), ("TEN", "10"),
                                ("JACK", "jack"), ("QUEEN", "queen"), ("KING", "king"), ("ACE", "1")]:
        write(f"{suit}-{rank}", by_id[f"{upstream}_{upstream_rank}"], "0 0 169.075 244.640")
    write(suit, by_id[f"suit-{upstream}"], "-1 -1 18 18")
print("Generated 32 faces and 4 suit images (no SVG text or external references).")
