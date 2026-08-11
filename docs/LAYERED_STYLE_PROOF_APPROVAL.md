# Layered style-proof approval receipts

Layered runtime-source production must not expand from a visually unproven prompt. The existing layered-production plan already limits the initial run to a small style-proof set spanning multiple layers, an opaque base, and animation when animation exists. This receipt contract closes the remaining gap: production cannot be unlocked by placing an arbitrary 64-character string in the request.

## Why this exists

A style proof is useful only when the approval is tied to the exact evidence that was reviewed. The approval boundary must retain all of these identities together:

- the exact pending layered-production plan;
- its exact style fingerprint;
- the exact canonical proof-unit order;
- one source PNG artifact per proof unit;
- the exact compiled provider job used for each unit;
- the exact provider request receipt for each unit;
- one sealed per-unit review receipt and review bundle per unit;
- an explicit cross-unit review of camera, lighting, palette, pixel grammar, layer separation and anti-generic quality;
- a named human reviewer and UTC review time.

A receipt seals an already-made human decision. It does not inspect images and does not decide whether art is good.

## Approval request

Compile the pending layered plan first. Then supply:

```json
{
  "schemaVersion": "1.0",
  "kind": "evavo.layered-production.style-proof-approval.request",
  "planId": "jonez-market-district-proof",
  "pendingPlanSha256": "<exact pending plan SHA-256>",
  "styleFingerprintSha256": "<exact style fingerprint SHA-256>",
  "reviewer": "Named human art director",
  "reviewedAt": "2026-08-11T03:45:00.000Z",
  "evidence": [
    {
      "unitId": "ground-base",
      "sourceArtifactId": "artifact_<source PNG SHA-256>",
      "sourceSha256": "<source PNG SHA-256>",
      "sourceBytes": 12345,
      "width": 320,
      "height": 200,
      "providerJobIdempotencyKey": "<exact compiled unit job SHA-256>",
      "providerRequestSha256": "<exact provider request SHA-256>",
      "sealedReviewArtifactId": "artifact_<sealed review receipt SHA-256>",
      "sealedReviewReceiptSha256": "<sealed review receipt SHA-256>",
      "reviewBundleArtifactId": "artifact_<review bundle SHA-256>",
      "reviewBundleSha256": "<review bundle SHA-256>",
      "decision": "approved"
    }
  ],
  "crossUnitReview": {
    "decision": "approved",
    "styleFingerprintSha256": "<exact style fingerprint SHA-256>",
    "cameraConsistency": "approved",
    "lightingConsistency": "approved",
    "paletteConsistency": "approved",
    "pixelGrammarConsistency": "approved",
    "layerSeparation": "approved",
    "antiGenericQuality": "approved",
    "evidenceArtifactId": "artifact_<cross-unit review SHA-256>",
    "evidenceSha256": "<cross-unit review SHA-256>"
  }
}
```

The evidence array must cover the exact declared proof set. The compiler canonicalises it into proof-unit order; missing, duplicate and extra units are rejected.

## Per-unit binding

For every proof unit, the receipt compiler verifies:

- unit identity belongs to the exact proof set;
- dimensions match the compiled source unit;
- `sourceArtifactId` equals `artifact_<sourceSha256>`;
- source byte count is positive and bounded;
- provider job idempotency key exactly matches the compiled plan;
- provider request hash is present;
- sealed review artifact identity matches its receipt hash;
- review bundle artifact identity matches its bundle hash;
- the decision is explicitly `approved`;
- source, provider request, sealed review and review bundle identities are unique per unit.

This prevents one attractive image or one review receipt being silently reused to approve several unrelated layers.

## Cross-unit quality review

A single source frame can look acceptable while the combined proof still drifts. The cross-unit evidence therefore makes the reviewer explicitly approve:

- fixed camera and projection consistency;
- fixed light and shadow direction;
- palette and colour-budget consistency;
- pixel density, cluster, edge, dithering and outline grammar;
- exclusive layer ownership and clean separation;
- absence of generic AI rendering, modern gloss, random microdetail and unrequested filler.

The cross-unit evidence is bound to the exact style fingerprint and a content-addressed artifact identity.

## Deterministic receipt

The compiler returns:

```text
evavo.layered-production.style-proof-approval.receipt
protocol 2026-08-11.1
```

It contains:

- normalized approval request SHA-256;
- canonical evidence SHA-256;
- exact pending-plan SHA-256;
- exact proof-unit and approved-unit order;
- complete per-unit evidence;
- cross-unit review evidence;
- final self-hashed receipt SHA-256;
- an entirely false mutation and publication authority boundary.

Applying the receipt creates a new self-hashed layered-production plan whose style-proof status is `approved`. The full receipt is embedded in that plan. Plan verification reconstructs the exact pre-approval plan and checks that its hash matches the receipt, so the receipt cannot be moved to another revision, style, unit set or provider job.

## MCP flow

The Art Studio MCP exposes:

```text
compile_layered_style_proof_approval
```

This tool:

1. compiles the exact pending plan;
2. validates and seals the supplied external review evidence;
3. embeds the receipt into an approved self-hashed plan;
4. performs no provider call, image read, image mutation, creative decision, assembly, promotion, repository write, commit, push or publication.

The existing tools accept optional `styleProofApproval` evidence:

```text
compile_layered_production_plan
get_layered_production_unit
compile_layered_production_provider_request
```

Without that evidence, only the declared proof units can be retrieved. With valid evidence, later production units can be retrieved and compiled. Inline approval inside the source request is rejected with:

```text
LAYERED_PRODUCTION_STYLE_PROOF_RECEIPT_REQUIRED
```

## Authority boundary

A receipt proves which evidence a named human said they approved. It does not prove that the human made a good artistic decision, and it does not replace image review.

All authority remains false for:

- provider execution;
- source mutation;
- creative decision-making;
- automatic assembly;
- automatic promotion;
- target-repository mutation;
- Git commit or push;
- deployment or publication;
- force push.

The production chain remains:

```text
separate proof-unit generation
→ exact source intake
→ native-scale and composite review
→ sealed per-unit review receipts
→ cross-unit style review
→ named human decision
→ content-addressed approval receipt
→ controlled production expansion
→ later assembly and runtime integration
```
