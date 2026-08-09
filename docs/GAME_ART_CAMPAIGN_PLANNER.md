# Game Art Campaign Planner

The Game Art Campaign Planner turns the canonical EVAVO Shell 95, GODZ, JONEZ, SKYFURY and PIZZA art catalogue into exact, deterministic image-generation work.

It solves the campaign-scale problem that an individual sprite planner does not: it expands every required animation frame and standalone asset, assigns exact native and authoring dimensions, writes a frame-specific mini prompt, creates deterministic filenames and target paths, and divides the work into family-locked batches of no more than ten separate images.

The planner does **not** call an image provider. It is the safe planning and retrieval layer used before Art Studio generation, intake, review, atlas assembly and Godot export.

## Canonical campaign

The source of truth is a self-verifying bundle:

```text
config/game-art-campaign.four-games.v1.json
config/game-art-campaign.four-games.v1.payload.b64.part-001 … part-005
```

The small JSON wrapper records both compressed and uncompressed SHA-256 identities. The payload is a deterministic gzip of the complete readable JSON request, encoded as five bounded base64 text parts. The loader requires canonical regular single-link files, confirms that source identity remains stable during each read, caps compressed and expanded size, rejects path escapes, verifies both hashes and only then parses the request. This keeps the complete 3,155-image catalogue in source control without committing a 440 KB repeated-key JSON file.

It compiles to:

| Surface/game | Families | Separate images | Ten-slot batches |
|---|---:|---:|---:|
| EVAVO Shell 95 | 4 | 78 | 9 |
| GODZ | 8 | 1,017 | 104 |
| JONEZ | 9 | 344 | 37 |
| SKYFURY | 9 | 408 | 44 |
| PIZZA | 11 | 1,308 | 136 |
| **Total** | **41** | **3,155** | **330** |

There are 28 partial final-family batches and 145 deliberately unused slots. Unused slots are never padded with invented work. Batches never mix games or asset families because doing so weakens continuity and reviewability.

## What every image unit contains

Every compiled source image or frame declares:

- game, family, production phase and continuity key;
- exact native runtime dimensions;
- exact integer-multiple provider authoring canvas;
- transparent, opaque or mixed-alpha policy;
- deterministic filename and intended Godot repository path;
- clip, direction, frame number, FPS, loop mode and exact pose when animated;
- pivot and Y-sort origin where required;
- game-specific style lock, family direction, subject direction and negative rules;
- explicit one-image-only instruction;
- review preset and human-approval boundary.

The generated prompt always forbids grids, contact sheets, storyboards, labelled panels and multi-frame sprite sheets. Runtime sprites use true alpha, hard pixel edges, nearest-neighbour presentation and integer geometry. Full-screen plates remain opaque where required.

## Production order

The request deliberately orders the work as:

1. EVAVO Shell 95;
2. GODZ;
3. JONEZ;
4. SKYFURY;
5. PIZZA;
6. five deterministic Pixel Font Studio builds.

Within each surface, vertical-slice families come first, then primary production, content breadth and polish. A generated result is still only a candidate. Human art review remains mandatory before intake approval, atlas assembly, Godot integration or promotion.

## Root commands

Art Studio exposes the campaign through the root package scripts:

```powershell
pnpm run game-art:campaign:summary -- --request .\config\game-art-campaign.four-games.v1.json
pnpm run game-art:campaign:batch -- --request .\config\game-art-campaign.four-games.v1.json --game godz --batch 1
pnpm run game-art:campaign:compile -- --request .\config\game-art-campaign.four-games.v1.json --output D:\EVAVO-Evidence\Game-Art\campaign-plan.json --markdown D:\EVAVO-Evidence\Game-Art\campaign-plan.md
pnpm run game-art:campaign:check
```

The complete repository `pnpm check` transaction also runs `game-art:campaign:check`. No dependency or lockfile update is required because the planner uses only pinned Node.js built-ins.

## CLI

Compile a self-hashed JSON plan and readable Markdown summary:

```powershell
Set-Location C:\GitRepos\evavo-art-studio

node .\scripts\game-art-campaign-planner.mjs compile `
  --request .\config\game-art-campaign.four-games.v1.json `
  --output D:\EVAVO-Evidence\Game-Art\campaign-plan.json `
  --markdown D:\EVAVO-Evidence\Game-Art\campaign-plan.md
```

Outputs are create-only. Existing plan files are not silently overwritten.

Read the compact inventory without writing files:

```powershell
node .\scripts\game-art-campaign-planner.mjs summary `
  --request .\config\game-art-campaign.four-games.v1.json
```

Retrieve one exact generation job. Batch numbers are one-based inside the selected game:

```powershell
node .\scripts\game-art-campaign-planner.mjs batch `
  --request .\config\game-art-campaign.four-games.v1.json `
  --game godz `
  --batch 1
```

That command returns the ten ordered GODZ hero-frame prompts, filenames, dimensions, alpha rules, pivots and intended runtime paths for `godz.hero_base.batch-001`.

## MCP tools

The MCP server exposes:

```text
evavo_game_art_campaign_summary
  Compile and return the compact exact inventory.

evavo_game_art_campaign_batch
  Return one ordered, family-locked generation batch.

evavo_game_art_campaign_write_plan
  Write the full self-hashed JSON plan and optional Markdown summary.
```

Summary and batch retrieval are read-only. Plan writing appears only when all three safeguards are present:

```text
EVAVO_GAME_ART_CAMPAIGN_MODE=read-write
EVAVO_GAME_ART_CAMPAIGN_ALLOW_WRITES=true
EVAVO_GAME_ART_CAMPAIGN_ALLOWED_ROOTS=<explicit roots>
```

Every write call also requires `confirmWrite=true`. Paths must be canonical regular paths inside an allowed root. Plan outputs are create-only. The example Windows registration is:

```text
config/mcp.game-art-campaign-planner.windows.example.json
```

The MCP server never executes a provider, edits art, assembles an atlas, mutates GodotGameFoundationKit, promotes a candidate, grants approval, commits, pushes, publishes or force-pushes.

## Pixel-font phase

After the shared shell and all four image campaigns complete, Pixel Font Studio owns five original deterministic families:

| Family | Faces |
|---|---|
| EVAVO Shell 95 | `shell_ui`, `shell_dos`, `shell_tiny`, `shell_symbols` |
| GODZ Stone | `stone_text`, `stone_display`, `stone_numerals` |
| JONEZ City VGA | `city_body`, `city_dialog`, `city_figures` |
| SKYFURY Command | `instrument`, `command`, `stencil_display` |
| PIZZA Ledger | `ledger_body`, `ledger_compact`, `menu_display` |

Fonts are intentionally sequenced after image art in this campaign because that is the requested production order. Final UI still requires native-scale text reflow, glyph, baseline, tabular-number, punctuation, focus and 0.75×–2× accessibility review.

## Validation

Run the complete deterministic and adversarial suite:

```powershell
node --test .\scripts\game-art-campaign-planner.test.mjs
```

The suite proves:

- exact 3,155-image and 330-batch inventory;
- all 41 family counts and all five surface/game totals;
- sequential batch numbering and maximum ten-image capacity;
- no cross-game or cross-family batch mixing;
- unique IDs, filenames and runtime target paths;
- exact integer authoring scale and alpha declaration;
- frame-specific prompt completeness;
- deterministic serialization and self-hash verification;
- rejection of unsafe batch sizes, bundle path escapes, payload tampering, unstable source identities, linear filtering, disabled approval gates, invalid scales and duplicate assets;
- read-only MCP defaults, explicit write gating, allowed-root enforcement and create-only writes.

The dedicated `Game Art Campaign Planner` workflow repeats the tests, compiles the exact current plan, uploads the JSON and Markdown as bounded review artifacts, and proves the source tree remains clean.

## Relationship to existing Art Studio tools

This planner feeds, but does not replace:

```text
Art Direction
  style, palette, camera, materials, layers and originality rules

Sprite Planner
  clip, direction, frame, pivot, Aseprite, atlas and Godot resource design

RAW_ART / provider execution
  governed generation and provider receipts

Project Art Intake and Sandbox
  safe image intake, staging, rename and organisation

Animation and Atlas tooling
  individual-frame review, deterministic sheets and runtime derivatives

Pixel Font Studio
  original bitmap-family planning, building, specimens, BMFont and Godot resources
```

The intended chain is:

```text
canonical campaign request
-> exact batch retrieval
-> governed provider generation of separate images
-> project-art intake and sandbox
-> native-scale and continuity review
-> human approval
-> deterministic atlas and Godot resources
-> target-repository integration
-> Development Studio validation and current-head game evidence
```
