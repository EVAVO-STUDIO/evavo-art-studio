# HEAVY METAL FIGHTING Art Studio operations

This companion to [`HEAVY_METAL_FIGHTING_ART_STUDIO_RUNTIME.md`](HEAVY_METAL_FIGHTING_ART_STUDIO_RUNTIME.md) defines the locked first style proof, CLI and MCP use, authority boundaries, validation and safe production order.

## Locked first style proof

Expansion remains blocked behind:

```text
BRANKA KOVAC / GRAVEBELL
BASTION / BX-09 GRAVEBELL
DANUBE WORKS SERVICE CRADLE
FOUNDRY NINE
HEAVY METAL FIGHTING TITLE
```

The proof resolves twenty-one exact Bastion source cels, four Branka portrait states, supporting title assets, Foundry Nine assets and service-bay assets.

It deliberately reports the present slot-24 conflict between:

```text
rivet-driver-recovery
gravebell-startup
```

The planned map resolves that conflict by retaining the first cel at slot 24 and moving the second to slot 25.

The style proof does not approve itself. Its output is evidence for a named human reviewer.

## Command-line use

Run from the Art Studio repository root.

### Verify everything

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs verify
```

### Summarise the complete campaign

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs summary
```

### Inspect the mechanical contract

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs contract
```

### Inspect one complete Frame plan

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs frame bastion
node scripts/heavy-metal-fighting-art-studio.mjs frame viper
node scripts/heavy-metal-fighting-art-studio.mjs frame citadel
node scripts/heavy-metal-fighting-art-studio.mjs frame mirage
```

### Inspect one exact authored source cel

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs cel bastion 25
```

This returns the bounded source cel, its mechanical identity, previous and next conditioning, current runtime collision context, planned runtime binding and review gates without returning the other 119 cels.

### Inspect one runtime atlas slot

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs slot bastion current 24
node scripts/heavy-metal-fighting-art-studio.mjs slot bastion planned-v2 25
```

The command reports whether the slot is mapped, reserved or colliding and lists the exact authored source cels bound to it.

### Retrieve one family-locked production batch

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs batch 1
```

Each batch contains one to ten separate work units. Cross-family batching, padding generation, grids, contact sheets and provider-authored final sheets remain prohibited.

### Inspect the first style proof

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs style-proof
```

### Compile a hash-bound handoff template

```powershell
node scripts/heavy-metal-fighting-art-studio.mjs handoff-template `
  <40-character-game-commit-sha> `
  <64-character-live-slot-manifest-sha256>
```

This command returns a template only. It does not write to the game repository.

## MCP use for ChatGPT or Claude

Start the read-only stdio server:

```powershell
node scripts/heavy-metal-fighting-art-studio-mcp.mjs
config/mcp.heavy-metal-fighting-art-studio.windows.example.json
```

Available tools:

```text
evavo_heavy_metal_fighting_summary
evavo_heavy_metal_fighting_mechanical_contract
evavo_heavy_metal_fighting_frame_plan
evavo_heavy_metal_fighting_source_cel
evavo_heavy_metal_fighting_runtime_slot
evavo_heavy_metal_fighting_batch
evavo_heavy_metal_fighting_style_proof
evavo_heavy_metal_fighting_verify
evavo_heavy_metal_fighting_handoff_template
```

A client can use these tools to:

1. identify the exact next family and batch;
2. inspect the Frame construction and continuity constraints;
3. retrieve one source cel with previous and next neighbours;
4. inspect current collisions, current reserved slots and planned-v2 mappings directly;
5. distinguish physical body art from separate effects;
6. review current and planned atlas mappings;
7. assemble a style-proof review package;
8. prepare a target-repository handoff bound to exact hashes.

The server intentionally exposes no generation, approval, promotion, repository-write, Git, deployment or publication tool.

## Production authority

### Art Studio owns

- campaign planning;
- work-unit identity;
- reference and continuity binding;
- mechanical identity review;
- candidate tracking;
- deterministic dimensions, alpha, pivot and bounds checks;
- sequence and style-proof evidence;
- repair routing;
- review packages;
- hash-bound handoff preparation.

### Image providers may do

- produce bounded candidates under an authorised work order;
- perform declared masked repairs;
- return provider evidence and outputs for review.

Providers may not define canon, redesign machinery between cels, build the final atlas, approve themselves or write into the game repository.

### The game repository owns

- live combat timing;
- hitboxes and damage;
- current slot semantics;
- atlas-v2 acceptance;
- Godot imports;
- runtime validation;
- final asset promotion;
- commits and deployment.

### Named human approval owns

- the first style proof;
- Pilot and Frame identity locks;
- native-scale visual quality;
- animation appeal and clarity;
- final promotion decisions.

## Validation

Focused validation:

```powershell
node --test `
  scripts/game-art-campaign-heavy-metal-fighting.test.mjs `
  scripts/heavy-metal-fighting-art-studio-core.test.mjs `
  scripts/heavy-metal-fighting-art-studio.test.mjs
```

Dedicated CI:

```text
.github/workflows/heavy-metal-fighting-art-studio.yml
```

The workflow checks syntax, compiles the retained campaign, runs adversarial mechanical-contract tests, validates the real bundle and MCP surface, produces exact JSON evidence, proves the source tree stayed clean and uploads the evidence artifact for the exact commit.

## Safe production sequence

1. Verify the campaign and mechanical contract.
2. Retrieve the locked first style-proof requirements.
3. Approve Branka identity, Bastion construction and title direction.
4. Produce Bastion source cels one bounded work unit at a time.
5. Review source topology independently of runtime slot packing.
6. Repair only failed source cels.
7. Validate native scale, silhouette, landmarks, pivots and mirrors.
8. Repeat for Viper, Citadel and Mirage.
9. Produce separate Frame effects and arena layers.
10. Bind the reviewed package to an exact game commit and live slot-manifest hash.
11. Let the game-repository workflow perform final Godot integration and promotion.

This structure lets ChatGPT, Claude, Codex and Art Studio cooperate without giving any one model uncontrolled authority over canon, source art, the game repository or release assets.
