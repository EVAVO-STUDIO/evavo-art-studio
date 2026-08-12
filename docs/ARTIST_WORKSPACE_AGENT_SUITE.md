# Artist Workspace agent suite

This is the canonical local MCP deployment for ChatGPT, Claude and trusted EVAVO agents working with persistent project artwork.

Use:

```text
config/mcp.project-art-workspace.windows.example.json
```

That one configuration registers three deliberately separate path-only servers:

```text
evavo-project-art-workspace
evavo-project-art-workspace-ingest
evavo-project-art-workspace-catalog
```

The primary server owns project inspection, deterministic image operations, sprite and atlas work, persistent workspace creation, append-only snapshots and EVAVO Storage handoff preparation. The ingest server owns exact placement of mounted chat attachments, generated images and approved local files into an existing workspace. The catalog server gives agents a content-addressed, queryable view of what the workspace actually contains and whether it has drifted.

## End-to-end flow

```text
ChatGPT / Claude attachment or generated image
→ approved external source root
→ exact external-ingest plan
→ immutable original under sources/
→ editable working copy under working/
→ content-addressed workspace catalog
→ bounded discovery by area, path, media type, dimensions, alpha, animation or SHA-256
→ deterministic cleanup, mastering, compositing, sprites or animation work
→ append-only workspace snapshot
→ catalog verification or a new catalog showing exact drift
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

### `evavo-project-art-workspace-catalog`

Entrypoint:

```text
tools/project_art_workspace_catalog_mcp.mjs
```

Core capabilities include:

- create-only, content-addressed workspace inventories;
- exact SHA-256, byte length, area, media type and file-kind discovery;
- bounded image-header metadata including dimensions, alpha and animation state;
- exact duplicate groups without moving image bytes through MCP;
- bounded catalog queries by path, extension, area, dimensions, alpha, animation or digest;
- verification of missing, changed and unexpected files after edits or agent sessions.

Read-only query and verification tools are always safe within the configured roots. Catalog compilation and publication require:

```text
EVAVO_PERSISTENT_CATALOG_MCP_ALLOW_WRITE=true
```

Catalog paths are confined by:

```text
EVAVO_PERSISTENT_CATALOG_ROOTS
```

A catalog is technical evidence, not creative approval. Prior catalog evidence is excluded from later scans so inventories do not recursively catalogue themselves.

## Safe deployment defaults

The canonical example keeps all three write gates set to `false`. Enable only the server needed for the current operation and only on the trusted local workstation.

Workspace roots control where plans, evidence and persistent workspaces may be read or written. The ingest source-root list separately controls which external files may be read. Keep those allowlists explicit rather than granting broad drive access.

Image bytes remain in local files. MCP carries bounded paths, hashes, dimensions, identifiers, plans, duplicate evidence, drift summaries and receipts; it does not transport image payloads through the language-model context.

## EVAVO Storage

`evavo_art_prepare_storage_handoff` creates an exact self-hashed request for selected workspace files. It does not perform the Storage write.

The actual EVAVO Storage ingest remains a separate authority that independently verifies path, byte length, SHA-256, logical destination and provenance. A successful workspace operation or catalog publication is not Storage admission.

## Creative and publication authority

Technical image processing and catalog verification do not grant creative approval. Ingest does not make an image final, a catalog does not decide which duplicate is correct, and a successful mastering check does not promote a candidate.

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
