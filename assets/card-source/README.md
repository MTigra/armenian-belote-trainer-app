# Card artwork

SVG-cards by David Bellot and contributors, maintained by Henk de Beer.
Source: https://github.com/htdebeer/SVG-cards
Pinned commit: `6d88bf9c594997b82bc5668ab0877a4e9b717665`.
The unmodified source is `svg-cards.svg`; LGPL 2.1 license is distributed in
`web/public/cards/LICENSE`. Author credits are in `web/public/cards/AUTHORS`.

`scripts/extract-card-images.py` extracts the 32 Blot cards and four suits,
retains referenced artwork, and converts the indices to vector paths using
DejaVu Serif Bold. DejaVu font license is in `web/public/cards/FONT-LICENSE`.
Generated SVGs are committed and require no tooling at build/runtime.
Regenerate with Python 3 + fonttools + DejaVu Serif Bold:
`python3 scripts/extract-card-images.py`.

## Clean deck used by the redesigned client (P22)

`python3 scripts/create-minimal-preview-cards.py --game` writes the current
32 faces and four suits to `web/public/cards`; without `--game`, it writes
the isolated prototype. Indices are outlined DejaVu Serif, pips are original
geometric artwork, and J/Q/K retain the two classic court portraits from
the pinned SVG-cards source, repositioned without the interior frame.
The original LGPL license, authors and font license remain distributed.
The earlier extraction script is kept for the original deck, not the current style.
