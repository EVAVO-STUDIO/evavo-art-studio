# Layered provider reference authority

Layered provider jobs may use image artifacts as continuity references, but a hash-shaped artifact ID is not approval by itself.

This boundary applies after the layered style proof has been approved and embedded in the exact production plan.

## Problem closed by this contract

Before this guard, a later character frame could satisfy the required `canonical-identity` role with any value shaped like:

```text
artifact_<64 lowercase hexadecimal characters>
```

The provider bridge checked that a named role existed, but it did not prove that the artifact was one of the source PNGs accepted by the style-proof approval receipt. An invented artifact, another character, an effect frame or an unrelated project image could therefore be labelled `canonical-identity`.

## Exact approved-source rule

For an approved plan, every required provider reference must identify a source artifact recorded in the embedded style-proof receipt.

The receipt already binds each proof source to:

- the exact pending plan;
- the exact proof unit;
- the source artifact ID and SHA-256;
- source dimensions and byte count;
- the compiled provider-job idempotency key;
- the provider request SHA-256;
- the sealed unit-review receipt;
- the retained review bundle;
- the cross-unit camera, lighting, palette, pixel-grammar, layer-separation and anti-generic decision.

The provider bridge now reuses that authority instead of trusting caller wording.

## Canonical identity rule

A `canonical-identity` reference is valid only when all of the following are true:

1. Its artifact ID is an exact `sourceArtifactId` in the embedded approval receipt.
2. The approved source belongs to the same `continuityKey` as the target unit.
3. The approved source was compiled as an `identity-master`.
4. The approved source is a character `sprite-frame` or `sprite-layer`.
5. The request contains only one `canonical-identity` reference.
6. A required identity reference remains marked `required: true`.

A note such as `Approved identity master` has no authority. The note is descriptive only.

## Other continuity roles

The same receipt-bound rule applies to approved-plan references using:

- `direction-master`;
- `previous-key-pose`;
- `next-key-pose`.

Role semantics are checked against the target continuity family and source order. A proof artifact that is approved for another purpose cannot be relabelled to satisfy the role.

If a future provider contract makes palette, line, material or layer context references mandatory, those required references must also come from the embedded proof receipt. Required layer context must come from the same layer.

## Pending proof production

A pending style-proof plan has no final cross-unit approval receipt yet. The bridge therefore retains the existing proof-production behaviour while the bounded proof set is being made and reviewed.

This exception does not unlock expansion. `getLayeredProductionUnit` continues to block all units outside the declared proof set until the exact receipt is applied.

Once the plan is approved, required continuity references become receipt-bound and arbitrary artifact IDs fail closed.

## Failure codes

```text
LAYERED_PRODUCTION_PROVIDER_REFERENCE_REQUIRED
```

The compiled unit contract requires a role, but the request does not contain one required reference for it.

```text
LAYERED_PRODUCTION_PROVIDER_REFERENCE_NOT_APPROVED
```

The artifact has a valid ID shape but is not an exact proof source in the embedded approval receipt.

```text
LAYERED_PRODUCTION_PROVIDER_REFERENCE_ROLE_MISMATCH
```

The artifact is an approved proof source, but its unit, continuity family, phase, asset kind, layer or relative order cannot satisfy the requested role.

```text
LAYERED_PRODUCTION_PROVIDER_REFERENCE_AMBIGUOUS
```

The request supplies more than one artifact for a singular continuity role.

## Correct JONEZ example

The approval receipt contains evidence for `player-idle-se`:

```json
{
  "unitId": "player-idle-se",
  "sourceArtifactId": "artifact_<sha256-of-approved-player-idle-source>",
  "providerJobIdempotencyKey": "<exact-compiled-job-sha256>",
  "decision": "approved"
}
```

A later player frame uses that exact artifact:

```json
{
  "artifactId": "artifact_<sha256-of-approved-player-idle-source>",
  "role": "canonical-identity",
  "required": true,
  "note": "Exact receipt-bound JONEZ player identity master."
}
```

The bridge rejects:

- an invented `artifact_bbbb...` value;
- the approved fountain frame relabelled as the player identity;
- an approved source from another continuity family;
- a non-character proof source;
- a second canonical identity in the same request;
- a required role supplied only with `required: false`.

## Deterministic request identity

The compiled provider request ID includes:

- the exact approved plan SHA-256;
- the target unit ID;
- the normalized provider references.

The approved plan SHA-256 already includes the embedded style-proof receipt. Changing the receipt, proof artifact or normalized reference changes the request identity.

## Authority boundary

This guard performs validation and deterministic compilation only.

It does not:

- inspect image pixels;
- decide that an image is creatively acceptable;
- execute an image provider;
- approve a generated candidate;
- assemble a composite;
- promote a source;
- mutate the target game repository;
- commit or push target-project changes;
- deploy or publish anything.

Those authorities remain explicitly false in the layered plan and compiled provider bridge.
