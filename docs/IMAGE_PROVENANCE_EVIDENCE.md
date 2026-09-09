# Image Provenance Evidence

Art Studio treats provenance as **evidence about exact bytes**, not as a visual guess about who or what made an image.

## Preferred agent surface

Run the image workflow through `evavo-image-workflow-router-v2`. When origin or lineage matters, the `ai-artifact-assessment` route should call `evavo-image-provenance` in addition to artifact triage and human semantic review.

The provenance MCP is read-only:

- `evavo_image_provenance_capabilities`
- `evavo_review_image_provenance`

Configure readable roots with `EVAVO_IMAGE_PROVENANCE_ALLOWED_ROOTS`.

## Evidence packet

`createImageProvenancePacket` returns one of four packet states:

- `verified` — at least one supplied record is bound to the exact local SHA-256 and no invalid/contradictory evidence is present.
- `unverified` — evidence exists but its binding/authentication is not sufficient.
- `absent` — no provenance evidence was supplied.
- `invalid` — an evidence hash conflicts with the actual bytes, verification was reported invalid, the record is malformed, or verified origin claims directly conflict.

Supported evidence families:

1. `source-binding` — local exact SHA-256 lineage such as an immutable source, review candidate or derivative relationship.
2. `generation-receipt` — a provider/generation record whose verifier result is supplied separately.
3. `content-credential` — a C2PA/Content Credentials verification result or equivalent signed-content record whose verifier result is supplied separately.
4. `evavo-record` — existing EVAVO lineage structures. The packet currently reuses `evavo.image-provenance-record.v1`, Enhancement Studio review manifests and transparent-master receipts.

## Trust boundary

Art Studio itself verifies the **local SHA-256 binding**. The provenance MCP does **not** currently perform C2PA/provider cryptographic signature verification. A record may be marked externally verified only when the caller supplies a verifier identity and verification-record ID from a separate trusted verifier. The packet records that verification as delegated evidence and explicitly reports that Art Studio did not perform it.

Do not add an `externallyAuthenticated=true` style shortcut to the MCP. A boolean supplied by an agent is not authentication.

A verified content credential can authenticate a signed manifest and its recorded claims, but it should not be restated as proof that every real-world assertion inside that manifest is true.

## AI-origin policy

Pixel-level artifact signals, repeated-detail heuristics, anatomy mistakes, malformed text or style drift are **not provenance**. They may justify visual review but they cannot reliably establish AI or human authorship.

The provenance packet therefore keeps:

- `originAssessment.aiGenerated = "not-determined"`
- `originAssessment.humanAuthored = "not-determined"`
- `pixelHeuristicsUsedForOrigin = false`

When an authenticated external record reports an origin category, Art Studio can surface it as a **verified reported origin claim** while still keeping its own authorship conclusion separate.

## Recommended finishing flow

1. Review technical/artifact quality.
2. Review approved-reference or sequence consistency when relevant.
3. Review provenance if lineage/origin matters.
4. Repair through the bounded deterministic, masked or provider routes.
5. Re-run finishing review on the actual output.
6. Run delivery preflight.
7. Run finalization admission.
8. Promote only through the existing explicit approval gate.

Provenance evidence never grants creative approval, publication authority or permission to overwrite a canonical source.
