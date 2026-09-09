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

## Automatic provider provenance

The public `@evavo/art-providers` execution boundary now emits `evavo.provider-provenance-bundle.v1` before returning a successful provider run. Callers continue to use `executeProviderCandidateRequest`; the raw orchestrator is an internal module and is not exported from the package root.

Every bundle binds:

- the existing provider execution evidence artifact;
- every immutable provider candidate artifact and its canonical `contentSha256`;
- every reference that actually reached the stored candidate, including semantic role and exact content hash;
- provider operation, adapter, model, request SHA-256 and compiled-prompt SHA-256;
- one `evavo.image-provenance-record.v1` per candidate;
- the canonical `parentSha256` only when exactly one admitted `base-image` exists.

For a direct provider generation, the record uses `generation-record`; provider edit/inpaint uses `transformation-receipt`. Production generative adapters can report `ai-generated` for generation and `machine-assisted` for edits/inpaints. The deterministic fixture adapter reports `unknown` so tests do not create a false AI-origin claim.

The provider wrapper validates each candidate record through `createImageProvenancePacket` before writing the bundle. A successful public provider call therefore cannot return before the candidate hash binding has been checked and the provenance evidence artifact has been stored.

Provider provenance is still **local lineage**, not external authentication. `providerOrContentCredentialSignatureVerifiedHere` and `providerReportedOriginIsExternallyAuthenticated` remain false. If provenance emission fails after candidate generation, the public wrapper fails closed and retains the created candidate/evidence artifact IDs in error details for recovery rather than silently returning an incompletely governed result.

Durable provider runtime contracts require `evidence.provenance` in addition to the ordinary provider/evidence capabilities.

## Trust boundary

Art Studio itself verifies the **local SHA-256 binding**. The provenance MCP does **not** currently perform C2PA/provider cryptographic signature verification. A record may be marked externally verified only when the caller supplies a verifier identity and verification-record ID from a separate trusted verifier. The packet records that verification as delegated evidence and explicitly reports that Art Studio did not perform it.

Do not add an `externallyAuthenticated=true` style shortcut to the MCP. A boolean supplied by an agent is not authentication. The older compatibility helper that accepts this input remains internal and must not be re-exported from `@evavo/art-media`.

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
4. Repair through the bounded deterministic, masked or provider routes. Provider candidates automatically acquire a provenance bundle at their public execution boundary.
5. Re-run finishing review on the actual output.
6. Run delivery preflight.
7. Run finalization admission.
8. Promote only through the existing explicit approval gate.

Provenance evidence never grants creative approval, publication authority or permission to overwrite a canonical source.