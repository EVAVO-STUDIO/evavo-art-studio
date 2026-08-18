# Top Hat six-pose provider campaign

This campaign layer runs the six already-governed Top Hat pose jobs through the one-shot provider executor merged in PR #311. It does not introduce another provider protocol and it does not turn generated candidates into approved art.

## Purpose

The one-shot executor is the authority boundary for a single irreversible provider call. The campaign runner adds orchestration only:

```text
validated six-slot runtime adapter
→ read-only six-slot preflight
→ blink-closed one-shot execution
→ checkpoint
→ listening-attentive one-shot execution
→ checkpoint
→ thinking-reflective one-shot execution
→ checkpoint
→ speech-neutral one-shot execution
→ checkpoint
→ presentation-open one-shot execution
→ checkpoint
→ presentation-emphasis one-shot execution
→ checkpoint
→ campaign execution receipt
```

Before the first provider call, campaign preflight checks all six slots against the current provider protocol, validates every guarded runtime dispatch and canonical provider binding, requires every named-human one-call authorization to be active, confirms the exact configured adapters are eligible with fallback disabled, and verifies the immutable image references in the shared ArtifactStore.

Provider calls then run sequentially in the canonical slot order. Each slot still uses the existing one-shot durable runtime reservation, `maximumAttempts: 1`, exact adapter allowlist, immutable candidate/evidence checks, and standard dispatch/binding/outcome documents. The campaign stops immediately on the first failed or unresolved slot so later authorizations are not consumed unnecessarily.

## What the campaign does not do

The campaign grants no authority for candidate materialization, deterministic or creative QA, anatomy/identity/continuity approval, candidate promotion, pose-slot filling, six-slot release, target-repository mutation, Git mutation, deployment, publication, website rollout, or Runtime activation.

A generated image remains an unapproved intermediate provider candidate. A failed provider attempt still consumes that slot's named-human run-once authorization and requires fresh human authorization before retry. The current three-pose fallback remains the safe runtime until the separate candidate-admission and release chain is genuinely complete.

## Evidence layout

The caller supplies a create-only campaign output root. A successful run writes:

```text
<output-root>/
  campaign-plan.json
  campaign-execution.json
  01-blink-closed/
    dispatch.json
    binding.json
    outcome.json
    execution.json
    checkpoint.json
  02-listening-attentive/
    ...
  03-thinking-reflective/
    ...
  04-speech-neutral/
    ...
  05-presentation-open/
    ...
  06-presentation-emphasis/
    ...
```

Every per-slot dispatch, binding and successful outcome remains compatible with the existing Top Hat candidate-admission flow. Checkpoints are append-only evidence of completed one-shot lanes; already-consumed provider authorizations are never rolled back if a later slot fails.

If an unexpected process error prevents a trustworthy per-slot execution receipt, the campaign does not invent a provider-call count. Only receipt-backed provider calls contribute to `verifiedProviderCalls`, while the campaign failure identifies the unresolved slot.

## Command

The direct runner builds the domain and worker once, performs six-slot preflight, and then uses the existing one-shot executor without rebuilding between slots.

```powershell
$adapter = 'C:\path\to\top-hat-runtime-adapter.json'
$adapterSha = (Get-FileHash $adapter -Algorithm SHA256).Hash.ToLowerInvariant()

node scripts/run-project-art-top-hat-pose-bank-provider-campaign.mjs `
  --adapter $adapter `
  --expected-adapter-file-sha256 $adapterSha `
  --runtime-root 'C:\path\to\top-hat-runtime' `
  --artifact-root 'C:\path\to\art-studio-artifacts' `
  --output-root 'C:\path\to\top-hat-six-pose-run-001' `
  --worker-prefix 'top-hat-pose-bank-provider'
```

The adapter must already contain the six real named-human run-once authorizations and the ArtifactStore must already contain the admitted neutral, inhale, and exhale image references used by the six provider requests. Provider credentials and exact adapter configuration remain environment concerns of the existing Art Studio provider registry.

## Next stage after a successful real campaign

A successful campaign proves only that six provider candidates and six evidence records exist. Continue with the existing per-slot candidate-admission writer, create-only materialization, frame finishing, decoded PNG/straight-alpha checks, independent anatomy/identity/hand/silhouette/continuity review, and real named-human candidate decisions. Only after all six genuinely pass should the separate pose-bank release, Runtime publication, website installation, and reversible rollout boundaries be considered.

Generation is not approval.
