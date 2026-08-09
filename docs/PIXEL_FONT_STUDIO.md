# EVAVO Pixel Font Studio

Pixel Font Studio is the reusable, dependency-free production authority for original EVAVO bitmap-font families.

It generates:

```text
original 5×7 glyph primitives
→ deterministic face transformations
→ RGBA PNG atlases
→ AngelCode BMFont .fnt metadata
→ Godot FontVariation .tres resources
→ 1× and 2× specimen sheets
→ face metrics and QA
→ family manifest, validation and build receipt
```

No external font binary is traced, converted, subsetted or redistributed. A request may retain full specimen and per-glyph evidence for review, or set `delivery.includeSpecimens=false` and `delivery.includeDetailedGlyphRecords=false` for a compact runtime package while preserving exact BMFont coverage and atlas validation. Each family request defines coordinated display, UI, ledger, micro and symbol faces, their palettes, glyph sets, Godot role map and quality limits.

## CLI

```powershell
node scripts/pixel-font-studio.mjs catalog

node scripts/pixel-font-studio.mjs plan `
  --request C:\work\font-family.json `
  --output C:\work\font-output `
  --plan-output C:\work\font-plan.json

node scripts/pixel-font-studio.mjs build `
  --request C:\work\font-family.json `
  --output C:\work\font-output `
  --plan C:\work\font-plan.json

node scripts/pixel-font-studio.mjs validate `
  --family C:\work\font-output\pixel-font-family.json
```

All generated files are create-only. Rebuilding into a used target fails instead of replacing existing art evidence.

## MCP

The MCP exposes:

```text
evavo_pixel_font_catalog
evavo_pixel_font_plan
evavo_pixel_font_build
evavo_pixel_font_validate
```

Read-only mode exposes catalogue, planning and validation. Builds require:

```text
EVAVO_PIXEL_FONT_STUDIO_MODE=read-write
EVAVO_PIXEL_FONT_STUDIO_ALLOW_WRITES=true
EVAVO_PIXEL_FONT_ALLOWED_ROOTS=<bounded roots>
confirmWrite=true
```

The build tool writes only inside the configured roots. It does not promote candidates, overwrite project sources, commit Git changes, push, publish or force-push.

## Godot 4

The primary runtime pair is an AngelCode text `.fnt` and a non-interlaced RGBA PNG atlas. Godot imports the `.fnt` as `FontFile`; generated `.tres` resources provide stable `FontVariation` role assets. Runtime policy is always:

```text
nearest texture filtering
integer-multiple scaling
subpixel positioning disabled
mipmaps disabled
pixel-snapped 2D transforms and vertices
```

The family manifest and role map retain exact file SHA-256 identities so a separate Test Lab can independently reopen the delivered bytes.

## Review boundary

Automated QA checks glyph coverage, atlas bounds, strict PNG structure, BMFont dimensions, confusable glyphs, output hashes and Godot policy. It does not claim creative, historical, accessibility or native rendered-scene approval. Those remain named downstream reviews.
