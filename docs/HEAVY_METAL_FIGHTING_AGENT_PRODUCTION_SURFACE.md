# HEAVY METAL FIGHTING — agent production surface

Status: read-only production orchestration surface  
Project: **HEAVY METAL FIGHTING**  
Provider execution: prohibited  
Approval and promotion: prohibited

## Purpose

The general HEAVY METAL FIGHTING Art Studio MCP describes the game, compatibility atlas, final sprite census, Pilots, Frames, moves, UI, arenas and style proof.

This dedicated production MCP starts one level later. It exposes the final 1,573-image / 179-batch production queue to ChatGPT, Claude or another authorised agent without giving that agent permission to generate, approve, promote, commit or publish artwork.

The surface is intentionally narrow:

```text
registry
→ batch
→ immutable one-image work order
→ receipt requirements
→ bounded repair template
→ deterministic resume plan
```

It is not an image-generation server.

## Start on Windows

```powershell
node C:\GitRepos\evavo-art-studio\scripts\heavy-metal-fighting-production-mcp.mjs
```

Example MCP configuration:

```text
config/mcp.heavy-metal-fighting-production.windows.example.json
```

## Tools

### `evavo_hmf_production_registry_summary`

Returns the exact final production totals, hashes, first and last batches, style-proof batch IDs and authority boundary.

The expected launch totals remain:

```text
1,573 source images
179 governed batches
896 production Frame body cels
677 supporting source images
```

### `evavo_hmf_production_registry_batch`

Inspects one numbered production batch:

```text
hmf-b0001 ... hmf-b0179
```

The result includes the one-to-ten source-art units, dependencies, approval prerequisites, production wave and exact workspace destinations.

### `evavo_hmf_production_work_order_batch`

Compiles every source-art unit in one numbered batch into a separate immutable work order.

A ten-image batch therefore becomes ten independent one-image instructions. It never becomes a provider contact sheet, grid or packed atlas request.

### `evavo_hmf_production_work_order`

Returns one exact work order containing:

- registry and authority hashes;
- batch and unit identity;
- native dimensions and authoring canvas;
- alpha, pivot and ground-line policy;
- Pilot or Frame identity authority;
- construction, landmark, hardpoint and palette references;
- within-bank previous/next continuity references where applicable;
- source intent for supporting art;
- one bounded provider prompt;
- technical and anti-generic failure vocabulary;
- candidate, review, version, receipt and journal paths;
- explicit non-execution authority.

Final Frame body work orders remain locked to:

```text
160 × 160 native
640 × 640 authoring reference
pivot 80,152
true alpha
nearest-neighbour mastering
one physical body cel
separate effects
```

### `evavo_hmf_production_receipt_template`

Returns the governed lifecycle and the fields required to record production evidence for one work order.

This MCP tool **does not create or persist a receipt**.

Human-only states remain:

```text
generation-authorized
selected-or-repair-requested
named-human-approved
```

An agent may inspect these requirements but cannot satisfy them automatically through this server.

### `evavo_hmf_production_repair_template`

Compiles one bounded repair instruction from:

- exact failed unit;
- failed candidate SHA-256;
- one or more approved failure codes;
- bounded attempt number.

The resulting repair explicitly freezes passing siblings and forbids regenerating them.

### `evavo_hmf_production_resume_batch`

Accepts zero or more already-recorded hash-linked receipts and reports each work order's next legal action.

Examples include:

```text
lock-references
request-generation-authorization
run-provider-once
run-deterministic-qa
run-creative-review
select-or-request-repair
authorize-bounded-repair
master-selected-candidate
request-named-human-approval
compile-delivery-readiness
complete
```

This is especially important when an agent session ends halfway through a ten-image batch. The next agent can resume from evidence instead of guessing what happened.

### `evavo_hmf_production_verify`

Combines the exact registry and work-order governance verification and repeats the authority boundary.

## Read-only authority boundary

The production MCP exposes no tool that can:

```text
generate images
call an image provider
persist a receipt
pretend a human authorized generation
approve a candidate
promote a master
write to steel-dominion
commit
push
deploy
publish
```

Those actions require separately authorised surfaces.

This distinction is deliberate. An agent should be able to plan and inspect the entire art campaign without silently gaining the ability to mutate the project's source of truth.

## Typical agent flow

A safe agent session looks like:

```text
1. production_registry_summary
2. production_resume_batch hmf-bXXXX
3. production_registry_batch hmf-bXXXX
4. production_work_order_batch hmf-bXXXX
5. inspect each work order
6. stop at human/provider boundary
```

After externally authorised candidate production and review evidence exists, a later session can supply the recorded receipt array to `production_resume_batch` and continue from the exact legal next state.

## Why this matters for visual consistency

HEAVY METAL FIGHTING has a long art campaign. The risk is not only bad single images; it is gradual drift across hundreds of separate outputs.

This surface makes every agent interaction resolve back to the same hashes, Frame/Pilot identity, 1990s style contract, batch boundaries, work-order paths and receipt history. Bastion's later attack cel therefore remains tied to the same construction and material logic as his first style-proof pose, and a repaired image cannot silently force regeneration of nine passing siblings.
