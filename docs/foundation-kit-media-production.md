# Foundation Kit final-art production

EVAVO Art Studio compiles deterministic final-art work orders for `EVAVO-STUDIO/GodotGameFoundationKit` from two immutable authorities:

1. the game-owned production contract; and
2. one exact Art Studio repository audit.

The Art Studio does not own final runtime policy. It reads the policy from:

```text
examples/playable_foundation_hub/data/
  foundation_kit_media_production_contract_v1.json
```

## Pipeline

```text
retained editable masters and source drops
  → Art Studio repository audit
  → Foundation Kit role classification
  → deterministic media production plan
  → role-specific mastering and optimization
  → Test Lab exact-byte plan validation
  → Godot import and native capture
  → human creative approval
  → Development Studio sealed Git/LFS publication
```

Audio is routed separately through EVAVO Audio Studio. The Foundation Kit contract includes audio policy so the complete release boundary remains game-owned, but this Art Studio compiler deliberately selects image roles only.

## Audit

```powershell
pnpm art -- inspect `
  --repo C:\GitRepos\GodotGameFoundationKit `
  --output C:\EVAVO-Evidence\GodotGameFoundationKit\art-audit.json
```

The audit records source paths, SHA-256, byte lengths, image structure, role inference, alpha evidence, references, exact duplicates, animation families, frame gaps, recommendations and review findings.

## Compile a plan

```powershell
pnpm run foundation:plan -- `
  --repo C:\GitRepos\GodotGameFoundationKit `
  --contract C:\GitRepos\GodotGameFoundationKit\examples\playable_foundation_hub\data\foundation_kit_media_production_contract_v1.json `
  --audit C:\EVAVO-Evidence\GodotGameFoundationKit\art-audit.json `
  --output C:\EVAVO-Evidence\GodotGameFoundationKit\media-production-plan.json
```

Limit a work order to one or more roles:

```powershell
pnpm run foundation:plan -- `
  --repo C:\GitRepos\GodotGameFoundationKit `
  --contract C:\GitRepos\GodotGameFoundationKit\examples\playable_foundation_hub\data\foundation_kit_media_production_contract_v1.json `
  --audit C:\EVAVO-Evidence\GodotGameFoundationKit\art-audit.json `
  --output C:\EVAVO-Evidence\GodotGameFoundationKit\godz-character-plan.json `
  --role godz-character-atlas
```

Add `--strict` only when a create-only plan should be written exclusively when no blocker or review item remains.

## Input authority and filesystem safety

The plan is accepted only when every authority still describes the same repository and remains safe to read.

### Audit-root binding

The audit’s canonical `root` must resolve to the exact canonical `--repo` directory. An audit captured from another checkout, another repository, or a stale copied path fails with `AUDIT_ROOT_MISMATCH` before any plan file is created.

Every audited row must also carry a canonical repository-relative path, matching lowercase extension, safe byte length, lowercase SHA-256, role, category, findings and complete image evidence where applicable. Malformed or incomplete identities fail closed rather than entering a work order.

### Symlink rejection

The repository, contract, audit and output-parent path are inspected segment by segment. Symlinked authority paths are rejected with `SYMLINK_PATH_FORBIDDEN`; resolving a symlink first and then trusting its target is not sufficient. Contract and audit reads are descriptor-bound and checked before, during and after parsing so replacement during a read is rejected.

### Output isolation

The output is a create-only plan file, but creating it is still a filesystem mutation. The command therefore reports:

```text
planFileCreated = true
mutationPerformed = true
mutationScope = create-only-plan-file
targetRepositoryMutationPerformed = false
```

The output must remain outside the target game repository. `OUTPUT_INSIDE_REPOSITORY` prevents a planning command from silently dirtying `GodotGameFoundationKit`, and `wx` creation prevents overwriting an earlier plan.

### Collision completeness

Runtime destinations are grouped by portable, case-insensitive identity. When two or more sources would create the same target, every member receives `runtime-target-collision`; the first item is not incorrectly left looking ready. Windows reserved stems such as `con`, `aux`, `com1` and `lpt1` are retained as explicit blockers rather than emitted as invalid runtime names.

## Role resolution

The compiler matches audited files against contract-owned `auditRoles` and `pathTokens`. Exact audit-role evidence takes priority over a path-token match. Equal-strength ambiguity is retained as the blocker:

```text
ambiguous-role-classification
```

Other deterministic blockers include:

```text
meaningful-alpha-required
opaque-art-cannot-be-fully-transparent
exact-canvas-mismatch
image-evidence-required
runtime-target-collision
windows-reserved-runtime-name
```

Planning mode retains these blockers. Strict mode fails before creating the output file.

## Runtime names and destinations

Runtime targets are generated beneath the selected role’s contract-declared `runtimeRoot` using lowercase snake-case names. Output extension is derived from the contract-owned runtime format. Role runtime roots must remain inside the contract’s declared runtime roots.

The compiler does not overwrite an existing plan, mutate the target repository, delete assets, commit or publish. Editable masters remain outside the runtime derivative roots. A runtime file is produced from the retained master, not recursively recompressed from a previous derivative.

## Mastering rules

The game contract is authoritative, including:

- HUB 32×32 executable icons and 16×16 cursor states;
- exact 640×400 boot plates;
- bitmap-font glyph cells and baseline evidence;
- GODZ 48×56 character-frame authority and authored room environments;
- JONEZ 640×400 location plates and small board tokens;
- SKYFURY aircraft, target and battlefield assets;
- PIZZA isometric entity, furniture and management UI assets;
- nearest filtering and disabled mipmaps for low-resolution images;
- per-role alpha, crop, fit, animation and native-review stages.

Use the delivery optimizer for deterministic derivatives. It already supports lossless pixel assets, conservative connected matte removal and continuous luminance-to-alpha mastering for light-like overlays.

## Test Lab handoff

```powershell
python -m godot_game_test_lab.foundation_media_plan `
  C:\GitRepos\GodotGameFoundationKit `
  C:\GitRepos\GodotGameFoundationKit\examples\playable_foundation_hub\data\foundation_kit_media_production_contract_v1.json `
  C:\EVAVO-Evidence\GodotGameFoundationKit\art-audit.json `
  C:\EVAVO-Evidence\GodotGameFoundationKit\media-production-plan.json `
  --strict
```

Godot Game Test Lab independently checks contract and audit identities, work-item source hashes, role fields, target containment, summary counts and five authored native review surfaces.

Godot Web Runtime remains a separate native/web execution surface. It consumes approved runtime assets and does not become planning, selection or publication authority.

## Long-running agent work

Large inventories, sprite-family mastering and native capture batches should be exposed as cancellable MCP Tasks. The client receives progress and evidence resources rather than arbitrary shell or Git arguments. Task completion is not publication authority.

## Publication

After Art Studio mastering, Test Lab import/capture and human approval, publish exact reviewed bytes through EVAVO Development Studio’s governed game-media transaction. That path owns Git LFS checks, sealed commit creation, signed publication transaction authorization, non-forced main publication and provider confirmation.

## Truth boundary

A compiler pass proves deterministic plan construction from exact inputs. It does not prove:

- that art is attractive or historically authentic;
- that an animation feels correct;
- that Godot imported or rendered the derivative;
- that audio is complete;
- that a human approved the release;
- that publication occurred.
