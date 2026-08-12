# Artist Workspace agent suite

This is the canonical local MCP deployment for ChatGPT, Claude and trusted EVAVO agents working with persistent project artwork.

Use:

```text
config/mcp.project-art-workspace.windows.example.json
```

That one configuration now registers two deliberately separate path-only servers:

```text
evavo-project-art-workspace
evavo-project-art-workspace-ingest
```

The first server owns project inspection, deterministic image operations, sprite and atlas work, persistent workspace creation, append-only snapshots and EVAVO Storage handoff preparation. The second server owns exact ingestion of mounted chat attachments, generated images and approved local files into an existing persistent workspace.

## End-to-end flow

```text
ChatGPT / Claude attachment or generated image
→ approved external source root
→ exact external-ingest plan
→ immutable original under sources/
→ editable working copy under working/
→ deterministic cleanup, mastering, compositing, sprites or animation work
→ append-only workspace snapshot
→ visual review and explicit creative decision
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

Core capabilities include:

- project and repository art intelligence;
- deterministic image and sprite sandbox plans;
- cleanup, transparency repair, compositing and mastering;
- reference-derived matching-image and matching-frame planning;
- temporary intake and variable-size sprite atlases;
- persistent workspace creation;
- append-only workspace snapshots;
- exact EVAVO Storage handoff preparation.

Write operations require the independent local gate:

```text
EVAVO_ART_WORKSPACE_MCP_ALLOW_WRITE=true
```

### `evavo-project-art-workspace-ingest`

Entrypoint:

```text
tools/project_art_workspace_ingest_mcp.mjs
```

Core capabilities include:

- read-only capability inspection;
- exact external-source and destination-plan compilation;
- atomic ingest into an existing persistent workspace;
- immutable source-copy and editable working-copy creation;
- exact provenance, receipt and commit-marker publication;
- complete rollback if any late target collision or byte mismatch occurs.

It requires independent workspace and source allowlists:

```text
EVAVO_ART_WORKSPACE_INGEST_ROOTS
EVAVO_ART_WORKSPACE_INGEST_SOURCE_ROOTS
```

Write operations require a separate local gate:

```text
EVAVO_ART_WORKSPACE_INGEST_MCP_ALLOW_WRITE=true
```

## Safe deployment defaults

The canonical example keeps both write gates set to `false`. Enable only the server needed for the current operation and only on the trusted local workstation.

The workspace root list controls where plans, evidence and persistent workspaces may be read or written. The ingest source-root list separately controls which external files may be read. Keep those allowlists explicit rather than granting broad drive access.

Image bytes remain in local files. MCP carries bounded paths, hashes, identifiers and receipts; it does not transport the image payload through the language-model context.

## EVAVO Storage

`evavo_art_prepare_storage_handoff` creates an exact self-hashed request for selected workspace files. It does not perform the Storage write.

The actual EVAVO Storage ingest remains a separate authority that independently verifies path, byte length, SHA-256, logical destination and provenance. A successful workspace operation is not Storage admission.

## Creative and publication authority

Technical image processing does not grant creative approval. Ingest does not make an image final, and a successful mastering check does not promote a candidate.

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
force push
```

Those actions retain separate authority, evidence and confirmation boundaries.
