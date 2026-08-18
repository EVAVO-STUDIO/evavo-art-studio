# Art Studio Creative Asset Publisher integration

Art Studio remains the creative authority. Creative Asset Publisher is installed at:

```text
tools/creative-asset-publisher/
```

The Git installation is a sealed, deterministic wrapper around the reviewed source runtime. `distribution.json`, every sequential runtime part and the extracted package inventory are SHA-256 verified by `run.mjs` on every launch. Run `node verify.mjs` and `node cli.mjs capabilities` from `tools/creative-asset-publisher`; the verified runtime is expanded outside Git below `%LOCALAPPDATA%\EVAVO\creative-asset-publisher`. Mutable state and handoff packages remain outside the Git worktree under `EVAVO_CREATIVE_ASSET_STATE_ROOT`.

It adds project context, exact human approval, Godot packaging and canonical downstream handoffs without weakening Art Studio’s existing workspace, transparency, review or Storage boundaries.

## Required Art Studio evidence

A publishable candidate should retain:

- immutable intake record;
- exact final candidate path, SHA-256 and byte count;
- exact preview hash used for approval;
- source and master lineage;
- transparency and hostile-background evidence where alpha is required;
- sprite/atlas and sequence evidence where applicable;
- project hint, role and identifying metadata;
- generated runtime files such as a Godot `.tres` as hash-bound supporting artifacts.

Art Studio must not grant repository or Storage mutation during creative operations.

## Agent sequence

```text
creative_asset_context_get
creative_asset_intake
<Art Studio finishing and review>
creative_asset_approve
creative_asset_godot_spriteframes   # when required
creative_asset_plan
creative_asset_publish
```

`creative_asset_publish` creates an immutable handoff. Repository plans emit `evavo.development-studio-creative-asset-publication-request.v1` for Development Studio. Storage plans emit the existing `evavo.storage-art-ingest-request.v1` contract.

Art Studio never commits, pushes, merges or mutates Git refs. It never claims Storage ingest from a staged-only receipt.
