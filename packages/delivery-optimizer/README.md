# `@evavo/art-delivery-optimizer`

Deterministic, role-aware runtime image preparation for EVAVO projects.

The package converts retained source art into repository-ready delivery derivatives. It does not generate art, approve assets, mutate Git, or replace editable masters.

## What it governs

- actual runtime dimensions instead of arbitrary 4K/1080p storage;
- PNG or near-lossless WebP selection by target and asset role;
- palette-aware PNG compression with decoded-pixel quality evidence;
- conservative border-connected matte removal for standing sprites, props, overlays and icons;
- continuous luminance-to-alpha mastering for rain, snow, fog, spray and reflections painted over black;
- explicit preservation of authored black dialogue stages and other intentional backgrounds;
- alpha integrity, edge decontamination, transparent RGB bleed and file-size budgets;
- exact SHA-256, byte-length, profile, transformation and candidate receipts;
- create-only atomic batch outputs suitable for the governed game-media publisher.

## Commands

```powershell
pnpm --filter @evavo/art-delivery-optimizer build

pnpm --filter @evavo/art-delivery-optimizer start -- profiles

pnpm --filter @evavo/art-delivery-optimizer start -- image `
  --input C:\assets\character.png `
  --profile retro-standing-character-576 `
  --background black `
  --dry-run

pnpm --filter @evavo/art-delivery-optimizer start -- image `
  --input C:\assets\rain-over-black.png `
  --profile retro-overlay-720p `
  --background luminance-alpha `
  --dry-run

pnpm --filter @evavo/art-delivery-optimizer start -- batch `
  --manifest C:\assets\delivery-manifest.json `
  --source-root C:\assets\source `
  --output-root C:\assets\prepared `
  --apply
```

`--background black` uses conservative black-matte thresholds and only removes matte-like pixels connected to the image border. Enclosed black clothing, hair, hatching, holes and shadows remain foreground. Use `preserve` for dialogue portraits and any image whose black field is part of the authored composition.

`--background luminance-alpha` converts source luminance into a continuous alpha channel, multiplies it by any source alpha and writes neutral white tintable overlay colour. It does not use a binary threshold. Batch manifests may additionally declare bounded `blackPoint`, `whitePoint`, `gamma`, `outputColour` and `invert` settings. This mode is for light-like overlays, not for character cut-outs or black-backed dialogue art.

See `docs/delivery-image-optimization.md` for profile selection, safety boundaries and the Brass & Brine reference policy.
