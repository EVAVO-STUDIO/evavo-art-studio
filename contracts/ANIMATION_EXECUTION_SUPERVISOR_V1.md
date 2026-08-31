# Animation Execution Supervisor V1

Protocol: `2026-08-31.2`

This contract connects the approved animation production profile and append-only frame ledger to bounded local Art Studio production, evidence-bound drawing inspection, independent Cel Animation Studio sequence review, separate creative approval and accepted sequence delivery.

## Non-negotiable execution rules

- One invocation performs no more than one bounded cycle.
- Provider and reviewer implementations are selected only from the sealed adapter catalogue and must match their recorded SHA-256.
- Provider commands run through Node with `shell: false`; the request cannot supply an executable, arguments or environment variables.
- Candidate PNG bytes, dimensions, CRCs, alpha and SHA-256 are independently verified by the supervisor.
- A complete candidate batch is staged before visual evidence. The ledger is not advanced until every exact staged frame has digest-bound drawing evidence.
- Staged batches survive restart. Re-running inspection never regenerates accepted drawings.
- Art Studio drawing evidence and Cel sequence evidence are separate, role-bound and content-addressed.
- Missing provider configuration or evidence is an explicit required state, never inferred success.
- Independent Cel acceptance is not creative approval. Owner or animation-director approval remains a separate exact-lineage document.
- The supervisor has no Git, publication, artifact-promotion or runtime-activation authority.

## Workspace

```text
request.json
adapter-catalogue.json
ledger.json
state.json
events.jsonl
cycles/
artifacts/
evidence/inbox/drawings/
evidence/inbox/sequences/
creative-approval.json
```

State and events are hash-bound. Candidate artifacts use workspace-relative paths. Transaction recovery completes an interrupted cycle record, event, ledger and state commit without replaying provider work.

## Evidence ownership

Art Studio owns per-drawing inspection. The exact output is compiled with:

```text
node scripts/compile-animation-drawing-inspection-evidence-v1.mjs write input.json
```

Cel Animation Studio owns the independent moving-sequence review. The exact output is compiled with:

```text
node scripts/compile-animation-independent-sequence-evidence-v1.mjs write input.json
```

Use the read-only review-packet operation to obtain the exact candidate lineage, relative paths, timing and required rubric. Scores must describe observed evidence; the compilers and bridges do not invent them.

## MCP gates

The registered MCP server is read-only by default. Mutation tools appear only when `EVAVO_ANIMATION_EXECUTION_ENABLED=enabled`. Approval installation additionally requires `EVAVO_ANIMATION_CREATIVE_APPROVAL_WRITE_ENABLED=enabled`.
