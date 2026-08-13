# Pixel Typography Native-Resolution Review

Pixel Typography Review is the QA layer above Universal Pixel Font Studio and Pixel Text Studio. It turns one canonical AngelCode BMFont/PNG runtime plus one reviewed Pixel Text style into a deterministic review kit at the exact display resolution the game or website is meant to use.

The tool does not redraw a font, approve art, install files into another repository, or publish Git.

```text
font master -> Universal Pixel Font Studio -> BMFont + PNG
                                                |
                                                +-> Pixel Text Studio -> styled text frames
                                                                           |
                                                                           +-> Native Review -> fixed-resolution pages, scale previews and evidence
```

## What it catches

- a 320×200 title that only looks acceptable after fractional scaling;
- counters or punctuation that collapse at native size;
- palette growth after bevel, shine, alpha or outline effects;
- animation frames that read individually but fail as a sequence;
- menu/HUD text never tested beside the display title;
- exported review images with hidden dimensions or interpolation.

## Review profile

Profiles use `evavo.pixel-typography-review-profile.v1` and declare:

- era intent such as `vga-dos-era` or `nineteen-nineties-arcade-era`;
- exact native width and height;
- page background, padding and gap;
- optional visible RGBA palette budget;
- exact integer preview scales;
- fixed-resolution review pages;
- semantic specimen roles and literal or built-in text;
- static or animation-grid rendering.

The supplied `vga-dos-320x200` profile includes title, motion, uppercase, lowercase, digits, punctuation, menu, HUD and status pages. Profiles are editable production data, not a closed style list.

## Outputs

```text
pages/<page-id>.png
previews/<page-id>-2x.png
samples/<page-id>/<sample-id>.png
animation/<sample-id>/frame-000.png
palette/palette.png
review-map.json
source/review-profile.json
source/pixel-text-style.json
pixel-typography-review.json
```

Every page is exactly the declared native resolution. Preview images are exact nearest-neighbour integer replicas. Animation grids retain their source frames. Palette evidence is computed from final page pixels.

The manifest binds font descriptor/page hashes, style/profile hashes, sample text, page rectangles, animation frames, palette colours and every output file.

## CLI

```powershell
python tools\pixel_typography_review.py catalog

python tools\pixel_typography_review.py validate-profile `
  --profile examples\pixel-typography-review\vga-dos-320x200.review.json

python tools\pixel_typography_review.py build `
  --font C:\EVAVO\pixel-font-builds\chess-lord\runtime\ChessLord_Herald.fnt `
  --style examples\pixel-text-studio\dos-brass-title.style.json `
  --profile examples\pixel-typography-review\vga-dos-320x200.review.json `
  --output C:\EVAVO\pixel-typography-reviews\chess-lord-herald

python tools\pixel_typography_review.py validate-output `
  --output C:\EVAVO\pixel-typography-reviews\chess-lord-herald
```

The unified route is:

```powershell
node scripts\pixel-typography.mjs review catalog
node scripts\pixel-typography.mjs review build --font ... --style ... --profile ... --output ...
```

## ChatGPT and Claude

`evavo-pixel-typography-review` exposes catalogue, profile example, profile validation, create-only build, output validation and deterministic comparison tools.

Writes require read-write mode, an allowed output root and `confirmWrite=true`. The server does not expose arbitrary shell, creative approval, target-repository mutation, Git commit, push or publication.

## Review rules

- Pages and samples must fit the declared native display.
- Palette budgets apply to final visible page pixels.
- Scale previews must be exact integer nearest-neighbour reconstructions.
- Output roots are create-only and staged transactionally.
- Independent validation reopens all PNGs, reconstructs pages and animation grids, and recomputes palettes and previews.
- A passed technical review is evidence, not automatic creative approval.
- Repository delivery remains a separate ownership-safe transaction.

## Display-aspect correction

A native pixel grid and the physical display shape are not always the same. The optional `displayPreview` contract keeps the authoritative native page unchanged, then emits a second deterministic nearest-neighbour resample at the reviewed display dimensions.

For the supplied VGA/DOS profile this means:

```json
"nativeResolution": {"width": 320, "height": 200},
"displayPreview": {
  "width": 320,
  "height": 240,
  "integerScales": [2, 3]
}
```

The review kit retains `display/<page-id>.png` and exact integer enlargements under `display-previews/`. Each page record includes reduced native, display and pixel width-to-height ratios. The independent validator reconstructs the display image from the native page and rejects changed resampling, ratio metadata, dimensions, hashes or scale previews.

This display proof is separate from optional CRT styling. Scanlines, bloom, phosphor masks and curvature can be useful presentation treatments, but they do not replace the unfiltered native page or the deterministic aspect-corrected geometry evidence.
