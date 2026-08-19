# Top Hat six-pose candidate materialization campaign

This stage consumes one already-successful six-slot Top Hat provider campaign and materializes the six immutable provider candidates into the existing create-only unapproved candidate bundle format. It does not call a provider again and it does not admit, approve, promote, release, publish, or activate any frame.

## Purpose

The existing single-slot candidate materializer remains the authority boundary for writing one unapproved candidate PNG plus its self-hashed materialization receipt and frame-finisher request. This campaign adds orchestration only:

```text
successful six-slot provider campaign
→ verify adapter + provider campaign plan + provider campaign receipt
→ verify all six dispatch/binding/outcome documents and their file hashes
→ verify all twelve immutable candidate/evidence artifacts
→ verify all six candidate bundle targets are absent
→ write campaign plan evidence
→ materialize blink-closed candidate bundle
→ materialize listening-attentive candidate bundle
→ materialize thinking-reflective candidate bundle
→ materialize speech-neutral candidate bundle
→ materialize presentation-open candidate bundle
→ materialize presentation-emphasis candidate bundle
→ write campaign execution evidence
→ deterministic frame finishing
→ independent named-human review
```

The six slots are fixed by the existing Top Hat runtime adapter. Before the first candidate write, the campaign checks the exact canonical order, recompiles every dispatch against the adapter, validates the binding and successful runtime outcome, confirms exactly one provider call per outcome, requires provider fallback to remain disabled, verifies the immutable candidate and provider-evidence artifacts, and proves that no candidate, materialization receipt, or finisher request already exists at any of the six targets.

## Authority boundary

This stage may materialize unapproved provider candidates only. It grants no authority for:

- provider execution or retry;
- deterministic frame finishing;
- creative, anatomy, identity, silhouette, registration, continuity, or loop review;
- candidate approval or promotion;
- pose-slot filling or sequence release;
- target repository or Git mutation;
- deployment or publication;
- Runtime activation; or
- force push.

An `agent` or `human` may provide the explicit materialization authorization accepted by the existing single-slot materializer because materialization is a mechanical provenance-preserving write, not an art approval decision. The resulting PNG remains `unapproved: true` and every frame-finisher request keeps candidate approval, candidate promotion, and Runtime activation disabled.

The campaign never calls the candidate-admission writer. Named-human review and final admission stay downstream and independent.

## Failure and replay semantics

The campaign is fail-closed and append-only:

1. all six inputs and all six output bundles are preflighted before the first candidate write;
2. slots are materialized sequentially in canonical order;
3. the campaign stops immediately on the first failed slot;
4. already-created earlier bundles remain immutable evidence and are not rolled back;
5. later slots are not attempted after a failure; and
6. any pre-existing candidate, materialization receipt, or finisher request blocks the entire campaign before the first write.

The underlying single-slot materializer still performs its own descriptor/content verification, provider-evidence verification, strict PNG structure/CRC/canvas/alpha checks, create-only three-file transaction, exact readback, and self-hashed receipts. The campaign does not duplicate or weaken those checks.

## Evidence

The production CLI binds this stage to the exact reviewed upstream files. It requires:

- the runtime adapter JSON;
- the provider campaign plan JSON;
- the successful provider campaign execution JSON;
- the shared immutable ArtifactStore root;
- the candidate workspace root;
- a new create-only campaign evidence root; and
- explicit materialization authorization evidence.

The CLI verifies the provider campaign receipt is a complete six-slot success with six verified provider calls. For each slot it then re-reads the dispatch, binding and outcome from the provider campaign output root and verifies each recorded file SHA-256 before the materialization campaign is compiled.

The create-only evidence root contains:

```text
<output-root>/
  campaign-plan.json
  campaign-execution.json
```

`campaign-plan.json` hash-binds the adapter file, adapter document, provider campaign plan file/document, provider campaign receipt file/document, and the compiled six-slot materialization plan. `campaign-execution.json` hash-binds the materialization receipt to that plan evidence and the exact upstream provider campaign execution receipt.

The candidate workspace receives the existing per-slot bundle format:

```text
<candidate-output>.png
<candidate-output>.materialization.json
<candidate-output>.finisher-request.json
```

No second candidate format is introduced.

## Command

After a real provider campaign has succeeded:

```powershell
node scripts/run-project-art-top-hat-pose-bank-candidate-materialization-campaign.mjs `
  --adapter 'C:\path\to\top-hat-runtime-adapter.json' `
  --provider-campaign-plan 'C:\path\to\provider-run\campaign-plan.json' `
  --provider-campaign-receipt 'C:\path\to\provider-run\campaign-execution.json' `
  --artifact-root 'C:\path\to\art-studio-artifacts' `
  --workspace-root 'C:\path\to\top-hat-candidate-workspace' `
  --output-root 'C:\path\to\top-hat-materialization-run-001' `
  --actor-class 'agent' `
  --actor-id 'evavo-art-studio-agent' `
  --authorization-evidence-sha256 '<lowercase-sha256>' `
  --authorized-at '2026-08-19T00:00:00.000Z'
```

The `output-root` must not already exist and must be disjoint from the ArtifactStore, candidate workspace, and provider campaign output roots.

## Next stage

A successful result means six unapproved PNG candidate bundles and six frame-finisher requests exist. It still does not mean the six poses are accepted.

The next safe stage is deterministic frame finishing and decoded PNG/straight-alpha QA for each slot, followed by independent named-human review of anatomy, hands, face identity, silhouette, registration, adjacent-frame continuity, and any applicable loop closure. Only genuine reviewed decisions may flow into the existing candidate-admission writer.

Materialization is not approval.
