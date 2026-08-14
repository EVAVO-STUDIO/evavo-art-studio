# Artist Workspace agent suite

This is the canonical local MCP deployment for ChatGPT, Claude and trusted EVAVO agents working with persistent project artwork.

Use:

```text
config/mcp.project-art-workspace.windows.example.json
```

The compatibility history is retained explicitly:

```text
v1  four persistent workspace servers
v2  five deliberately separate path-only servers
v3  six deliberately separate path-only servers
v4  seven deliberately separate path-only servers
v5  eight deliberately separate path-only servers
v6  nine deliberately separate path-only servers
```

The v2 compatibility example keeps all five write gates set to `false`. The v3 compatibility example keeps all six write gates set to `false`. The v4 compatibility example keeps all seven write gates set to `false`. The v5 compatibility example keeps all eight write gates set to `false`. The current v6 canonical example keeps all nine write gates set to `false`.

```text
evavo-project-art-workspace
evavo-project-art-workspace-ingest
evavo-project-art-workspace-catalog
evavo-project-art-workspace-jobs
evavo-project-art-avatar-final-pass-provider
evavo-project-art-avatar-final-pass-provider-runtime
evavo-project-art-avatar-final-pass-provider-candidate
evavo-project-art-avatar-final-pass-provider-frame-finisher
evavo-project-art-avatar-sequence-release
```

## Complete governed flow

```text
ChatGPT / Claude attachment, repository image or generated candidate
→ approved external source root
→ exact external-ingest plan
→ immutable original under sources/
→ editable working copy under working/
→ content-addressed workspace catalog
→ create-only crash-resumable production job
→ stale-lease recovery and output-evidence verification
→ deterministic cleanup, mastering, compositing, sprites or animation work
→ append-only workspace snapshot
→ visual review and explicit creative decision
→ sealed avatar final-pass plan
→ named-human provider authorization and exact reference-artifact admission
→ one-candidate redraw or anatomy-safe in-between request
→ one exact provider-runtime dispatch
→ compileProviderCandidateRuntimeContract
→ one successful candidate result or one explicit provider failure
→ strict non-animated RGBA PNG admission
→ create-only unapproved candidate materialization
→ hash-bound frame-finisher request
→ rerun frame finishing, registration and loop closure
→ named-human hands, anatomy, face identity and continuity decision
→ final reviewed SHA-256 before dependent in-betweens or sequences
→ owner-declared avatar sequence mastering plan
→ passed final-to-first loop evidence for every true loop
→ named-human art, animation and runtime release approvals
→ atomic reviewed sequence release seal
→ separate runtime-pack inspection and activation
→ exact EVAVO Storage handoff
→ separately governed repository publication
```

The external original is never renamed, deleted or overwritten. Ingest produces an immutable original and a separate editable working copy. Later processing publishes new create-only candidates or versions instead of mutating the original.

## Canonical servers

### `evavo-project-art-workspace`

Entrypoint: `tools/project_art_workspace_mcp.mjs`

Provides project intelligence, deterministic image plans, sprite and atlas work, persistent workspace creation, append-only snapshots and EVAVO Storage handoff preparation.

Write gate: `EVAVO_ART_WORKSPACE_MCP_ALLOW_WRITE=true`

### `evavo-project-art-workspace-ingest`

Entrypoint: `tools/project_art_workspace_ingest_mcp.mjs`

Provides atomic ingest from separately allowlisted external roots. It creates an immutable original, an editable working copy, provenance and rollback-safe receipts.

```text
EVAVO_ART_WORKSPACE_INGEST_ROOTS
EVAVO_ART_WORKSPACE_INGEST_SOURCE_ROOTS
EVAVO_ART_WORKSPACE_INGEST_MCP_ALLOW_WRITE
```

### `evavo-project-art-workspace-catalog`

Entrypoint: `tools/project_art_workspace_catalog_mcp.mjs`

Provides content-addressed inventories, bounded queries, exact duplicate detection and drift verification. A catalog is technical evidence, not creative approval.

Write gate: `EVAVO_PERSISTENT_CATALOG_MCP_ALLOW_WRITE=true`

### `evavo-project-art-workspace-jobs`

Entrypoint: `tools/project_art_workspace_jobs_mcp.mjs`

Provides append-only hash-chained checkpoints, crash-resumable work, stale-lease recovery and output-evidence verification. It does not execute providers or arbitrary shell commands.

```text
evavo_art_workspace_job_capabilities
evavo_art_compile_workspace_job
evavo_art_create_workspace_job
evavo_art_inspect_workspace_job
evavo_art_checkpoint_workspace_job
```

Write gate: `EVAVO_ART_WORKSPACE_JOBS_MCP_ALLOW_WRITE=true`

### `evavo-project-art-avatar-final-pass-provider`

Entrypoint: `tools/project_art_avatar_final_pass_provider_mcp.mjs`

```text
evavo_art_avatar_final_pass_provider_capabilities
evavo_art_compile_avatar_final_pass_provider_batch
```

Consumes a sealed final-pass plan and explicit selection. A redraw requires canonical identity and base-image references. A generated in-between requires canonical identity plus final previous and next key-pose hashes. Every request remains named-human authorised, one-candidate, transparent PNG and no fallback.

Write gate: `EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_MCP_ALLOW_WRITE=true`

### `evavo-project-art-avatar-final-pass-provider-runtime`

Entrypoint: `tools/project_art_avatar_final_pass_provider_runtime_mcp.mjs`

```text
evavo_art_avatar_final_pass_provider_runtime_capabilities
evavo_art_compile_avatar_final_pass_provider_runtime_dispatch
evavo_art_bind_avatar_final_pass_provider_runtime_contract
evavo_art_compile_avatar_final_pass_provider_runtime_outcome
```

Binds a ready request to `@evavo/art-providers` and `compileProviderCandidateRuntimeContract`. Durable retries retain one deterministic idempotent request and cannot become creative fallback variations. The outcome is one successful candidate result or one explicit provider failure. The bridge does not approve or promote a candidate.

Write gate: `EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_MCP_ALLOW_WRITE=true`

### `evavo-project-art-avatar-final-pass-provider-candidate`

Entrypoint: `tools/project_art_avatar_final_pass_provider_candidate_mcp.mjs`

```text
evavo_art_avatar_final_pass_provider_candidate_capabilities
evavo_art_materialize_avatar_final_pass_provider_candidate
```

Independently verifies immutable candidate and provider evidence artifacts, validates a strict non-animated RGBA PNG on the exact canvas, and publishes:

```text
candidate-01.png
candidate-01.materialization.json
candidate-01.finisher-request.json
```

The hash-bound frame-finisher request preserves the path to native-scale and contact-sheet inspection, hands and anatomy review, face identity review, continuity review and the final reviewed SHA-256 before dependent in-betweens or sequences.

```text
EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_ROOTS
EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ARTIFACT_ROOTS
EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_MCP_ALLOW_WRITE
```

### `evavo-project-art-avatar-final-pass-provider-frame-finisher`

Entrypoint: `tools/project_art_avatar_final_pass_provider_frame_finisher_mcp.mjs`

```text
evavo_art_avatar_final_pass_provider_frame_finisher_capabilities
evavo_art_finish_avatar_final_pass_provider_candidate
evavo_art_review_avatar_final_pass_provider_frame
```

Clears only hidden RGB beneath fully transparent pixels, preserving visible pixels, alpha, canvas, silhouette and registration. It then requires named-human native-scale, contact-sheet, hands and anatomy, face identity, adjacent-frame and applicable loop evidence.

Only `final-frame-admitted` permits a final frame hash to enter a sequence draft. `frame-repair-required` and `frame-rejected` remain blocked. Sequence release and runtime activation remain separate.

Write gate: `EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_MCP_ALLOW_WRITE=true`

### `evavo-project-art-avatar-sequence-release`

Entrypoint: `tools/project_art_avatar_sequence_release_mcp.mjs`

```text
evavo_art_avatar_sequence_release_capabilities
evavo_art_seal_avatar_sequence_release
```

Consumes one exact owner-declared mastering plan, one admitted final frame outcome for every runtime frame, one passed loop plan/review/receipt chain for every true loop, one timing hash and named-human art, animation and runtime approvals bound to the same release basis.

It publishes one atomic create-only bundle:

```text
sequence-release.json
runtime-pack.json
receipt.json
```

The sealed pack uses `evavo_avatar_sequence_pack_v2` and keeps `runtimeActivationAllowed: false`. Runtime activation remains separate. Repository publication must use EVAVO Storage managed paths or a reviewed normal non-force Git path.

```text
EVAVO_ART_AVATAR_SEQUENCE_RELEASE_ROOTS
EVAVO_ART_AVATAR_SEQUENCE_RELEASE_MCP_ALLOW_WRITE
```

## Safe deployment defaults

The current canonical configuration keeps all nine write gates set to `false`. Enable only the server needed for the current operation and only on the trusted local workstation.

Workspace roots govern plans, evidence, journals, workspaces, candidates, finished frames and releases. External ingest has a separate source allowlist. Candidate artifacts have a separate immutable artifact allowlist. Image bytes stay in local files and do not travel through MCP JSON.

## EVAVO Storage and publication

`evavo_art_prepare_storage_handoff` creates a self-hashed path-only request. It does not perform a Storage write. A finished frame, passed review, sealed sequence release or completed workspace job does not grant EVAVO Storage or repository authority.

Those later actions require separate authority and evidence. Git publication must be normal non-force. Force push remains unavailable.

## Creative and execution authority

Technical processing does not grant creative approval. By default the suite performs no automatic:

```text
runtime enqueue
provider execution
alpha extraction
creative review
candidate approval
candidate promotion
sequence release approval
EVAVO Storage write
target-repository mutation
Git commit or push
deployment
publication
runtime activation
force push
```

A write-enabled server can create only the bounded files owned by that server. It cannot turn technical writes into production readiness or separate authority.
