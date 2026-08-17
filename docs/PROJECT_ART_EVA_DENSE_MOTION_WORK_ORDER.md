# Project Art EVA dense-motion work order

## Purpose

This boundary turns the Runtime dense-motion admission contract into an exact,
auditable Art Studio work order. It does not claim that the missing art has been
mastered and it does not activate a new runtime.

The source family is `eva-20260809-153620`: ten canonical `1024x1536` PNG
frames bound by repository-relative path, Git blob SHA-1, source-tree SHA-1,
source-contract SHA-256, and Runtime source-family SHA-256.

Runtime `0.36.0` currently uses only ordinals `4`, `5`, and `6`. Their immutable
Cloudinary provenance remains authoritative. The work order contains jobs only
for ordinals `1`, `2`, `3`, `7`, `8`, `9`, and `10`.

## Production truth

The correct initial status is:

- expected source frames: `10`;
- active mastered frames: `3`;
- pending mastering jobs: `7`;
- required continuity transitions: `10`;
- release ready: `false`;
- activation ready: `false`; and
- minimum dense Runtime release: `0.37.0`.

No partial or mixed-family promotion is permitted. The three-frame production
rig stays active until one complete ten-frame Runtime admission receipt passes.

## Existing Art Studio boundaries reused

The work order reuses the existing production-safe components for:

- strict PNG inspection;
- avatar frame finishing;
- avatar sequence compilation; and
- final-to-first loop-closure review.

It deliberately does **not** pretend that the source-repair mask-assurance
contract can validate these seven unmasked dense frames. Dense candidate
assurance, dense alpha mastering, and Runtime receipt assembly remain explicit
adapters that must be implemented and verified against this work order.

This avoids a second, incompatible image pipeline while also avoiding an unsafe
reuse of a contract designed for hand-only masked repairs.

## Per-frame stages

Every pending ordinal receives the same ordered stage contract:

1. materialize the exact source read-only;
2. inspect canvas and source encoding;
3. compile dense-frame candidate assurance;
4. author and independently review an alpha matte;
5. master actual production RGBA alpha;
6. run the existing avatar frame finisher;
7. complete technical frame inspection;
8. record independent creative identity approval;
9. publish one immutable Cloudinary master; and
10. record the Runtime-compatible frame evidence.

Every stage begins blocked. A generated work order has no evidence values and
no implied approvals.

## Transparency and image-quality requirements

Each final master must prove:

- exact `1024x1536` PNG output;
- actual RGBA alpha, not a checkerboard image;
- RGB values zeroed beneath fully transparent pixels;
- no residual matte or background-removal halo;
- no visible pixels touching the canvas edge;
- no raw-source Runtime delivery;
- no mutable or overwritten cloud asset; and
- no substitution of another frame or source family.

Technical alpha readiness is not creative approval. Both are required and must
produce independent evidence.

## Deterministic Cloudinary destinations

The required public ID for ordinal `NN` is:

```text
evavo/avatar-runtime/eva-female/dense-motion/
eva-20260809-153620-frame-NN-master-v1
```

The delivery URL must include an immutable Cloudinary version segment:

```text
https://res.cloudinary.com/dntogqtey/image/upload/
v<version>/<public-id>.png
```

Every asset ID, public ID, master SHA-256, and evidence record must be unique
across the ten-frame family. Overwrite is forbidden.

## Runtime receipt mapping

Every frame must eventually provide the exact Runtime receipt fields:

- `alphaMasteringReceiptSha256`;
- `candidateAssuranceSha256`;
- `technicalInspectionSha256`;
- `creativeApprovalSha256`;
- `masteredAsset`;
- `alpha`; and
- `identity`.

The family then requires continuity, release, authority, and receipt-fingerprint
sections. Receipt assembly remains forbidden while any frame or family gate is
false.

## Continuity and loop closure

The work order defines all ten required transitions:

```text
1→2, 2→3, 3→4, 4→5, 5→6,
6→7, 7→8, 8→9, 9→10, 10→1
```

Each transition requires face-registration, pHash-continuity, and motion review.
Every face centre must remain within eight pixels of the ordinal-4 identity
anchor, and adjacent pHash Hamming distance must remain at or below six bits.
The final `10→1` transition is a mandatory loop-closure gate, not an optional
visual check.

## CLI

Create one deterministic, create-only work order with:

```powershell
node scripts/compile-project-art-eva-dense-motion-work-order.mjs `
  --work-order-id eva-dense-motion-153620-001 `
  --actor-id evavo-art-studio-agent `
  --created-at 2026-08-17T03:00:00.000Z `
  --output artifacts/eva-dense-motion/work-order.json
```

An alternate workspace root can be supplied with `--output-root`. The output
file is written create-only with restricted permissions. Re-running against the
same path fails rather than overwriting the first work order.

## Authority model

The work order does not grant authority for:

- source or image mutation;
- provider execution;
- candidate or creative approval;
- candidate promotion;
- asset overwrite or Cloudinary upload;
- sequence release;
- repository mutation, commit, or push;
- deployment or publication;
- Runtime activation; or
- force push.

Those operations remain separate, explicitly authorized steps. A valid work
order proves scope and requirements only.

## Next implementation boundary

The next Art Studio layer should consume one frame job at a time and produce a
dense-frame candidate-assurance document plus production alpha-mastering
receipt. It must reuse the existing PNG inspection and frame-finisher code,
write all artifacts create-only, and remain unable to publish or promote a
frame. Only after all seven jobs pass should sequence assembly, ten-edge
continuity review, browser playback, and Runtime `0.37.0` receipt assembly
begin.
