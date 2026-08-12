# Pixel Text Studio

Pixel Text Studio is the raster-title layer above EVAVO Pixel Font Studio. It turns an already validated AngelCode BMFont plus RGBA atlas into game headings, logos, menu labels, status text and animated title treatments without changing the source font master.

The separation is deliberate:

```text
font master -> Pixel Font Studio -> exact BMFont + PNG
                               \
                                -> Pixel Text Studio -> title/text PNG frames, sheet, web bundle, Godot SpriteFrames
```

A font remains reusable typography. A title treatment remains a composed art asset. This avoids baking one game's bevel, fire, chrome or shadow into every glyph of the underlying face.

## 1990s-first rendering contract

Pixel Text Studio is designed for authored low-resolution graphics rather than modern smooth text effects:

- source glyph pixels remain authoritative;
- all placement and effects use integer coordinates;
- no vector resampling, Gaussian blur or antialiasing is introduced;
- outlines, bevels, shadows, extrusion, palette bands and masks are pixel operations;
- animation uses deterministic frame logic;
- native-resolution review is expected before creative approval;
- scaling for final display should remain an integer multiple whenever the target layout permits it.

This supports restrained DOS UI labels as well as larger arcade/fantasy title art without pretending those are the same typographic job.

## Built-in starter treatments

The built-ins are original EVAVO starter graphs, not copies of commercial game logos:

```text
arcade-chrome-title
blue-command-badge
brass-plaque-label
cga-menu
dos-brass-title
fantasy-fire-title
gothic-violet-title
hologram-cyan-title
ice-rune-title
stone-carved-title
strategy-ui-emboss
toxic-tech-title
warning-red-title
website-pixel-neon
```

They are editable JSON examples under `examples/pixel-text-studio/`. A game should normally tune palette, spacing, effect depth, animation cadence and font master rather than ship an untouched preset.

## Static operations

Pixel Text Studio accepts every bounded Universal v3 pixel operation plus title-specific operations.

Universal operations include recolour, palette mapping, gradient, outline, shadow, highlight, inline, dilation, erosion, shear, mirror, quarter-turn rotation, masks, translation and nearest-neighbour scaling.

Title operations add:

- `bands` for authored palette ramps;
- `extrude` for stepped pixel depth;
- `bevel` for one-pixel highlight/shadow edges;
- `taper` for integer row-width shaping;
- `plate` for pixel UI plaques, command badges and framed labels with bounded borders and cut corners.

Operations are deterministic and ordered. For example, a title commonly establishes its interior palette first, then bevels, outlines and finally adds depth. Small fonts should use fewer effects than display faces so letter counters and stems remain readable.

## Motion operations

Animated titles can use:

```text
wave
jitter
shine
sparkle
palette-cycle
blink
type-on
```

Every animation has a fixed frame count, FPS and loop flag. Jitter and sparkle use explicit deterministic seeds. All frames are rendered to one shared bounding box so animated assets do not jump because their image dimensions changed.

## Output package

A build can retain:

```text
frames/frame-000.png
frames/frame-001.png
...
title.png                 # one-frame builds
sheet.png                 # horizontal frame sheet
web/pixel-text.css
web/pixel-text.js
godot/pixel-text-spriteframes.tres
source/style.json
source/text.txt
pixel-text-build.json
```

The manifest records source font hashes, style hash, text hash, dimensions, frame timing and SHA-256 identities for every retained file. Output roots are create-only and are staged transactionally before publication.

`individualFrames` is required in the v1 contract. This keeps the manifest, web bundle and Godot resource self-contained and prevents a configuration from referencing frames that were deliberately omitted.

## CLI

Inspect capabilities:

```powershell
python tools\pixel_text_studio.py catalog
```

Create a starter style without rendering:

```powershell
python tools\pixel_text_studio.py style-example `
  --preset dos-brass-title
```

Validate a style:

```powershell
python tools\pixel_text_studio.py validate-style `
  --style examples\pixel-text-studio\dos-brass-title.style.json
```

Render:

```powershell
python tools\pixel_text_studio.py render `
  --font C:\EVAVO\pixel-font-builds\chess-lord\runtime\ChessLord_Herald.fnt `
  --text "BATTLE CHESS" `
  --style examples\pixel-text-studio\fantasy-fire-title.style.json `
  --output C:\EVAVO\pixel-text-builds\battle-chess-title
```

Validate and compare:

```powershell
python tools\pixel_text_studio.py validate-output --output C:\EVAVO\pixel-text-builds\battle-chess-title
python tools\pixel_text_studio.py compare --first C:\EVAVO\pixel-text-builds\first --second C:\EVAVO\pixel-text-builds\second
```

## ChatGPT and Claude

`scripts/pixel-text-studio-mcp.mjs` exposes a guarded path-only MCP surface:

```text
evavo_pixel_text_catalog
evavo_pixel_text_validate_style
evavo_pixel_text_style_example
evavo_pixel_text_render
evavo_pixel_text_validate_output
evavo_pixel_text_compare_builds
```

It defaults to read-only. Rendering requires both server-side write permission and `confirmWrite=true`. Paths are restricted to configured roots and symbolic paths are rejected. The MCP does not expose arbitrary shell commands, Git publication or creative approval.

Use `config/mcp.pixel-font-automation.windows.example.json` to deploy Pixel Font Studio, Pixel Text Studio and cross-repository delivery together.

## Godot 4.6.2

When the repository-delivery job uses the `godot-4.6.2` adapter, the planner rewrites the title style's `godotResourceRoot` to the exact destination path, installs all individual PNG frames and installs the matching `SpriteFrames` `.tres`. It also produces a role map and a small generated title catalogue for loading title roles by semantic name.

Font runtime setup remains separate and keeps nearest filtering, no system fallback, disabled subpixel positioning and no mipmaps.

## Web

The generated web bundle contains CSS using pixel-preserving `image-rendering` hints and a small frame player that advances the exact PNG frames at the authored FPS. It does not redraw text through a browser font renderer.

For a responsive site, choose layout breakpoints that preserve useful integer display scales where possible. The pixel-text image should be treated as authored raster artwork, not as a substitute for accessible document text. Keep real headings/labels in the DOM where semantics or accessibility require them.

## Cross-repository delivery

`pixel-font-repository-delivery` now treats fonts and rendered titles as one ownership-safe installation transaction. A job may:

1. compile or reuse a Universal v3 / Pixel Font Studio v2 font build;
2. render one or more title builds from selected font strikes;
3. install correctly named font runtime files;
4. install title frames, sheet, web files and Godot resources;
5. generate role maps and loaders;
6. retain source/style/build evidence;
7. verify target ownership before replacement;
8. commit and normally push only after exact target HEAD, remote and clean-worktree checks.

Force push and history rewriting remain outside the implementation.
