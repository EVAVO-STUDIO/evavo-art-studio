# Tile Map candidate visual proofs

Automated metrics are not a substitute for looking at the actual art. Art Studio therefore produces deterministic visual-review proof sheets from the exact candidate files admitted into review and measured by candidate QA.

## Command

```powershell
.\scripts\Render-TileMapCandidateProofs.ps1 `
  -Review C:\ArtEvidence\run\08-candidate-review.json `
  -QaReport C:\ArtEvidence\run\09-candidate-qa.json `
  -OutputRoot C:\ArtEvidence\run\10-candidate-proofs
```

Direct CLI:

```powershell
pnpm art -- tile-map-candidate-proof `
  --review C:\ArtEvidence\run\08-candidate-review.json `
  --qa C:\ArtEvidence\run\09-candidate-qa.json `
  --output C:\ArtEvidence\run\10-candidate-proofs
```

The output directory must be new or empty.

## What each proof contains

Each visual family receives one PNG contact sheet containing every candidate in deterministic candidate-ID order.

Every candidate is shown twice:

- nearest-neighbour magnification, up to 8×, for pixel/edge inspection;
- exact native-scale rendering, for real gameplay readability.

The proof uses a checkerboard backing so transparency and accidental opaque halos remain visible. A narrow neutral strip identifies whether automated technical QA marked the candidate clear or blocked; the receipt maps each cell to the candidate ID, source path and SHA-256.

No resampling other than nearest-neighbour enlargement is used. The source candidate bytes are never changed.

## Receipt

`candidate-proof.receipt.json` binds:

- exact candidate-review file SHA-256 and fingerprint;
- exact candidate-QA file SHA-256 and fingerprint;
- provider runtime batch and execution identities;
- semantic-map fingerprint;
- each proof PNG path, dimensions, SHA-256 and byte count;
- candidate placement coordinates for both native and magnified views;
- ordered aggregate proof digest;
- final receipt fingerprint.

The renderer reopens every candidate from the retained candidate root and rejects byte drift after review or QA.

## Authority

Candidate proofs are `review-proof-only` evidence. They explicitly do not perform:

```text
automated technical QA
structural review decision
visual review decision
creative approval
candidate promotion
```

A proof makes comparison easier. It does not choose the winner.
