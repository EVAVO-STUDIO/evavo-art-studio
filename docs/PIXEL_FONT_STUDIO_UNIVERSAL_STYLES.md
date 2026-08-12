# EVAVO Pixel Font Studio universal style compiler

Pixel Font Studio v2.2 remains the retained source-of-truth pipeline for independently authored face masters, metrics, Unicode coverage, kerning, TTF derivatives and exact Godot 4.6.2 verification. The universal compiler is an additive, style-neutral layer for future games whose fonts do not fit one period, one grid, one colour model or one spacing model.

## What “any style” means

No honest font system can predict every visual language as a finite preset list. This compiler instead keeps the *visual category open* and makes the technical representation general:

- `kind`, `styleTags` and `designIntent` are authored metadata rather than a closed enum;
- the pixels can be binary, indexed colour, direct RGBA or ordered layers;
- glyphs can be composed from other glyphs with offsets, anchors and palette remapping;
- zero-advance combining marks and anchor-attached accented/component glyphs are retained correctly;
- glyph rectangles, bearings, offsets, advances, ascenders, descenders and overhangs are arbitrary within governed bounds;
- spacing can be proportional, preserved, monospaced, duospaced or fixed-cell;
- one profile can emit one or many exact integer strikes;
- a reviewed Python operation can extend the library without changing the source schema;
- the CLI and MCP deliberately cannot execute arbitrary code.

A DOS menu face, arcade title, medieval blackletter, handwritten bitmap face, LCD display, runic display, icon alphabet, CJK duospace source, multicolour ornamental font or a new style can all use the same compiler. The actual quality still comes from the authored glyph master and visual review, not from the tool granting itself creative approval.

## Source models

The compiler accepts existing `evavo.pixel-font-face-master.v2` binary masters and the broader `evavo.pixel-font-universal-face.v1` schema.

### Binary

Use rectangular `.` / `#` rows. This is ideal for one-bit DOS, terminal, handheld and compact UI faces.

### Indexed colour

Declare up to 256 single-character palette symbols, then author rows such as `A.BCA`. The exact RGBA palette survives in PNG runtime output.

### Direct RGBA

Each pixel is `#RRGGBBAA`, `null` or `"."`. This supports literal transparency, multicolour pixels, icon alphabets and colour-emoji-like game faces.

### Layers and components

A glyph can supply ordered binary layers with separate colours. It can also compose another Unicode glyph by codepoint, translate it, attach source and target anchors and remap component colours. Component cycles and missing anchors are rejected.

## Deterministic style graph

Built-in operations are:

- recolour and exact palette remapping;
- horizontal or vertical gradients;
- four- or eight-neighbour outlines;
- hard drop shadows and directional highlights;
- inline edge treatments;
- dilation/embolden and erosion/thin;
- integer shear/italic;
- horizontal or vertical mirror;
- quarter-turn rotation;
- checker, scanline, column, Bayer 2×2 and Bayer 4×4 masks;
- translation;
- exact nearest-neighbour scaling.

Operations use integer-only alpha composition. A library caller may provide a reviewed operation registry whose output is revalidated as a bounded integer-coordinate RGBA map. The CLI and MCP expose only registered built-ins.

## Atlas and output formats

Packers:

- deterministic MaxRects without rotation;
- deterministic shelf packing;
- deterministic fixed-grid pages.

All support bounded multi-page RGBA output, optional power-of-two pages, padding and exact integer strikes.

The canonical game runtime is:

```text
<face>-<profile>-<strike>x.fnt
<face>-<profile>-<strike>x-page-0.png
<face>-<profile>-<strike>x-page-1.png
...
```

Additional outputs include atlas JSON, transparent review grids, BDF, optional TTF, Godot `FontVariation` resources, normalised source, retained style profile and SHA-256 manifest.

TTF and BDF are alpha-mask projections. They cannot preserve arbitrary multicolour bitmap pixels. TTF is therefore a convenience derivative; BMFont plus PNG remains authoritative for exact colour and pixel presentation.

## Transaction and integrity policy

- Builds are assembled in a temporary sibling directory and atomically renamed only after all outputs and the manifest are complete.
- Existing output directories are never replaced.
- Every retained file has a byte length and SHA-256 identity.
- Independent validation reopens every PNG, checks chunk CRCs, parses BMFont pages and metrics, checks atlas bounds, checks BDF coverage and reopens TTF cmap/embedding policy.
- Two clean builds can be compared byte-for-byte.
- Failed builds do not publish a partial output root.

## CLI

```powershell
python tools\pixel_font_universal.py catalog

python tools\pixel_font_universal.py validate-face `
  --face examples\pixel-font-universal\indexed-arcade.face.json

python tools\pixel_font_universal.py validate-profile `
  --profile examples\pixel-font-universal\fantasy-herald.profile.json

python tools\pixel_font_universal.py compile `
  --face examples\pixel-font-universal\indexed-arcade.face.json `
  --profile examples\pixel-font-universal\colour-rune.profile.json `
  --output C:\EVAVO\pixel-font-builds\colour-rune

python tools\pixel_font_universal.py validate-output `
  --output C:\EVAVO\pixel-font-builds\colour-rune

python tools\pixel_font_universal.py compare `
  --first C:\EVAVO\pixel-font-builds\first `
  --second C:\EVAVO\pixel-font-builds\second
```

Install optional TTF support with:

```powershell
python -m pip install -r requirements\pixel-font-universal.txt
```

## ChatGPT and Claude MCP

Read-only tools provide cataloguing, validation, profile examples and build comparison. Compilation appears only when both write gates are enabled:

```text
EVAVO_PIXEL_FONT_UNIVERSAL_MODE=read-write
EVAVO_PIXEL_FONT_UNIVERSAL_ALLOW_WRITES=true
EVAVO_PIXEL_FONT_UNIVERSAL_ALLOWED_ROOTS=C:\allowed\source;C:\allowed\builds
```

Each compilation call must also contain `confirmWrite=true`. Paths are canonicalised, symlinks are rejected and output roots must not exist. The server owns the Python executable and CLI path. It has no arbitrary shell, custom-operation, Git, repository-mutation, publication or creative-approval authority.

## Existing v2 compatibility

The universal compiler consumes existing v2 face masters without rewriting them. It preserves existing mixed-case face identifiers, empty soft-hyphen records, per-glyph offsets, advances and kerning. Chess Lord and other retained v2 families remain reproducible from their current masters and hashes. New projects can adopt universal face sources only where binary v2 is not expressive enough.

## Runtime boundaries

“Universal” describes the source, styling and bitmap-output architecture, not a claim that one bitmap runtime performs every language-shaping algorithm. The compiler can author any Unicode scalar, private-use icon, presentation form, combining mark and wide/fixed cell. Contextual shaping, bidirectional layout, vertical composition and automatic ligature substitution remain responsibilities of the target text engine or of explicitly precomposed authored glyphs. This boundary avoids pretending that AngelCode BMFont itself is an OpenType shaping engine.
