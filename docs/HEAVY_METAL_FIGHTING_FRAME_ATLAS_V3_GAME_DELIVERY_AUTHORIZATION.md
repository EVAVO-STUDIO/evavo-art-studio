# HEAVY METAL FIGHTING — atlas-v3 game delivery authorization

Status: named-human read-only delivery authorization boundary  
Game target: `EVAVO-STUDIO/steel-dominion`  
Repository mutation: prohibited

## Purpose

The Frame atlas-v3 chain now has three separate evidence layers before any game-repository writer is allowed to exist:

```text
four exact workspace atlas builds
        ↓
independent exact-pixel build verification
        ↓
local steel-dominion Godot 4.6.2 six-suite validation
        ↓
Art Studio game-validation admission
        ↓
explicit named-human delivery authorization
        ↓
future separately authorised repository writer
```

This boundary closes the compiler-side blocker named `explicit-game-repository-delivery-authorization`. It records one explicit named-human authorization for the exact validated game commit and the exact four Frame build evidence sets.

It does **not** copy the atlases into `steel-dominion`, activate the runtime, commit Git, push a branch, deploy or publish.

## Required game validation evidence

The caller must provide all three of:

```text
gameValidationAdmission
gameValidationReceiptBytes
expectedGameHead
```

The compiler calls `verifyHmfAtlasV3GameValidationAdmission` again. A standalone admission hash is not sufficient.

The exact original local-validation bytes must therefore still prove:

- schema `steel-dominion.hmf-atlas-v3-local-validation.v1`;
- repository `EVAVO-STUDIO/steel-dominion`;
- the exact expected 40-character game commit;
- Godot 4.6.2;
- all six required suites, in order, passed;
- clean game source before and after validation;
- no GitHub Actions dependency;
- no image generation.

## Required atlas build evidence

`atlasBuildEvidence` must contain exactly four entries in canonical order:

```text
bastion
viper
citadel
mirage
```

Each entry contains the Python atlas builder's exact self-hashed build receipt and the independent build-verification result.

The authorization compiler re-admits every build receipt and requires:

- build receipt schema `evavo.heavy-metal-fighting-frame-atlas-v3-build-receipt.v1`;
- contract `production_master_v3`;
- 224 authored sources and 32 reserved slots;
- named-human style-proof approval;
- canonical image and manifest paths;
- canonical `steel-dominion` final-v3 target path;
- the three existing activation blockers;
- create-only atomic workspace publication;
- source/workspace read-write authority only;
- no source mutation, target-repository mutation, Git mutation, deployment or publication;
- a valid canonical `receiptSha256`.

The matching verification must use schema:

```text
evavo.heavy-metal-fighting-frame-atlas-v3-build-verification.v1
```

and must cross-bind the exact:

- `frameId`;
- `planSha256`;
- `receiptSha256`;
- atlas image SHA-256;
- `exactSourcePixelsVerified = true`;
- `targetRepositoryMutation = false`;
- `gameActivationReady = false`.

The authorization retains a SHA-256 identity of the complete submitted build-verification object so later verification is bound to the same exact evidence.

## Named-human authorization

The human authorization input is closed and must contain exactly:

```text
actorId
occurredAt
decision
rationale
evidenceSha256
attestations
```

`decision` must be `authorized`.

All attestations are mandatory and true:

```text
exactGameValidationAdmissionReviewed
allFourAtlasBuildVerificationsReviewed
exactBuildReceiptLineageAccepted
canonicalTargetPathsAccepted
deliveryAuthorizationOnly
noRepositoryMutationOrRuntimeActivationPerformed
```

The resulting record therefore represents an explicit human decision to authorize **delivery of the exact evidence-bound atlas set to the exact validated game commit**. It is not an automatic release decision.

## Output

A successful compilation emits:

```text
evavo.heavy-metal-fighting-atlas-v3-game-delivery-authorization.v1
```

The self-hashed record binds:

- exact game-validation admission SHA-256;
- exact validated `steel-dominion` commit;
- all four plan SHA-256 values;
- all four build-receipt SHA-256 values;
- all four build-verification SHA-256 identities;
- all four atlas image SHA-256 values;
- all four canonical target paths;
- all four style-proof execution identities;
- named-human authorization evidence;
- explicit pass checks;
- a closed authority map.

## Verification

`verifyHmfAtlasV3GameDeliveryAuthorization` does not accept a standalone authorization record.

It requires the submitted authorization plus the original:

```text
gameValidationAdmission
gameValidationReceiptBytes
expectedGameHead
atlasBuildEvidence
humanAuthorization
```

The verifier re-admits the submitted self-hashed authorization, recompiles the expected record from the exact original evidence, and requires the identities to match.

An attacker therefore cannot alter the authorizer, game commit, atlas image, receipt, target path or authority flags, recompute `authorizationSha256`, and have the altered record verify against the unchanged source evidence.

## Authority boundary

Positive capabilities:

```text
evidenceAdmission                   true
namedHumanDeliveryAuthorization      true
```

The following remain false:

```text
gameRepositoryRead
gameRepositoryMutation
runtimeActivation
gitMutation
deployment
publication
forcePush
```

This boundary is deliberately one step before any `steel-dominion` repository writer. A future writer must independently re-verify this authorization and the concrete bytes it intends to install before it may mutate the game repository.
