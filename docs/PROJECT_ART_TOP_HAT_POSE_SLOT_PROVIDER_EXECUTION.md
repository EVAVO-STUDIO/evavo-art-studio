# Top Hat pose-slot provider execution

This boundary connects the admitted six-slot Top Hat provider package to the existing candidate-admission and release chain. It handles one already-authorized slot at a time and persists the standard runtime evidence needed by the existing candidate path.

## Scope

Supported slots are `blink-closed`, `listening-attentive`, `thinking-reflective`, `speech-neutral`, `presentation-open`, and `presentation-emphasis`.

Each invocation requires the exact self-hashed Top Hat runtime adapter plus its reviewed file SHA-256. The original named-human run-once authorization must still be active. The executor uses one durable runtime reservation for that authorization, forces `maximumAttempts: 1`, disables fallback, restricts execution to the admitted adapter allowlist, verifies provider references before reservation, and verifies the immutable candidate/evidence artifacts after completion.

Reusing the same run-once authorization in the same durable runtime root is rejected. A failed provider attempt requires fresh named-human authorization before retry.

This command does not materialize the scratch PNG, make a creative decision, approve or promote a candidate, fill a pose slot, release the six-pose bank, mutate another repository, publish, deploy, or activate Runtime. The current three-pose fallback remains the safe runtime until the real six-pose bank clears the later review and release gates.

## Existing chain reused

The implementation keeps one art pipeline:

```text
Top Hat runtime adapter
→ guarded per-slot dispatch
→ canonical provider runtime contract
→ avatar runtime binding
→ one-attempt durable Runtime job
→ exact-adapter provider worker
→ immutable candidate + evidence
→ standard avatar provider outcome
→ existing Top Hat candidate admission
```

The executor also checks that the avatar bridge provider protocol matches the live provider package. The candidate source-chain parser now reads the same bridge constant, so provider protocol drift is caught explicitly instead of surfacing later during admission.

## CLI outputs

The runner takes the adapter path, expected adapter file SHA-256, slot ID, runtime root, artifact root, optional worker ID, and four create-only output paths:

- dispatch output: standard avatar provider runtime dispatch;
- binding output: standard validated runtime binding;
- outcome output: standard provider runtime outcome when a provider attempt can be represented truthfully;
- receipt output: Top Hat one-shot execution receipt.

The artifact root must already contain the admitted neutral, inhale, and exhale image artifacts referenced by the provider request. Missing, corrupt, non-image, or oversized provider references fail before the durable authorization reservation is created.

If execution fails before an actual provider adapter attempt can be proven, no fabricated one-call provider outcome is emitted. The execution receipt records the runtime failure and leaves `providerCallCountVerified` false.

## Next stage

After a successful provider execution, use the standard dispatch, binding, outcome, candidate, and evidence with the existing candidate-admission flow. Materialization, decoded PNG and alpha checks, anatomy/identity/hand/continuity review, and the real named-human candidate decision remain separate. Repeat that process independently for all six slots; only then continue through the existing release, Runtime publication, website installation, and reversible rollout boundaries.

Generation is not approval.
