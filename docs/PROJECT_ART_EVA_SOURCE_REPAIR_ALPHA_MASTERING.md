# Project Art EVA source-repair alpha mastering

The five EVA redraws are intentionally produced as fully opaque RGBA source-space candidates. The opaque source background is preserved during the provider edit so exact protected-pixel invariance can be proved without confusing source repair with transparency extraction.

Alpha mastering is therefore a separate deterministic and evidenced transaction. A source-space candidate is not production-alpha-ready merely because it is an RGBA PNG.

## Inputs

One mastering operation requires:

- the exact post-provider source-space candidate assurance;
- the provider candidate materialization receipt and finisher request;
- the exact opaque source-space candidate PNG;
- one named-human-admitted alpha matte PNG;
- an exact alpha matte SHA-256;
- one create-only `*.alpha-mastered.png` target path;
- a named-human `apply-production-alpha-once` authorization bound to the frame, candidate-assurance hash and matte hash.

The candidate assurance must already prove the exact source-space repair boundary:

```text
changedProtectedPixels: 0
sourceSpaceAssurancePassed: true
protectedPixelInvariancePassed: true
alphaMasteringRequired: true
productionAlphaReady: false
```

## Canonical matte

The matte is an exact `1024 × 1536`, non-interlaced, 8-bit RGBA PNG.

Its pixel semantics are intentionally unambiguous:

```text
alpha 0:   RGB must be 0,0,0
alpha > 0: RGB must be 255,255,255
```

The alpha channel may contain partial coverage for anti-aliased edges. The matte must contain both visible and transparent pixels, remain within bounded foreground coverage, and contain no visible pixels on the canvas edge. Hidden RGB, grey matte pixels, APNG chunks, malformed CRCs, unsupported critical chunks, dimension drift and trailing data fail closed.

## Pixel transaction

For every visible matte pixel, the mastered output preserves the candidate RGB byte-for-byte and replaces only alpha with the admitted matte alpha. For every fully transparent matte pixel, output RGBA becomes `0,0,0,0`.

The report independently retains:

- source-space candidate SHA-256 and decoded RGBA SHA-256;
- alpha matte SHA-256, alpha-plane SHA-256, coverage and bounds;
- mastered PNG SHA-256;
- visible RGB evidence;
- changed-alpha count;
- zero visible RGB mismatches;
- zero hidden RGB below alpha zero;
- zero visible canvas-edge pixels;
- exact canvas and registration preservation.

The operation then emits a standard candidate materialization receipt and finisher request for the alpha-mastered PNG. Those documents remain unapproved and are compatible with the existing frame finisher and named-human review chain.

## CLI

```powershell
node scripts/compile-project-art-eva-source-repair-alpha-mastering.mjs `
  --workspace-root C:\EVAVO\workspaces\eva-source-repairs `
  --frame-id eva-20260809-153620-frame-05 `
  --candidate-assurance C:\EVAVO\workspaces\eva-source-repairs\evidence\frame-05.candidate-assurance.json `
  --provider-materialization C:\EVAVO\workspaces\eva-source-repairs\evidence\frame-05.materialization.json `
  --provider-finisher-request C:\EVAVO\workspaces\eva-source-repairs\evidence\frame-05.finisher-request.json `
  --candidate C:\EVAVO\workspaces\eva-source-repairs\evidence\frame-05.source-space.png `
  --candidate-path scratch/avatar-final-pass/eva-source-repair-v1/eva-20260809-153620-frame-05/candidate-01.png `
  --alpha-matte C:\EVAVO\workspaces\eva-source-repairs\evidence\frame-05.alpha-matte.png `
  --alpha-matte-path scratch/avatar-final-pass/eva-source-repair-v1/eva-20260809-153620-frame-05/alpha-matte.png `
  --alpha-matte-sha256 <exact-sha256> `
  --output scratch/avatar-final-pass/eva-source-repair-v1/eva-20260809-153620-frame-05/candidate-01.alpha-mastered.png `
  --actor-id eva-alpha-matte-reviewer `
  --authorization-evidence-sha256 <exact-sha256> `
  --mastered-at 2026-08-15T11:07:00.000Z
```

The operator writes a private create-only four-file bundle:

```text
*.alpha-mastered.png
*.alpha-mastering.json
*.alpha-mastering.materialization.json
*.alpha-mastering.finisher-request.json
```

The whole bundle is staged and linked transactionally. Existing or partially published outputs are rejected rather than overwritten.

## Authority boundary

Alpha mastering does not execute an image provider and does not grant creative approval. Candidate approval, candidate promotion, sequence admission, sequence release, repository mutation, Git mutation, deployment, publication, runtime activation and force push remain false.

The next required step is the existing frame finisher, followed by native-scale, contact-sheet, anatomy, identity, adjacent-frame and loop review. Technical alpha readiness is not creative approval.
