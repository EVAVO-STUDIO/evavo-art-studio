# Avatar Frame Catalogue

The avatar frame catalogue extends the existing RAW_ART folder workbench for large banks of already-created avatar images. It is intentionally an organisation, review and planning surface. It does not generate or edit imagery.

## Why this exists

Repositories such as `EVAVO-STUDIO/evavo-avatar-runtime` can contain dozens or hundreds of generated frame images whose filenames preserve batch order but not trustworthy animation meaning. Numeric suffixes are useful for review ordering only. They must never silently become `idle`, `talk`, `laugh`, `stern`, `sleep`, `wave` or another semantic animation state.

The catalogue therefore separates two stages:

1. **Non-semantic review packets**: scan exact existing bytes, retain SHA-256, byte size, format, dimensions, alpha metadata and filename sequence hints, then divide candidates into bounded review packets. Every packet states that its order is non-authoritative and its semantic label is null.
2. **Explicit sequence plans**: an owner-reviewed decisions document names each animation and supplies the exact ordered frame path, expected SHA-256 and hold count. Only this explicit mapping can produce deterministic destination names and downstream Storage/repository targets.

## CLI

The existing workbench now supports:

```text
node scripts/raw-art-folder-workbench.mjs avatar-review \
  --raw-art-root <existing-image-root> \
  --character-id eva-female \
  --packet-size 10 \
  --output <review-packets.json>

node scripts/raw-art-folder-workbench.mjs avatar-plan \
  --inventory <raw-art-inventory.json> \
  --decisions <avatar-sequence-decisions.json> \
  --output <avatar-sequence-plan.json>

node scripts/raw-art-folder-workbench.mjs avatar-verify-plan \
  --plan <avatar-sequence-plan.json>
```

`avatar-review` may point at a checked-out existing root such as `evavo-avatar-runtime/assets/eva-female`. It reads only. The output is create-only evidence.

## Decisions contract

The decisions schema is `evavo.avatar-frame-sequence-decisions.v1`.

Each sequence declares:

- a stable `sequenceId`;
- `loop`, `once` or `ping-pong` playback;
- 1 to 60 FPS;
- whether variable canvas sizes are explicitly allowed;
- whether duplicate image bytes are explicitly allowed;
- ordered frames containing `relativePath`, exact `expectedSha256` and integer `hold` ticks.

Repeated paths are rejected. Use `hold` rather than duplicating one source frame. Canvas drift and mixed formats fail closed unless the narrow declared exception applies.

The plan derives canonical targets such as:

```text
characters/eva-female/sequences/idle/frame-0001.png
```

Optional `storageLogicalPathPrefix` and `repositoryTargetPrefix` fields create deterministic downstream target metadata without performing any Storage, repository or Git operation.

## Agent MCP

Run:

```text
EVAVO_AVATAR_FRAME_ALLOWED_ROOTS=<allowed roots> node tools/avatar_frame_catalogue_mcp.mjs
```

The MCP server exposes read-only tools for capabilities, review packets, sequence-plan compilation and plan verification. Image bytes never flow through MCP. Credentials are never forwarded.

## Authority boundary

Both review and sequence plan documents keep all of these authorities false:

- creative approval;
- provider execution;
- source mutation or deletion;
- Storage write;
- repository mutation;
- Git commit or push;
- force push;
- publication;
- deployment;
- runtime activation.

The plan may describe deterministic Storage and repository destinations, but a separate governed Storage/repository transaction must perform those effects. Normal non-force publication is the only publication mode described downstream.

## EVA production use

For the current EVA bank, first scan `assets/eva-female`, inspect the ten-frame review packets, then write explicit reviewed sequence decisions for the batches that actually belong to idle, blink, talk transitions, talk variants, wave, sleep and other accepted states. Do not derive those meanings from timestamps or numeric filename suffixes. Creative review remains required before an Art Studio avatar sequence bundle or Avatar Runtime release can be promoted.
