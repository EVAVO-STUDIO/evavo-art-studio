# Brass & Brine Pixel Font Family

`config/pixel-font-family.brass-brine.v1.json` is the canonical request for the original EVAVO bitmap-font family used by Brass & Brine.

## Coordinated faces

```text
bb_dos_display  title, masthead and major headers
bb_dos_ui       body, dialogue, buttons, selectors and input
bb_dos_ledger   tabular prices, dates, cash, cargo and numeric HUD values
bb_dos_micro    captions, hints, status text, tooltips and map labels
bb_dos_symbols  arrows, box drawing, weather, wind and EVAVO private symbols
```

The faces share the original `evavo-5x7-v1` construction grid but use different scale, spacing, weight, outline, shadow and monospace policies. No external font file is traced, converted, subsetted or redistributed.

## Production build

```powershell
Set-Location C:\GitRepos\evavo-art-studio
corepack enable
corepack prepare pnpm@10.13.1 --activate
pnpm install --frozen-lockfile
pnpm run pixel-font:brass:build -- --output D:\EVAVO-Evidence\Brass-Brine\pixel-font\brass-brine-dos
```

The wrapper compiles a self-hashed plan, builds the family create-only, independently validates the finished bytes and reports the family, validation and receipt identities.

The dedicated `Pixel Font Studio` workflow performs the same build on every relevant pull request and mainline change and uploads the complete generated family as a bounded workflow artifact.

## Godot 4.6.2 policy

Generated runtime files use:

```text
AngelCode text BMFont .fnt
non-interlaced 8-bit RGBA PNG atlas
Godot FontVariation .tres role resource
self-hashed family, face, role-map, validation and receipt JSON
```

Required runtime policy:

```text
nearest texture filtering
integer-multiple scaling
subpixel positioning disabled
mipmaps disabled
pixel-snapped 2D transforms and vertices
```

The generated role map uses the game path:

```text
res://assets/fonts/evavo/brass-brine-dos/
```

## Review and authority

Specimen sheets render every supported production line at 1× and 2×. Automated checks cover exact glyph coverage, confusables, power-of-two atlas bounds, PNG structure, BMFont headers, page linkage, metrics, Godot resources, role-map bindings, create-only outputs and content hashes.

A technically passing family is still not creative, historical, accessibility or native Godot approval. Those remain separate named reviews and independent Test Lab evidence. The generator never mutates the game repository, promotes a candidate, commits Git, pushes, publishes or force-pushes.
