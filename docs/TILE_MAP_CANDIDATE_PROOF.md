# Tile Map candidate proof boards

Candidate proof boards are deterministic review evidence generated from the exact provider-result files admitted by candidate review and measured by technical QA.

They do not approve artwork. They make native-scale judgement and family comparison practical before structural, visual and creative decisions are recorded.

## Generate proof boards

```powershell
.\scripts\Render-TileMapCandidateProof.ps1 `
  -EvidenceRoot C:\ArtEvidence\epochbound-run-001
```

The workflow expects:

```text
02-source-package.json
08-candidate-review.json
09-candidate-technical-qa.json
```

and creates the new directory:

```text
09-candidate-proof\
  <visual-family>-<hash>.proof.png
  candidate-proof.manifest.json
```

The output root is create-only.

The equivalent package command is:

```powershell
pnpm --filter @evavo/art-studio-cli start:tile-map-proof -- `
  --package C:\ArtEvidence\epochbound-run-001\02-source-package.json `
  --review C:\ArtEvidence\epochbound-run-001\08-candidate-review.json `
  --technical-qa C:\ArtEvidence\epochbound-run-001\09-candidate-technical-qa.json `
  --output-root C:\ArtEvidence\epochbound-run-001\09-candidate-proof
```

## Board layout

Each visual family receives a separate board. Every candidate cell contains:

- a deterministic numeric index;
- a green `PASS` or red `BLOCK` technical-admission header;
- a nearest-neighbour fit preview on a checkerboard;
- a native-pixel centre crop on a checkerboard.

The fit view helps compare overall silhouettes and material treatment. The native crop exposes readability, pixel clusters, edge treatment and unwanted blur at actual source scale.

Candidate IDs, paths, hashes, technical issue codes and measured metrics remain in `candidate-proof.manifest.json`. Numeric board indices map directly to those records.

## Evidence binding

Before rendering, the proof compiler validates:

- source-package bytes and fingerprint;
- candidate-review bytes and fingerprint;
- technical-QA bytes and self-fingerprint;
- semantic-map fingerprint;
- candidate-root confinement;
- every candidate ID/task/family/path/SHA relationship;
- current candidate bytes and decoded dimensions.

Every board is hashed in the proof manifest. The manifest also records the exact source-package, review and technical-QA SHA-256 values and has its own canonical `proof_fingerprint`.

## Blocked candidates

A technical-QA report may retain blocked candidates for diagnosis. The proof renderer still produces their visual evidence and marks them `BLOCK`.

A blocked candidate cannot be promoted merely because it appears on a board. The later approved-source exporter independently requires the exact candidate to have `technical_status: passed` and to pass all three human review gates.

## Review expectations

At minimum, reviewers should inspect:

- native-scale readability;
- projection and pixel-grid consistency;
- edge or network continuity;
- variant usefulness rather than negligible differences;
- material hierarchy and palette consistency;
- accidental blur, halos, soft transparency or cropping;
- visible repetition or generic evenly distributed detail;
- whether the family looks authored for its game rather than generated in isolation;
- landmark silhouette and gameplay readability where applicable.

Technical metrics assist this review but do not replace creative judgement.

## Authority boundary

The manifest explicitly records:

```text
creative_approval_authority = false
promotion_authority = false
```

Proof rendering cannot call a provider, modify source candidates, write to a game repository, approve a candidate or package Sprite Studio output.
