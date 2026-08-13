# HEAVY METAL FIGHTING provider candidate admission

This boundary turns one already-authorized, already-executed provider result into one governed scratch candidate and one hash-linked `candidates-admitted` receipt.

It does **not** execute a provider. It does **not** run QA, review, selection, mastering, approval, promotion, delivery, Git, deployment or publication.

## Position in the production chain

```text
immutable work order
  -> human generation authorization
  -> provider execution envelope
  -> human provider-submission authorization
  -> provider runtime dispatch
  -> generic provider runtime result
  -> candidate admission plan
  -> explicit candidate materialization + candidates-admitted receipt
  -> deterministic QA (separate boundary)
```

The admission operator accepts only a successful `candidate-admission-ready` runtime outcome. Provider failures remain separate failure records and cannot fabricate a candidate or advance the production receipt state.

## Required evidence

One admission requires all of the following to agree exactly:

- the self-hashed HMF runtime dispatch;
- the self-hashed generic-provider runtime binding;
- the self-hashed successful runtime outcome;
- the current receipt chain ending at `generation-authorized` for the same attempt;
- one immutable provider candidate artifact;
- one immutable provider evidence artifact linked to that candidate;
- the exact work-order candidate and receipt paths;
- one explicit write-enabled operator call.

The artifact store is revalidated directly from its content-addressed descriptor and object layout. Artifact IDs, descriptor digests, content SHA-256, byte sizes, canonical storage paths, provider labels and provider evidence must all match.

## PNG structural admission

Candidate admission performs only the minimum structural checks needed before writing bytes:

- PNG signature and chunk boundaries;
- valid CRC for every chunk;
- one IHDR, one or more IDAT chunks and one terminal IEND;
- exact 160 by 160 native dimensions;
- non-interlaced 8-bit RGBA storage;
- safely bounded IDAT inflation;
- at least one transparent pixel and one visible pixel.

This is **not** deterministic art QA. Pixel clustering, palette, pivot, silhouette, continuity, hostile-matte checks and animation quality remain blocked until the next governed QA boundary.

## Receipt actor mapping

The runtime outcome identifies its source actor class as `runtime`. The existing HMF receipt protocol intentionally retains the canonical actor classes `system`, `agent` and `human`.

Candidate admission therefore records:

```text
source runtime class: runtime
canonical receipt actorClass: agent
actorId: explicit runtime-scoped identifier
```

This preserves receipt compatibility without pretending that the automated admission was human.

## Read-only planning

```powershell
node scripts/heavy-metal-fighting/frame-body-provider-candidate-admission-cli.mjs plan `
  --dispatch-json .\dispatch.json `
  --runtime-binding-json .\runtime-binding.json `
  --runtime-outcome-json .\runtime-outcome.json `
  --receipts-json .\receipts.json `
  --artifact-store-root C:\ArtStudio\artifacts `
  --actor-id provider-runtime:primary `
  --occurred-at 2026-08-13T06:04:00.000Z
```

`plan` reads and validates evidence but does not mutate the workspace.

## Explicit materialization

```powershell
node scripts/heavy-metal-fighting/frame-body-provider-candidate-admission-cli.mjs admit `
  --write `
  --dispatch-json .\dispatch.json `
  --runtime-binding-json .\runtime-binding.json `
  --runtime-outcome-json .\runtime-outcome.json `
  --receipts-json .\receipts.json `
  --artifact-store-root C:\ArtStudio\artifacts `
  --workspace-root C:\ArtStudio\workspaces\heavy-metal-fighting `
  --actor-id provider-runtime:primary `
  --occurred-at 2026-08-13T06:04:00.000Z
```

Both `admit` and the separate `--write` switch are required. The workspace root and artifact-store root are runtime inputs and are never hardcoded.

## Write ordering and replay

The operator uses this order:

1. validate every immutable input;
2. create or byte-verify the exact candidate scratch file;
3. create or byte-verify the receipt bundle;
4. reread and hash-verify both files;
5. return a self-hashed admission result.

Files are create-only. A replay reuses an identical candidate and identical receipt bundle. Existing different bytes, symlink traversal, path traversal, stale receipts, another attempt, another unit, another provider request, malformed evidence or a different PNG all fail closed.

The candidate is written beneath:

```text
scratch/provider/<batch>/<unit>/...-cand-01.png
```

The receipt bundle is written at the immutable work-order path beneath:

```text
manifests/receipts/<batch>/<unit>.json
```

The new receipt carries:

```text
state: candidates-admitted
candidateSha256: exact candidate content SHA-256
evidenceSha256: exact runtime outcome SHA-256
previousReceiptSha256: generation-authorized head
```

A successful admission makes the next legal action `run-deterministic-qa`. It grants no authority to perform that action automatically.

## Verification

```powershell
node scripts/heavy-metal-fighting/frame-body-provider-candidate-admission-cli.mjs verify
```

The executable tests cover read-only planning, exact content-addressed artifact validation, native RGBA PNG parsing, write gating, candidate-first ordering, receipt progression, idempotent replay, provider-failure rejection, wrong-dimension rejection and conflicting pre-existing bytes.
