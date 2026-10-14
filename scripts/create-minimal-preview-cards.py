"""Author the isolated prototype's clean vector deck. Never changes game assets.

Requires fonttools + DejaVu Serif. Glyphs are outlined at authoring time, so
cards contain no SVG text, emoji, runtime fonts or external image references.
Suit shapes and flat court illustrations are original geometric artwork.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/design-v3/cards"
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

def court(rank, ink):
    # Quiet, two-ended portraits. No patterned costumes or ornamental frame.
    crown = {
        "KING": '<path d="m-24-23-3-19 15 10L0-48l12 16 15-10-3 19Z" fill="#cfad65"/>',
        "QUEEN": '<path d="m-22-23-3-13 12 7L0-42l13 13 12-7-3 13Z" fill="#cfad65"/>',
        "JACK": '<path d="M-24-23c0-12 13-22 26-22 12 0 20 9 22 22Z" fill="'+ink+'"/><path d="M9-42 18-60 22-39" fill="#cfad65"/>',
    }[rank]
    beard = '<path d="M-14 8 0 30 14 8 8 16H-8Z" fill="'+ink+'"/>' if rank == "KING" else ''
    portrait = f'''<path d="M-34 50v-10c0-17 12-29 34-29s34 12 34 29v10Z" fill="{ink}"/>
      <path d="m-19 19 19 29 19-29-9-6H-10Z" fill="#cfad65"/>
      <path d="M-18-26h36v26c0 13-8 23-18 23S-18 13-18 0Z" fill="#f0d8b4"/>
      <path d="M-18-23v23l-6-6v-15c0-12 7-19 24-19s24 7 24 19V-6l-6 6v-23Z" fill="{ink}"/>
      {crown}<path d="M-8-7h3M5-7h3M-4 8h8" stroke="{ink}" stroke-width="2.5" stroke-linecap="round"/>{beard}'''
    return f'<g transform="translate(99 95)">{portrait}</g><g transform="translate(99 149) rotate(180)">{portrait}</g>'

for suit, shape in SUITS.items():
    ink = "#cf292e" if suit in ["HEARTS", "DIAMONDS"] else "#121719"
    defs = f'<defs><g id="suit">{shape}</g></defs>'
    for rank, label in RANKS.items():
        index = rank_paths(label) + pip(33, 77, 33)
        if rank == "ACE":
            body = pip(96, 122, 66)
        elif rank in ["JACK", "QUEEN", "KING"]:
            body = court(rank, ink)
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
print("Authored 32 minimal card faces and 4 suit icons in the design prototype only.")
