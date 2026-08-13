# Artist Workspace agent suite

This is the canonical local MCP deployment for ChatGPT, Claude and trusted EVAVO agents working with persistent project artwork.

Use:

```text
config/mcp.project-art-workspace.windows.example.json
```

That one configuration registers five deliberately separate path-only servers:

```text
evavo-project-art-workspace
evavo-project-art-workspace-ingest
evavo-project-art-workspace-catalog
evavo-project-art-workspace-jobs
evavo-project-art-avatar-final-pass-provider
```

The primary server owns project inspection, deterministic image operations, sprite and atlas work, persistent workspace creation, append-only snapshots and EVAVO Storage handoff preparation. The ingest server owns exact placement of mounted chat attachments, generated images and approved local files into an existing workspace. The catalog server gives agents a content-addressed, queryable view of what the workspace actually contains and whether it has drifted. The jobs server adds append-only, crash-resumable execution checkpoints so another agent can continue the exact next step without reconstructing state from conversation memory. The avatar final-pass provider server compiles explicitly selected hand, finger, anatomy, identity and continuity redraws, plus anatomy-safe generated in-betweens, into one-candidate provider requests without executing a provider.

## End-to-end flow

```text
ChatGPT / Claude attachment, repository image or generated candidate
→ approved external source root
→ exact external-ingest plan
→ immutable original under sources/
→ editable working copy under working/
→ content-addressed workspace catalog
→ bounded discovery by area, path, media type, dimensions, alpha, animation or SHA-256
→ create-only resumable production job
→ exact input fingerprint + dependency check
→ bounded lease claim
→ deterministic cleanup, mastering, compositing, sprites or animation work
→ append-only success/failure checkpoint
→ exact output-evidence verification
→ safe resume after interruption
→ append-only workspace snapshot
→ catalog verification or a new catalog showing exact drift
→ visual review and explicit creative decision
→ sealed avatar final-pass plan where applicable
→ named-human provider authorization and exact reference-artifact admission
→ one-candidate redraw or in-between compilation
→ separately authorised provider runtime submission
→ independent candidate review
→ rerun frame finishing, registration and loop closure
→ exact EVAVO Storage handoff
→ independently authorised Storage ingest
→ separately governed repository publication
```

The external file is never renamed, deleted or overwritten. Ingest publishes an immutable original and a separate editable working copy. Later operations work from governed workspace paths and publish new create-only candidates or versions rather than mutating the original.

## Canonical servers

### `evavo-project-art-workspace`

Entrypoint:

```text
tools/project_art_workspace_mcp.mjs
```

Core capabilities include project and repository art intelligence; deterministic image and sprite sandbox plans; cleanup, transparency repair, compositing and mastering; reference-derived matching-image and matching-frame planning; temporary intake and variable-size sprite atlases; persistent workspace creation; append-only workspace snapshots; and exact EVAVO Storage handoff preparation.

Write operations require:

```text
EVAVO_ART_WORKSPACE_MCP_ALLOW_WRITE=true
```

### `evavo-project-art-workspace-ingest`

Entrypoint:

```text
tools/project_art_workspace_ingest_mcp.mjs
```

It provides exact external-source and destination-plan compilation, atomic ingest, immutable source-copy and editable working-copy creation, provenance receipts and full rollback on late collision or byte mismatch.

Independent allowlists:

```text
EVAVO_ART_WORKSPACE_INGEST_ROOTS
EVAVO_ART_WORKSPACE_INGEST_SOURCE_ROOTS
```

Write gate:

```text
EVAVO_ART_WORKSPACE_INGEST_MCP_ALLOW_WRITE=true
```

### `evavo-project-art-workspace-catalog`

Entrypoint:

```text
tools/project_art_workspace_catalog_mcp.mjs
```

It provides create-only content-addressed inventories, exact SHA-256 and byte-length identity, image dimensions/alpha/animation metadata, duplicate groups, bounded queries and missing/changed/unexpected drift verification.

Write gate:

```text
EVAVO_PERSISTENT_CATALOG_MCP_ALLOW_WRITE=true
```

Catalog roots:

```text
EVAVO_PERSISTENT_CATALOG_ROOTS
```

A catalog is technical evidence, not creative approval.

### `evavo-project-art-workspace-jobs`

Entrypoint:

```text
tools/project_art_workspace_jobs_mcp.mjs
```

It provides:

- create-only job plans with exact source fingerprints;
- validated acyclic step dependencies;
- append-only, self-hashed and hash-chained checkpoint events;
- short-lived agent claims with stale-lease recovery;
- exact next-step inspection after interruption;
- retryable failed steps with attempt counts;
- exact succeeded-output evidence;
- drift blocking when completed evidence changes;
- pause, resume and cancellation checkpoints without mutable state files.

Canonical tools:

```text
evavo_art_workspace_job_capabilities
evavo_art_compile_workspace_job
evavo_art_create_workspace_job
evavo_art_inspect_workspace_job
evavo_art_checkpoint_workspace_job
```

Write gate:

```text
EVAVO_ART_WORKSPACE_JOBS_MCP_ALLOW_WRITE=true
```

Job roots:

```text
EVAVO_ART_WORKSPACE_JOB_ROOTS
```

The job server does not execute providers or arbitrary shell commands. The actual step is still performed by an existing governed Art Studio tool. The job layer only proves that the step is ready and records exact evidence afterward.

### `evavo-project-art-avatar-final-pass-provider`

Entrypoint:

```text
tools/project_art_avatar_final_pass_provider_mcp.mjs
```

Canonical tools:

```text
evavo_art_avatar_final_pass_provider_capabilities
evavo_art_compile_avatar_final_pass_provider_batch
```

This server consumes a sealed avatar final-pass plan and an explicit selection request. It compiles only:

```text
provider-redraw
provider-generated in-between
```

A redraw requires an exact `canonical-identity` and `base-image`. A generated in-between requires an exact `canonical-identity`, `previous-key-pose` and `next-key-pose`. Every reference is bound to its admitted artifact ID, immutable source path and SHA-256. A job also requires named-human `run-provider-once` authorization.

An in-between remains blocked until the identity, previous key pose and next key pose have final reviewed SHA-256 identities. This prevents an unfinished hand, anatomy or identity correction from propagating into later animation frames.

Every ready envelope remains:

```text
candidateCount = 1
fallback = false
output = transparent PNG
providerExecution = false
candidateApproval = false
candidatePromotion = false
```

Write gate:

```text
EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_MCP_ALLOW_WRITE=true
```

Provider-plan roots:

```text
EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ROOTS
```

The write gate permits only private create-only JSON batch publication inside configured roots. It does not invoke a provider or write candidate image bytes.

## Safe deployment defaults

The canonical example keeps all five write gates set to `false`. Enable only the server needed for the current operation and only on the trusted local workstation.

Workspace roots control where plans, evidence, catalogs, job journals and persistent workspaces may be read or written. The ingest source-root list separately controls which external files may be read. The avatar final-pass provider roots separately control where sealed plans, explicit authorization records and provider batches may be read or created. Keep these allowlists explicit rather than granting broad drive access.

Image bytes remain in local files. MCP carries bounded paths, hashes, dimensions, identifiers, plans, duplicate evidence, drift summaries, job state and receipts; it does not transport image payloads through the language-model context.

## EVAVO Storage

`evavo_art_prepare_storage_handoff` creates an exact self-hashed request for selected workspace files. It does not perform the Storage write.

The actual EVAVO Storage ingest remains a separate authority that independently verifies path, byte length, SHA-256, logical destination and provenance. A successful workspace operation, catalog publication, job checkpoint or provider-request compilation is not Storage admission.

## Creative and publication authority

Technical image processing, catalog verification, job completion and provider-request compilation do not grant creative approval. Ingest does not make an image final, a catalog does not decide which duplicate is correct, a job success event only records technical evidence for the declared step, and a provider envelope does not approve or promote its future candidate.

The suite performs no automatic:

```text
provider execution
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
