# Artist Workspace agent suite

This is the canonical local MCP deployment for ChatGPT, Claude and trusted EVAVO agents working with persistent project artwork.

Use:

```text
config/mcp.project-art-workspace.windows.example.json
```

That one configuration registers six deliberately separate path-only servers:

```text
evavo-project-art-workspace
evavo-project-art-workspace-ingest
evavo-project-art-workspace-catalog
evavo-project-art-workspace-jobs
evavo-project-art-avatar-final-pass-provider
evavo-project-art-avatar-final-pass-provider-runtime
```

The primary server owns project inspection, deterministic image operations, sprite and atlas work, persistent workspace creation, append-only snapshots and EVAVO Storage handoff preparation. The ingest server owns exact placement of mounted chat attachments, generated images and approved local files into an existing workspace. The catalog server gives agents a content-addressed, queryable view of what the workspace actually contains and whether it has drifted. The jobs server adds append-only, crash-resumable checkpoints. The avatar final-pass provider server compiles explicitly selected hand, finger, anatomy, identity and continuity redraws plus generated in-betweens into one-candidate requests. The provider-runtime bridge binds one ready request to the canonical `@evavo/art-providers` durable runtime contract and validates the eventual candidate result or provider failure without itself enqueueing, executing, materializing, approving or publishing anything.

## End-to-end flow

```text
ChatGPT / Claude attachment, repository image or generated candidate
→ approved external source root
→ exact external-ingest plan
→ immutable original under sources/
→ editable working copy under working/
→ content-addressed workspace catalog
→ create-only resumable production job
→ deterministic cleanup, mastering, compositing, sprites or animation work
→ append-only success/failure checkpoint
→ exact output-evidence verification
→ append-only workspace snapshot
→ visual review and explicit creative decision
→ sealed avatar final-pass plan
→ named-human provider authorization and exact reference-artifact admission
→ one-candidate redraw or in-between batch
→ one exact provider-runtime dispatch
→ canonical generic runtime-contract compilation and binding
→ separately authorised runtime enqueue and one provider call
→ candidate-result or provider-failure normalization
→ create-only candidate materialization
→ rerun frame finishing, registration and loop closure
→ independent art, anatomy, identity and continuity review
→ final reviewed SHA-256 before dependent in-betweens or sequences
→ exact EVAVO Storage handoff
→ independently authorised Storage ingest
→ separately governed repository publication
```

The external file is never renamed, deleted or overwritten. Ingest publishes an immutable original and a separate editable working copy. Later operations publish new create-only candidates or versions rather than mutating the original.

## Canonical servers

### `evavo-project-art-workspace`

Entrypoint: `tools/project_art_workspace_mcp.mjs`

It provides project and repository art intelligence, deterministic image and sprite plans, cleanup, transparency repair, compositing, mastering, reference-derived work, temporary intake, atlases, persistent workspace creation, append-only snapshots and exact EVAVO Storage handoff preparation.

Write gate: `EVAVO_ART_WORKSPACE_MCP_ALLOW_WRITE=true`

### `evavo-project-art-workspace-ingest`

Entrypoint: `tools/project_art_workspace_ingest_mcp.mjs`

It provides exact external-source and destination-plan compilation, atomic ingest, immutable source-copy and editable working-copy creation, provenance receipts and rollback on late collision or byte mismatch.

Independent allowlists:

```text
EVAVO_ART_WORKSPACE_INGEST_ROOTS
EVAVO_ART_WORKSPACE_INGEST_SOURCE_ROOTS
```

Write gate: `EVAVO_ART_WORKSPACE_INGEST_MCP_ALLOW_WRITE=true`

### `evavo-project-art-workspace-catalog`

Entrypoint: `tools/project_art_workspace_catalog_mcp.mjs`

It provides create-only content-addressed inventories, exact SHA-256 and byte-length identity, image metadata, duplicate groups, bounded queries and missing/changed/unexpected drift verification. A catalog is technical evidence, not creative approval.

Write gate: `EVAVO_PERSISTENT_CATALOG_MCP_ALLOW_WRITE=true`

### `evavo-project-art-workspace-jobs`

Entrypoint: `tools/project_art_workspace_jobs_mcp.mjs`

It provides create-only plans, validated dependencies, append-only hash-chained checkpoints, short-lived claims, stale-lease recovery, exact next-step inspection, retryable failure evidence and output-drift verification. The job layer records governed work; it does not execute providers or arbitrary shell commands.

Canonical tools:

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

Canonical tools:

```text
evavo_art_avatar_final_pass_provider_capabilities
evavo_art_compile_avatar_final_pass_provider_batch
```

The server consumes a sealed final-pass plan and explicit job selection. A redraw requires exact `canonical-identity` and `base-image` references. A generated in-between requires exact `canonical-identity`, `previous-key-pose` and `next-key-pose` references. Every job requires named-human `run-provider-once` authorization. An in-between remains blocked until each endpoint has a final reviewed SHA-256.

Every ready envelope remains one candidate, no fallback, transparent PNG, with provider execution and all approval authority false.

Write gate: `EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_MCP_ALLOW_WRITE=true`

### `evavo-project-art-avatar-final-pass-provider-runtime`

Entrypoint: `tools/project_art_avatar_final_pass_provider_runtime_mcp.mjs`

Canonical tools:

```text
evavo_art_avatar_final_pass_provider_runtime_capabilities
evavo_art_compile_avatar_final_pass_provider_runtime_dispatch
evavo_art_bind_avatar_final_pass_provider_runtime_contract
evavo_art_compile_avatar_final_pass_provider_runtime_outcome
```

The bridge selects one exact ready job from the sealed provider batch. Its dispatch binds the immutable provider request to:

```text
package        @evavo/art-providers
export         compileProviderCandidateRuntimeContract
queue          provider
kind           art.candidate.edit | art.candidate.generate
attempts       3 durable retries of the same idempotent request
lease          300000 ms
timeout        1800000 ms
candidateCount 1
```

Durable retries must retain the same deterministic provider request and cannot become creative fallback variations. The binding step independently validates the normalized request, prompt hash, capability profile, queue, job kind, idempotency key, retry policy, lease and timeout. The outcome step accepts only one successful candidate result or one explicit provider failure.

A successful result produces a create-only materialization plan for the governed scratch path. It still requires the avatar frame finisher, native-scale inspection, art/anatomy/identity/continuity review, and a final reviewed SHA-256 before any dependent in-between or sequence can use it. A failure records zero candidates and requires fresh named-human generation and submission authorization before another attempt.

Write gate: `EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_MCP_ALLOW_WRITE=true`

The gate permits private create-only JSON dispatch, binding and outcome records inside configured roots. It does not compile the generic package, enqueue a runtime job, call a provider, materialize image bytes, approve a candidate or activate the avatar.

## Safe deployment defaults

The canonical example keeps all six write gates set to `false`. Enable only the server needed for the current operation and only on the trusted local workstation.

Workspace roots control plans, evidence, catalogs, journals and workspaces. Ingest source roots separately control external reads. Provider roots separately control sealed plans and batches. Runtime roots separately control dispatch, compiled-contract evidence and outcome records. Keep allowlists explicit rather than granting broad drive access.

Image bytes remain in local files and the artifact store. MCP carries bounded paths, hashes, dimensions, identifiers, plans, state and receipts; it does not transport image payloads through the language-model context.

## EVAVO Storage

`evavo_art_prepare_storage_handoff` creates an exact self-hashed request for selected workspace files. It does not perform the Storage write. Provider compilation, runtime binding, candidate outcome normalization, workspace processing or job completion is not Storage admission.

## Creative and publication authority

Technical processing, catalog verification, job completion, provider-request compilation, runtime-contract binding and outcome normalization do not grant creative approval. The suite performs no automatic:

```text
runtime enqueue
provider execution
candidate materialization
candidate approval
candidate promotion
EVAVO Storage write
target-repository mutation
Git commit or push
deployment
publication
runtime activation
force push
```

Those actions retain separate authority, evidence and confirmation boundaries.
