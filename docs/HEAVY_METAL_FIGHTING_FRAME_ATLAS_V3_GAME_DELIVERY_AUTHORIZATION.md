# HEAVY METAL FIGHTING — atlas-v3 game delivery authorization

Status: named-human read-only delivery authorization boundary  
Game target: `EVAVO-STUDIO/steel-dominion`  
Repository mutation: prohibited

## Purpose

The Frame atlas-v3 chain keeps evidence admission, human authorization and repository mutation as separate trust boundaries:

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

This layer records an explicit named-human authorization for one exact validated game commit and one exact four-Frame atlas evidence set. It does not copy atlas bytes into `steel-dominion`, activate the runtime, commit or push Git, deploy or publish.

## Required game-validation evidence

The caller must provide the exact:

```text
gameValidationAdmission
gameValidationReceiptBytes
expectedGameHead
```

The compiler invokes `verifyHmfAtlasV3GameValidationAdmission` again. A standalone admission hash is not accepted.

The original receipt bytes must therefore still prove:

- schema `steel-dominion.hmf-atlas-v3-local-validation.v1`;
- repository `EVAVO-STUDIO/steel-dominion`;
- the exact expected 40-character game commit;
- Godot 4.6.2;
- all six required suites passed in canonical serial order;
- a clean game source tree before and after validation;
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

Each entry supplies the Python atlas builder's exact self-hashed build receipt and its independent build-verification result.

Every build receipt is re-admitted through a closed contract and must retain:

- schema `evavo.heavy-metal-fighting-frame-atlas-v3-build-receipt.v1`;
- `production_master_v3` identity;
- 224 authored sources and 32 reserved slots;
- one named-human style-proof approval with valid evidence identity and UTC time;
- canonical image and manifest names;
- canonical `res://assets/fighters/final-v3/<frame>.png` target;
- the exact existing activation blockers;
- create-only atomic workspace publication;
- source/workspace read-write authority only;
- no source mutation, target-repository mutation, Git mutation, deployment or publication;
- a valid canonical `receiptSha256`.

The corresponding build verification must use schema:

```text
evavo.heavy-metal-fighting-frame-atlas-v3-build-verification.v1
```

and must cross-bind the exact `frameId`, `planSha256`, `receiptSha256` and atlas image SHA-256. It must also prove:

```text
status = passed
exactSourcePixelsVerified = true
targetRepositoryMutation = false
gameActivationReady = false
```

The authorization retains a SHA-256 identity of the complete submitted build-verification object, binding later verification to that exact evidence.

## Named-human authorization

The human input is closed and contains exactly:

```text
actorId
occurredAt
decision
rationale
evidenceSha256
attestations
```

`decision` must be `authorized`. All attestations are mandatory and true:

```text
exactGameValidationAdmissionReviewed
allFourAtlasBuildVerificationsReviewed
exactBuildReceiptLineageAccepted
canonicalTargetPathsAccepted
deliveryAuthorizationOnly
noRepositoryMutationOrRuntimeActivationPerformed
```

The authorization timestamp must be **at or after both** the completed local game-validation window and the latest retained Frame style-proof approval. An authorization that predates evidence it claims to review fails closed.

## Output and verification

A successful compilation emits:

```text
evavo.heavy-metal-fighting-atlas-v3-game-delivery-authorization.v1
```

The self-hashed record binds the exact game-validation admission, validated `steel-dominion` commit, all four plan/receipt/verification/image/style-proof identities, canonical target paths, named-human decision and a closed authority map.

`verifyHmfAtlasV3GameDeliveryAuthorization` does not accept that record alone. It requires the submitted authorization plus all original game-validation bytes, game head, four build-evidence entries and human authorization, then recompiles the expected record and requires exact identity agreement.

A caller therefore cannot alter the authorizer, game commit, atlas image, receipt, target path, evidence chronology or authority flags, recompute `authorizationSha256`, and have the altered record verify against unchanged source evidence.

## Authority boundary

Positive capabilities:

```text
evidenceAdmission                  true
namedHumanDeliveryAuthorization    true
```

These remain false:

```text
gameRepositoryRead
gameRepositoryMutation
runtimeActivation
gitMutation
deployment
publication
forcePush
```

This is deliberately one step before any `steel-dominion` repository writer. A future writer must independently re-verify this authorization and the concrete atlas bytes it intends to install before it may mutate the game repository.
