# Tile Map candidate technical QA

Tile Map source art must pass a deterministic technical-admission stage before structural, visual and creative approval can export it to Sprite Studio.

This stage does not decide whether artwork is attractive. It rejects candidates that are technically incapable of satisfying the declared tile-family contract and surfaces measurable risks that require human review.

## Command

```powershell
pnpm art -- tile-map-candidate-technical-qa `
  --package C:\ArtEvidence\run\02-source-package.json `
  --review C:\ArtEvidence\run\08-candidate-review.json `
  --output C:\ArtEvidence\run\09-candidate-technical-qa.json
```

The command reopens the exact candidate files retained by the candidate-review manifest. It verifies the source-package, review, semantic-map, provider-batch and provider-execution fingerprints before analysing pixels.

## Blocking checks

The technical gate currently measures and blocks:

- empty or fully transparent candidates;
- changed candidate bytes after review intake;
- incorrect decoded canvas geometry;
- soft alpha beyond the declared pixel-exact profile threshold;
- profile palette-budget overflow;
- missing opposite-edge continuity for families explicitly declared as continuous and seamless;
- near-identical candidates that do not represent independent variants;
- alpha-boundary drift between variants that share a structural edge signature;
- families left with fewer technically admitted variants than their required approval count.

It also emits non-blocking warnings for low native-scale luminance separation, unusually high local pixel variation and alpha-required candidates that occupy the complete canvas. Those warnings exist to direct visual review; they are not automatic creative judgements.

## Seam policy

Seam checks run only when the source-package task explicitly declares both:

```json
{
  "continuous_material": true,
  "seamless_edges": true
}
```

Roads, rails, cliffs, walls, coastlines, roofs, doors and other structural families are not made seamless by default. Their boundary compatibility is governed by topology and edge-signature rules instead.

## Variant policy

Exact duplicate candidate bytes are already rejected during provider-result review intake. Technical QA additionally computes pixel similarity inside each visual family. A near-identical candidate is blocked from counting toward the required variant total, while sufficiently distinct candidates remain eligible.

This prevents a generated family from claiming multiple useful variants when the only difference is a negligible pixel change.

## Approval integration

The production export now requires the technical QA document:

```powershell
pnpm art -- tile-map-approved-sources `
  --package C:\ArtEvidence\run\02-source-package.json `
  --review C:\ArtEvidence\run\08-candidate-review.json `
  --technical-qa C:\ArtEvidence\run\09-candidate-technical-qa.json `
  --approval C:\ArtEvidence\run\10-review-finalized.json `
  --output C:\ArtEvidence\run\11-approved-sources.json
```

The export fails unless:

- technical QA has overall status `passed`;
- its self-fingerprint is valid;
- it binds the exact source-package and review bytes;
- its semantic-map and provider-execution provenance matches the review;
- every selected approved source is the same task/family/path/SHA candidate that received `technical_status: passed`.

The resulting Art Studio approved-source manifest uses schema version 2 and incorporates the technical-QA fingerprint into its final manifest fingerprint.

## Authority boundary

```text
provider success             -> no approval authority
technical QA passed          -> technical admission only
structural review approved   -> structural review only
visual review approved       -> visual review only
creative review approved     -> creative approval only
all required gates           -> eligible for Sprite Studio
```

Technical QA cannot promote art. Human review cannot override a blocked technical candidate by manually copying its path into an approval file.
