# Art workspace transfer orchestration

The Art Studio workspace writer can prepare exact path-only handoffs for both EVAVO Storage and the governed Git repository asset writer.

This layer does not replace image intake, editing, review, optimisation, sprite assembly or atlas generation. It connects the reviewed outputs of those stages to the correct durable destination without moving image bytes through Chat, Claude or MCP payloads.

## End-to-end route

```text
conversation attachment / generated artifact / local file / Storage restore
→ art_workspace_intake_files
→ exact immutable intake original + editable working copy
→ review, repair, optimise, organise, sequence and atlas tools
→ art_workspace_compile_transfer_bundle
→ create-only transfer manifests
├─ EVAVO Storage preflight and ingest
└─ governed repository asset writer compile and apply
→ Development Studio review and guarded mainline publication
```

## MCP server

Build the monorepo, then run:

```powershell
pnpm run build:domain
pnpm --filter @evavo/art-studio-mcp build
pnpm --filter @evavo/art-studio-mcp start:asset-transfer
```

Tools:

```text
art_workspace_transfer_capabilities
art_workspace_compile_transfer_bundle
art_workspace_write_transfer_bundle
```

The compile tool is read-only. The write tool creates only private `.art-studio/handoffs/<bundle>/` manifests and a receipt after re-verifying every source path, SHA-256 and byte count.

## Routes

Each asset chooses one route:

- `repository`: prepare an ordinary Git asset operation;
- `storage`: prepare an immutable EVAVO Storage ingest item;
- `both`: prepare both handoffs;
- `auto`: use ordinary Git when a repository target exists and the file remains inside Git limits, otherwise use EVAVO Storage.

Defaults:

```text
ordinary Git per-file limit: 25 MiB
ordinary Git batch limit: 250 MiB
```

An explicit repository route that exceeds either limit fails closed. It is never silently committed as a huge Git object. An automatic route can fall back to Storage when Storage destination data is present.

## Repository handoff

The generated request uses `evavo.repository-asset-write-request.v1` and contains:

- one exact repository head;
- a new `agent/*` or `automation/*` branch;
- exact source paths, SHA-256 and byte counts;
- target paths and optional target preimage SHA-256 values;
- all write, commit, push, merge, main-mutation, force-push and source-deletion authority set to false;
- `bytesFlowThroughMcp: false`;
- a canonical request self-hash.

Downstream execution remains:

```text
evavo_git_compile_asset_write
evavo_git_apply_asset_write
```

The repository asset writer may create and optionally push a new branch only after separate authority. It does not merge or write directly to `main`.

## Storage handoff

The generated request uses `evavo.storage-art-ingest-request.v1` and contains:

- exact workspace and allowed-root identity;
- exact source paths, hashes, byte counts, media types and provenance;
- immutable logical destinations;
- storage write authority set to false;
- no source deletion, repository mutation, physical purge or publication authority;
- `bytesFlowThroughMcp: false`;
- a canonical request self-hash.

Downstream execution remains:

```text
storage_verify_art_handoff
storage_ingest_art_handoff
```

Remote, unmounted or oversized source bytes use the EVAVO Storage resumable upload portal before being restored into an allowed Art Studio intake root.

## Naming and organisation

The transfer layer never guesses animation semantics. It expects reviewed working paths and explicit repository targets. Renaming, folder organisation, duplicate handling, reversible trash, frame repair, optimisation, sprite sheets, atlases and animation sequence decisions remain Art Studio workspace operations completed before transfer.

The original intake bytes and receipts remain available for rollback and provenance. Transfer manifests are create-only and cannot overwrite an earlier bundle.
