# Pixel Typography Automation

EVAVO Art Studio exposes one shell-free discovery and dispatch command over four production layers:

```text
Universal Pixel Font Studio v3 -> reusable font masters and runtime packages
Pixel Text Studio              -> static/animated title, logo, heading and UI treatments
Native Review                  -> fixed-resolution pages, palette evidence and integer-scale QA
Repository Delivery            -> ownership-safe installation into the consuming repository
```

## Discover capabilities

```powershell
node scripts\pixel-typography.mjs catalog
```

## Font work

```powershell
node scripts\pixel-typography.mjs font catalog
node scripts\pixel-typography.mjs font validate-face --face examples\pixel-font-universal\binary-proportional.face.json
```

## Styled pixel text

```powershell
node scripts\pixel-typography.mjs text catalog
node scripts\pixel-typography.mjs text validate-style --style examples\pixel-text-studio\dos-brass-title.style.json
```

Pixel Text Studio supports original DOS/CGA, brass, fantasy, arcade chrome, gothic, hologram, ice/rune, stone, strategy UI, warning, toxic-tech and web-neon starting graphs. They are editable treatments, not a closed list or copies of commercial logos.

## Native-resolution review

```powershell
node scripts\pixel-typography.mjs review catalog
node scripts\pixel-typography.mjs review validate-profile --profile examples\pixel-typography-review\vga-dos-320x200.review.json
```

Review kits can contain titles, motion grids, alphabets, numerals, punctuation, menu, HUD and status samples. They recompute final palettes, enforce optional budgets and emit exact integer-scale previews.

## Repository delivery

```powershell
node scripts\pixel-typography.mjs delivery catalog
node scripts\pixel-typography.mjs delivery plan --job examples\pixel-font-repository-delivery\universal-godot-family.job.json --workspace C:\EVAVO\pixel-font-delivery-work --expected-head <exact-sha> --output C:\EVAVO\pixel-font-delivery-work\delivery-plan.json
```

Target repositories must be allowlisted. Installation is ownership-aware and transactional. Publication remains separately gated and uses normal pushes only.

## Canonical validation

```powershell
node scripts\pixel-typography.mjs check
```

The command runs Universal v3, Pixel Text, Native Review, MCP, repository-delivery and automation-suite checks in sequence.

## Agent deployment

`config/mcp.pixel-font-automation.windows.example.json` starts:

```text
evavo-pixel-font-universal
evavo-pixel-text-studio
evavo-pixel-typography-review
evavo-pixel-font-repository-delivery
```

Writes remain disabled by default. Review output is create-only. Repository installation and Git publication are separately gated. No service exposes arbitrary shell execution or force push.

### Display-correct review evidence

Review profiles may declare a `displayPreview` alongside the native resolution. The native page remains the source-of-truth pixel grid; the display preview models the reviewed presentation dimensions and records native, display and pixel aspect ratios. Exact integer enlargements of the corrected display are retained separately, so agents cannot confuse native pixels, display geometry and zoomed inspection.
