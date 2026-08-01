# `@evavo/art-delivery-optimizer`

Deterministic, role-aware runtime image preparation for EVAVO projects.

The package converts retained source art into repository-ready delivery derivatives. It does not generate art, approve assets, mutate Git, or replace editable masters.

## What it governs

- actual runtime dimensions instead of arbitrary 4K/1080p storage;
- PNG or near-lossless WebP selection by target and asset role;
- palette-aware PNG compression with decoded-pixel quality evidence;
- conservative border-connected matte removal for standing sprites, props, overlays and icons;
- explicit preservation of authored black dialogue stages and other intentional backgrounds;
- alpha integrity, edge decontamination, transparent RGB bleed and file-size budgets;
- exact SHA-256, byte-length, profile, transformation and candidate receipts;
- create-only atomic batch outputs suitable for the governed chat-asset publisher.

## Commands

```powershell
pnpm --filter @evavo/art-delivery-optimizer build

pnpm --filter @evavo/art-delivery-optimizer start -- profiles

pnpm --filter @evavo/art-delivery-optimizer start -- image `
  --input C:\assets\character.png `
  --profile retro-standing-character-576 `
  --background black `
  --dry-run

pnpm --filter @evavo/art-delivery-optimizer start -- batch `
  --manifest C:\assets\delivery-manifest.json `
  --source-root C:\assets\source `
  --output-root C:\assets\prepared `
  --apply
```

`--background black` uses conservative black-matte thresholds and only removes matte-like pixels connected to the image border. Enclosed black clothing, hair, hatching, holes and shadows remain foreground. Use `preserve` for dialogue portraits and any image whose black field is part of the authored composition.

See `docs/delivery-image-optimization.md` for profile selection, safety boundaries and the Brass & Brine reference policy.
