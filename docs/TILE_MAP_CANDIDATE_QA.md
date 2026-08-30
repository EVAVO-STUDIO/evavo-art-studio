# Tile Map candidate QA

Tile Map candidate QA is a deterministic technical gate between provider-result intake and explicit Art Studio review finalization.

It may reject technically invalid or unusable candidates. It may never grant structural approval, visual approval, creative approval, promotion or publication authority.

## Run the QA gate

After `tile-map-candidate-review` has admitted exact authorized provider results:

```powershell
pnpm art -- tile-map-candidate-qa `
  --package C:\ArtEvidence\run\02-source-package.json `
  --review C:\ArtEvidence\run\08-candidate-review.json `
  --output C:\ArtEvidence\run\09-candidate-qa.json
```

An optional policy can override bounded profile defaults:

```powershell
pnpm art -- tile-map-candidate-qa `
  --package C:\ArtEvidence\run\02-source-package.json `
  --review C:\ArtEvidence\run\08-candidate-review.json `
  --policy C:\GitRepos\evavo-art-studio\config\tile-map-candidate-qa-policy.example.json `
  --output C:\ArtEvidence\run\09-candidate-qa.json
```

Windows wrapper:

```powershell
.\scripts\Invoke-TileMapCandidateQA.ps1 `
  -SourcePackage C:\ArtEvidence\run\02-source-package.json `
  -Review C:\ArtEvidence\run\08-candidate-review.json `
  -Output C:\ArtEvidence\run\09-candidate-qa.json
```

A blocked report is still written as evidence and the command exits with code `2`.

## Evidence re-verification

Before inspecting pixels, the compiler re-verifies:

- exact source-package and semantic-map fingerprints;
- exact candidate-review fingerprint;
- authorized provider-batch and execution identities;
- the retained `provider-results.json` bytes;
- the retained candidate root;
- every candidate path, SHA-256, byte count and decoded canvas;
- the provider-output authority boundary.

A candidate cannot be substituted after review intake without invalidating QA.

## Candidate metrics and gates

The report records per-candidate:

- visible, transparent and soft-alpha pixel counts and ratios;
- exact and quantized palette size;
- luminance range and standard deviation;
- isolated high-contrast pixel ratio;
- horizontal and vertical opposite-edge seam scores;
- edge occupancy;
- visible connected-component count;
- deterministic findings and technical-clearance state.

Blocking checks include:

- blank or nearly blank output;
- alpha-required art that is effectively opaque;
- excessive soft alpha in pixel-art profiles;
- extreme palette explosion;
- failed seamless-material borders;
- missing required topology edges;
- disconnected alpha silhouettes for network/edge families.

Warnings include unusually dense palettes, low native-scale contrast and isolated pixel noise. Warnings inform review but do not replace visual judgement.

## Family-level diversity

Exact duplicate bytes are already rejected at candidate-review intake. QA additionally compares decoded candidates within each visual family and clusters near-identical results.

A family fails when its effective visual variants are fewer than `required_approved_variants`, even when differently named files exist.

This prevents tiny or irrelevant pixel changes from satisfying a real variant requirement.

## Seamless material versus structural topology

Seam checks are applied only when the source package declares `continuous_material` or `seamless_edges`.

Examples that may require opposite-edge continuity:

- soil fill;
- sand fill;
- water surface fill;
- plaster or stone fill;
- other genuinely repeating materials.

Roads, rails, walls, cliffs, coasts, roofs and doors are not blindly made seamless. Their topology is checked using declared semantic edge signatures and, for transparent structural overlays, connected edge-touching silhouettes.

## Approval export with QA evidence

After human structural, visual and creative decisions have been finalized, use the QA-bound source export:

```powershell
pnpm art -- tile-map-qa-approved-sources `
  --package C:\ArtEvidence\run\02-source-package.json `
  --review C:\ArtEvidence\run\08-candidate-review.json `
  --qa C:\ArtEvidence\run\09-candidate-qa.json `
  --approval C:\ArtEvidence\run\10-review-finalized.json `
  --output C:\ArtEvidence\run\11-approved-sources.json
```

Windows wrapper:

```powershell
.\scripts\Export-TileMapQaApprovedSources.ps1 `
  -SourcePackage C:\ArtEvidence\run\02-source-package.json `
  -Review C:\ArtEvidence\run\08-candidate-review.json `
  -QaReport C:\ArtEvidence\run\09-candidate-qa.json `
  -ReviewFinalization C:\ArtEvidence\run\10-review-finalized.json `
  -Output C:\ArtEvidence\run\11-approved-sources.json
```

An all-three-gates-approved candidate is rejected from export when its candidate QA is blocking or its visual family does not meet effective-variant requirements.

The exported manifest retains:

- exact QA file SHA-256;
- QA fingerprint;
- pre-QA reviewed-approval fingerprint;
- provider execution and semantic-map provenance inherited from review;
- final manifest fingerprint covering the complete chain.

## Authority boundary

The QA report always declares:

```text
automated_technical_qa = true
structural_review_decision = false
visual_review_decision = false
creative_approval = false
provider_execution = false
candidate_promotion = false
```

A technically clear candidate is only eligible to be considered by a reviewer. It is not approved art.
