# Top Hat pose-slot live provider execution

This boundary closes the operational gap between the already-admitted Top Hat provider package and the existing candidate-admission/release chain.

It does **one thing only**: execute one already-authorized Top Hat pose job through Art Studio's real provider Runtime and ArtifactStore, then emit the existing generic provider runtime outcome required by candidate admission.

## Contract

One invocation is bound to exactly one of:

- `blink-closed`
- `listening-attentive`
- `thinking-reflective`
- `speech-neutral`
- `presentation-open`
- `presentation-emphasis`

The invocation requires the exact self-hashed Top Hat runtime adapter and the adapter file SHA-256. Dispatch compilation occurs at execution time so the original named-human `run-provider-once` authorization must still be active.

The executor preserves these boundaries:

- one slot per invocation;
- one Runtime job;
- `maximumAttempts: 1`;
- one provider handler invocation;
- exact adapter allowlist from the admitted source job;
- `allowFallback: false`;
- three exact admitted body reference artifacts must already exist in the ArtifactStore;
- provider candidate remains an unapproved intermediate artifact;
- provider evidence remains immutable in the ArtifactStore;
- no scratch-path materialization is performed by this command;
- no candidate review, approval, promotion, pose-slot filling, release, repository mutation, publication, deployment or Runtime activation is performed.

A failed provider attempt consumes the one-shot execution lane. The receipt requires a fresh named-human run-once authorization before any retry.

## Existing contracts reused

The executor does not create a parallel art pipeline. It recompiles and uses:

```text
Top Hat runtime adapter
→ guarded Top Hat runtime dispatch
→ @evavo/art-providers runtime contract
→ avatar final-pass runtime binding
→ durable LocalRuntimeRepository job
→ restricted provider RuntimeWorker
→ immutable LocalArtifactStore candidate + evidence
→ avatar final-pass provider runtime outcome
→ existing Top Hat candidate admission
```

Successful execution returns `candidate-generated-review-required`. The embedded generic runtime outcome must report `candidate-materialization-required` and a create-only materialization request.

## Build and execute

The runner builds the domain packages and worker before importing the live execution engine.

PowerShell example:

```powershell
$adapter = 'evidence/top-hat/runtime-adapter.json'
$sha = (Get-FileHash $adapter -Algorithm SHA256).Hash.ToLowerInvariant()

node scripts/run-project-art-top-hat-pose-slot-provider.mjs `
  --adapter $adapter `
  --expected-adapter-file-sha256 $sha `
  --slot-id presentation-open `
  --runtime-root .runtime/top-hat-provider `
  --artifact-root .artifacts/project-art `
  --worker-id top-hat-provider-local `
  --output evidence/top-hat/presentation-open.execution.json
```

`artifact-root` must be the Art Studio ArtifactStore containing the exact admitted neutral, inhale and exhale reference artifacts named by the provider request. Pointing the runner at an empty store correctly fails before a provider call.

Provider credentials and adapter configuration come from the normal Art Studio worker environment. The executor then restricts the registry to the exact adapter IDs admitted by the source job; unavailable admitted adapters fail closed.

## What happens next

After a successful execution receipt:

1. materialize the candidate to the governed scratch path with the existing create-only materializer;
2. perform governed alpha extraction only when the provider result requires it;
3. rerun the frame finisher and decoded PNG checks;
4. perform independent anatomy, identity, silhouette, continuity and loop review;
5. record the real named-human candidate decision;
6. feed that evidence into the existing Top Hat candidate-admission boundary;
7. repeat independently for all six slots;
8. only after all six slots are admitted, continue through the already-existing release, Runtime publication, website installation and reversible rollout boundaries.

Generation is not approval. A successful provider call does not make a pose production-ready and cannot activate the website or Runtime.
