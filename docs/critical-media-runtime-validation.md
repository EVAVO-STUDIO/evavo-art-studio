# Critical media runtime validation

Status: permanent combined release gate

This gate verifies the two media-production boundaries most likely to interact during automated game-art delivery:

1. durable sprite-production orchestration and restart-safe continuation recovery;
2. deterministic runtime-image mastering, including true lossless Godot WebP profiles and governed PNG fallback.

They remain separate authorities, but they are validated together so a runtime or artifact change cannot silently preserve one package while breaking the other.

## Orchestration boundary

The gate builds and typechecks the sprite supervisor, runtime, artifact store and worker dependency closure. It then runs:

- the complete sprite-supervisor contract and scheduling suite;
- missing-continuation recovery after durable state advancement;
- idempotent replay after continuation submission;
- duplicate-continuation prevention;
- future-tick transient rejection;
- queue-scoped idempotency conflict rejection;
- existing closed-loop state, review and targeted-repair attacks.

The supervisor must preserve pause, cancellation, bounded retry, state-bound named review, candidate QA, targeted repairs, promotion separation and final release evidence.

## Delivery boundary

The gate builds and strictly typechecks the delivery optimizer and runs its complete test suite. This includes:

- canonical RGBA8 PNG sprite authority;
- true lossless WebP for approved opaque plates;
- optional true lossless WebP for approved transparent cut-outs;
- exact visible-colour and alpha comparison;
- explicit hidden RGB comparison beneath alpha zero;
- rejection and PNG fallback when authored edge bleed cannot survive a WebP round trip;
- continuous luminance-to-alpha weather mastering;
- connected-matte, dialogue, UI, source-master and atomic batch regressions.

Lossless encoding intent never self-approves an output. Decoded pixels and the profile’s exact quality thresholds remain the acceptance authority.

## Exact-tree receipt

The workflow records one bounded JSON receipt containing:

- exact Git commit SHA;
- workflow run and attempt identity;
- pinned Node and pnpm versions;
- completed build, typecheck, runtime and delivery checks;
- clean-source proof;
- explicit confirmation that validation did not call providers, mutate candidate pixels, select or promote artifacts, deploy or publish.

The receipt is uploaded as a short-retention workflow artifact. It is evidence of validation only and is not an approved art artifact, game build or deployment receipt.

## No authority expansion

This combined gate does not:

- execute image providers;
- alter approved artwork references;
- relax any quality threshold;
- select or promote candidates;
- mutate a game repository;
- deploy a runtime;
- publish a book, game or media package.

Its purpose is to prove that the exact checked-out source retains both restart-safe orchestration and deterministic delivery behaviour at the same time.
