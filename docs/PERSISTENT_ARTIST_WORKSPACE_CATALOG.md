# Persistent Artist Workspace catalog

The workspace catalog gives ChatGPT, Claude and trusted EVAVO agents a bounded, exact and queryable view of a persistent Artist Workspace before they edit, regenerate, organise, master or publish anything.

It closes the discovery gap between workspace file operations and art decisions. Agents no longer need to guess which originals, working copies, masks, review images, versions, masters or exports exist. They can build one content-addressed inventory, query it without moving image bytes through MCP, and verify later whether the workspace still matches that inventory.

## What a catalog records

Each catalog entry includes:

- canonical workspace-relative path;
- fixed workspace area;
- file kind and extension;
- media type;
- exact byte length;
- exact SHA-256;
- image format, dimensions, alpha and animation flags when the header can be inspected safely.

The catalog also records:

- totals by workspace area, kind and media type;
- aggregate catalogued bytes;
- image and animated-image counts;
- exact duplicate groups based on SHA-256;
- the exact workspace manifest identity;
- the exact compile request and plan identities;
- the bounded scan policy used to build the result.

Prior published catalogs are excluded from later catalog scans, preventing a catalog from recursively inventorying its own evidence.

## Why agents need it

A normal agent workflow can now be:

1. Ingest attached, generated, provider or local files into immutable `sources/` and editable `working/` paths.
2. Build a create-only workspace catalog.
3. Query exact images by area, kind, extension, media type, dimensions, alpha, animation state, path, SHA-256 or duplicate status.
4. Inspect the relevant files through the existing image-preview or review boundary.
5. Compile deterministic edits, masks, composites, mastering tasks, sprite sheets, atlases or motion sequences.
6. Save important candidates as append-only versions.
7. Verify the original catalog or publish a new catalog to detect changed, missing or unexpected files.
8. Prepare exact EVAVO Storage or repository-publication handoffs through their independently authorised boundaries.

The catalog does not approve art and does not infer that a technically valid image is creatively correct.

## Workspace areas

A request may catalogue any non-empty subset of:

```text
sources
working
versions
masks
scratch
review
masters
exports
manifests
journals
```

The fixed hard limits are:

```text
50,000 files
2 GiB per file
64 GiB aggregate catalogued bytes
1,000 returned query entries
1,000 recorded examples per drift category
```

Requests may choose lower limits but cannot raise those policy ceilings.

## Request

```json
{
  "schema": "evavo.persistent-artist-workspace-catalog-request.v1",
  "catalogId": "human-king-production-v1",
  "title": "Human King production inventory",
  "note": "Inventory before final alpha cleanup and atlas preparation.",
  "tags": ["chess-lord", "human-king", "pre-master"],
  "includeAreas": [
    "sources",
    "working",
    "versions",
    "masks",
    "review",
    "masters",
    "exports",
    "manifests"
  ],
  "limits": {
    "maximumFiles": 10000,
    "maximumFileBytes": 2147483648,
    "maximumAggregateBytes": 68719476736
  }
}
```

## CLI

Compile a content-addressed plan:

```powershell
node scripts/persistent-artist-workspace-catalog.mjs compile `
  --workspace-root C:\EVAVO\ArtWorkspaces\chess-lord-human-king-v1 `
  --request C:\EVAVO\Requests\human-king-catalog.json `
  --output C:\EVAVO\Requests\human-king-catalog.plan.json
```

Revalidate and publish the exact catalog atomically:

```powershell
node scripts/persistent-artist-workspace-catalog.mjs run `
  --plan C:\EVAVO\Requests\human-king-catalog.plan.json
```

The output is create-only:

```text
manifests/catalogs/<catalog-id>/catalog.json
manifests/catalogs/<catalog-id>/receipt.json
```

Query a published catalog:

```powershell
node scripts/persistent-artist-workspace-catalog.mjs query `
  --workspace-root C:\EVAVO\ArtWorkspaces\chess-lord-human-king-v1 `
  --catalog-id human-king-production-v1 `
  --query C:\EVAVO\Requests\transparent-working-images.query.json
```

Example query:

```json
{
  "area": "working",
  "kind": "image",
  "hasAlpha": true,
  "minWidth": 64,
  "maxWidth": 512,
  "pathContains": "idle",
  "limit": 200
}
```

Verify drift:

```powershell
node scripts/persistent-artist-workspace-catalog.mjs verify `
  --workspace-root C:\EVAVO\ArtWorkspaces\chess-lord-human-king-v1 `
  --catalog-id human-king-production-v1
```

Verification reports bounded samples and full counts for:

```text
missing files
changed identities or image metadata
unexpected files
changed summary or duplicate evidence
```

## Callable MCP tools

The path-only MCP exposes:

```text
evavo_art_workspace_catalog_capabilities
evavo_art_compile_workspace_catalog
evavo_art_run_workspace_catalog
evavo_art_query_workspace_catalog
evavo_art_verify_workspace_catalog
```

Catalog query and verification are read-only. Plan and catalog publication require:

```text
EVAVO_PERSISTENT_CATALOG_MCP_ALLOW_WRITE=true
```

All paths must remain under roots configured in:

```text
EVAVO_PERSISTENT_CATALOG_ROOTS
```

Image bytes do not pass through MCP. Results contain bounded metadata, paths, hashes, dimensions, duplicate evidence and drift summaries.

## Filesystem and integrity protections

The scanner:

- opens files without following symbolic links where supported;
- rejects symbolic files and symbolic directory components;
- rejects hard-linked or otherwise multiply linked files;
- rejects special filesystem entries;
- rechecks device, inode, mode, link count, byte length and modification identities around hashing;
- confirms every resolved file remains under the workspace root;
- hashes with SHA-256 under explicit per-file and aggregate limits;
- inspects only a bounded image header;
- re-scans the complete workspace immediately before publication;
- refuses publication if any path, byte identity, image header, duplicate group or summary changed;
- writes into a private sibling staging directory;
- verifies the staged documents;
- exposes the catalog through one create-only atomic directory rename;
- removes staging data after a failed publication.

## Authority boundary

The catalog boundary may read workspace files and, only when explicitly enabled, create a catalog under `manifests/catalogs/`.

It cannot:

- modify or delete source or working art;
- call an image provider;
- approve or promote a candidate;
- write EVAVO Storage;
- mutate a target repository;
- commit or push Git;
- deploy or publish;
- force push;
- send image bytes through MCP.

## Validation

```bash
node scripts/check-persistent-artist-workspace-catalog.mjs
```

The permanent suite covers exact catalogue publication, duplicate discovery, image querying, current and drifted verification, tampered policy limits, source drift between compile and run, symbolic-link attacks, hard-link attacks, create-only output and path-only MCP authority.
