# Pixel Typography Automation

EVAVO Art Studio exposes one shell-free discovery and dispatch command over the three production pixel-typography layers:

```text
Universal Pixel Font Studio v3 -> reusable font masters and runtime font packages
Pixel Text Studio              -> static/animated title, logo, heading and UI treatments
Repository Delivery            -> ownership-safe installation into the game/site repository that consumes them
```

The unified command does not replace those engines. It gives ChatGPT, Claude, local scripts and other tools a stable top-level route without requiring callers to know every internal filename.

## Discover capabilities

```powershell
node scripts\pixel-typography.mjs catalog
```

The result is JSON and declares the fixed delegated entrypoints, MCP servers and safety policy. The catalogue itself has no write, repository-mutation, creative-approval or publication authority.

## Universal font work

Forward any Universal v3 CLI command after `font`:

```powershell
node scripts\pixel-typography.mjs font catalog

node scripts\pixel-typography.mjs font validate-face `
  --face examples\pixel-font-universal\binary-proportional.face.json

node scripts\pixel-typography.mjs font validate-profile `
  --profile examples\pixel-font-universal\fantasy-herald.profile.json
```

The stable delegated entrypoint is `tools/pixel_font_universal.py`. Font masters remain independent of one game's title effects.

## Pixel titles, headings and UI text

Forward Pixel Text Studio commands after `text`:

```powershell
node scripts\pixel-typography.mjs text catalog

node scripts\pixel-typography.mjs text validate-style `
  --style examples\pixel-text-studio\dos-brass-title.style.json

node scripts\pixel-typography.mjs text render `
  --font C:\EVAVO\pixel-font-builds\my-game\runtime\MyGame_Herald.fnt `
  --text "BATTLE CHESS" `
  --style examples\pixel-text-studio\fantasy-fire-title.style.json `
  --output C:\EVAVO\pixel-text-builds\battle-chess-title
```

Pixel Text Studio keeps source glyph pixels authoritative and uses integer-coordinate raster operations. Static and animated treatments can retain individual PNG frames, a sheet, web files and a Godot `SpriteFrames` resource.

The starter catalogue includes DOS/CGA, brass, fantasy, arcade chrome, gothic, hologram, ice/rune, carved stone, strategy UI, warning, toxic-tech and web-neon directions. These are editable starting graphs, not a closed style list and not copies of commercial game logos.

## Deliver into another repository

Forward repository-delivery commands after `delivery`:

```powershell
node scripts\pixel-typography.mjs delivery catalog

node scripts\pixel-typography.mjs delivery plan `
  --job examples\pixel-font-repository-delivery\universal-godot-family.job.json `
  --workspace C:\EVAVO\pixel-font-delivery-work `
  --expected-head <exact-40-character-target-sha> `
  --output C:\EVAVO\pixel-font-delivery-work\delivery-plan.json
```

Delivery remains independently gated. Target repositories must be allowlisted, the expected target branch head must match exactly, installation is ownership-aware and transactional, and Git publication uses normal pushes only. The unified CLI does not weaken or bypass those checks.

## Canonical validation

Run the complete reusable typography stack with one command:

```powershell
node scripts\pixel-typography.mjs check
```

It runs, in order:

1. Universal v3 adversarial and determinism checks;
2. Pixel Text Studio deterministic rendering checks;
3. Pixel Text MCP checks;
4. cross-repository transactional/publication adversarial checks;
5. canonical ChatGPT/Claude automation-suite checks.

The dedicated GitHub contract additionally performs syntax checks and a real Universal-to-Godot delivery-plan smoke test. It is path-filtered so unrelated art-studio commits do not spend CI minutes on the typography suite.

## Agent deployment

The canonical MCP deployment is `config/mcp.pixel-font-automation.windows.example.json`. It starts three separately guarded servers:

```text
evavo-pixel-font-universal
evavo-pixel-text-studio
evavo-pixel-font-repository-delivery
```

The machine-readable suite declaration is `config/pixel-font-automation-suite.v1.json`. It also records this unified CLI as the stable non-MCP discovery/dispatch surface.

Writes remain disabled by default. Repository installation and Git publication are separately gated, and no server exposes arbitrary shell execution or force push.

## Related documentation

- `docs/PIXEL_TEXT_STUDIO.md` — title/UI rendering model, effects, animation and game/web outputs.
- `docs/PIXEL_FONT_REPOSITORY_DELIVERY.md` — naming, ownership, Godot setup, target-head guards and publication.
- Universal source examples live under `examples/pixel-font-universal/`.
- Pixel Text style examples live under `examples/pixel-text-studio/`.
