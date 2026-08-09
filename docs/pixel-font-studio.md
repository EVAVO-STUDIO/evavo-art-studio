# EVAVO Pixel Font Studio

Pixel Font Studio is the deterministic font-production surface inside EVAVO Art Studio. It creates original bitmap font families for games without depending on third-party font files or online generators.

## Outputs

A family compilation creates:

- AngelCode BMFont text descriptors (`.fnt`);
- lossless RGBA atlas PNGs with transparent backgrounds;
- per-font metric and lineage metadata;
- optional hostile-background specimen and glyph sheets;
- a Godot Theme resource and role map;
- a complete QA report;
- a canonical self-hashed manifest binding every emitted byte.

Atlas pixels are white on transparent so Godot can tint them without multiplying runtime textures.

## Original masters and repeatability

`config/pixel-font-master-5x7.v1.json` is an EVAVO-owned original glyph master. It covers printable ASCII, common punctuation and currency, box drawing, navigation arrows, and Brass & Brine symbols. The compiler applies bounded deterministic scale, weight, slant, tracking, monospace, and uppercase-display transforms. It never rasterizes a downloaded TTF or OTF.

Every family pins the raw SHA-256 of this glyph master. Changing the master therefore requires an explicit family revision and rebuild.

## CLI

```powershell
python tools/pixel_font_studio.py validate `
  --spec examples/brass-brine-pixel-font-family.v1.json

python tools/pixel_font_studio.py compile `
  --spec examples/brass-brine-pixel-font-family.v1.json `
  --output-dir .art-studio/pixel-fonts/brass-brine-dos

python tools/pixel_font_studio.py verify `
  --manifest .art-studio/pixel-fonts/brass-brine-dos/pixel-font-family.manifest.json
```

Compiled directories are create-only. Replacing a directory requires both its generated marker and `--replace-generated`; unrelated directories are never removed.

## Godot 4 contract

The compiler emits AngelCode BMFont text descriptors that Godot imports as bitmap fonts. The family contract requires nearest texture filtering and integer-multiple runtime sizes. It emits a Godot Theme containing coordinated display, UI, ledger, micro, and symbol roles. The game project still chooses when to activate that theme; compilation is not creative or gameplay approval.

## MCP for Chat and Claude

The standalone server is `tools/pixel-font-mcp.mjs` and exposes:

```text
evavo_pixel_font_validate_spec
evavo_pixel_font_compile
evavo_pixel_font_verify
evavo_pixel_font_provider_brief
```

Read-only mode exposes validation and verification. Writes require:

```text
EVAVO_PIXEL_FONT_MCP_MODE=read-write
EVAVO_PIXEL_FONT_ALLOW_WRITES=true
EVAVO_PIXEL_FONT_ALLOWED_ROOTS=<path-delimited canonical roots>
confirmWrite=true
```

The wrapper invokes only the bundled compiler with an argument vector and `shell = false`. It exposes no arbitrary shell, provider execution, game mutation, Git, approval, or publication capability.

## Provider-assisted ideation

`provider-brief` can describe the family, glyph coverage, style goals, and palette for optional image-provider exploration. Provider output is reference-only. Runtime font bytes must still be rebuilt deterministically from explicit glyph masters, pass Pixel Font Studio verification, pass Test Lab admission, and pass the game’s creative review.

## Brass & Brine reference family

The initial family contains five coordinated roles:

- `bb_dos_display` — large title and section display;
- `bb_dos_ui` — readable general interface copy;
- `bb_dos_ledger` — monospaced prices, dates, tables, and logs;
- `bb_dos_micro` — compact labels and map annotations;
- `bb_dos_symbols` — box drawing and game symbols.

The family uses a serious square-terminal 1990s DOS language, warm monochrome text, EVAVO signal red, and integer-scale metrics for the game’s 1280×720 pixel-snapped viewport.
