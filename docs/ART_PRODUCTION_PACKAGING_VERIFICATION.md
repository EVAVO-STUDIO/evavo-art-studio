# Art Production Packaging Verification

Art Studio packaging plans are deterministic metadata contracts. They retain every approved individual PNG identity and describe exact animation-sheet and non-rotating atlas layouts, but they do not execute image mutation, write output files, alter a target repository, commit Git, deploy or publish.

## Named-human approval provenance

Packaging no longer accepts a loose object containing an arbitrary `approvalReceiptSha256` string.

Each source unit must carry a complete `evavo.art-production.human-approval.receipt` compiled from an explicit named-human approval request after the exact candidate has passed deterministic technical review.

The receipt binds:

- the exact plan, loop and game-art profile identities;
- one canonical source unit;
- the accepted candidate artifact ID, SHA-256 and byte count;
- the exact accepted technical-review attempt and derived weighted score;
- the named reviewer, canonical UTC review time and approved decision;
- a distinct content-addressed external decision-evidence artifact;
- the normalized approval request hash;
- the complete governed approval-basis hash;
- the complete receipt hash.

Receipt verification performs structural and self-hash validation, then recompiles the canonical receipt from the exact plan, loop, candidate and request. Rehashed mutation of derived technical-review data or authority cannot pass deterministic recompilation. A receipt can also be verified against the exact separately retained approval request.

Receipt compilation does not make the creative decision. It records a caller-supplied named-human decision. Human identity authentication and inspection of the external decision-evidence bytes remain separate governed responsibilities.

The packaging plan retains these lineage identities for every individual source:

```text
technicalReviewAttemptSha256
approvalRequestSha256
approvalBasisSha256
approvalReceiptSha256
```

## Packaging-plan threat model

A packaging plan carries `packagingSha256`, calculated over every other field in the plan. That self-hash is useful for identity and replay, but the hash algorithm is public and the hash string alone is not proof that the submitted object still matches it.

The original verifier recompiled the canonical packaging plan from the exact layered-production plan, reviewed loop and named-human approvals, then compared the canonical hash with the submitted `packagingSha256` string. A caller could therefore alter a submitted field while retaining the original hash string. The string still matched the canonical result even though the surrounding submitted payload no longer did.

Sensitive examples include changing:

- source artifact identity or byte count;
- technical-review or human-approval lineage;
- individual-source output paths;
- animation frame order, timing or output paths;
- atlas dimensions or placements;
- rotation or trimming policy;
- packaging-execution, repository, Git or publication authority.

## Packaging verification sequence

The public `verifyArtProductionPackagingPlan` boundary performs two independent checks in order.

1. It removes only `packagingSha256`, canonically hashes the complete submitted payload and requires that calculated identity to equal the submitted hash string.
2. It invokes the deterministic verifier, which verifies every human-approval receipt, recompiles the exact canonical packaging plan from the layered-production plan and production loop, and requires the identities to match.

This distinguishes two failure classes:

- retained-hash payload mutation fails because the submitted payload no longer hashes to its claimed identity;
- attacker-rehashed mutation fails because the newly self-consistent payload is not the deterministic compilation of the governed source inputs and approval receipts.

A valid packaging plan must pass both checks.

## Authority remains closed

This hardening does not add approval or packaging execution. Human-approval receipts state:

```text
providerExecution: false
imageMutation: false
creativeDecision: false
packagingExecution: false
targetRepositoryMutation: false
gitCommit: false
gitPush: false
publication: false
forcePush: false
```

The verified packaging plan continues to state:

```text
imageMutation: false
packagingExecution: false
creativeApproval: false
targetRepositoryMutation: false
gitCommit: false
gitPush: false
publication: false
```

Provider execution, candidate admission, named-human decision making, evidence storage, image-byte packing and target-repository publication remain separate governed transactions.

## Adversarial regression coverage

The package suite proves that:

- the exact candidate-bound named-human receipt compiles and verifies;
- the previous loose hash-only approval shape is rejected;
- named-human request mutation retaining the original receipt hash is rejected;
- derived technical-review mutation followed by attacker recomputation is rejected by deterministic recompilation;
- creative-decision authority escalation remains rejected after attacker recomputation;
- a valid receipt cannot be replayed against another valid loop and candidate;
- exact request-bound verification distinguishes separate named-human decisions;
- the exact deterministic packaging payload verifies;
- an atlas-placement mutation retaining the canonical hash string is rejected;
- packaging-execution authority escalation followed by attacker recomputation of the package hash is rejected by deterministic recompilation.

The public package and MCP imports receive the hardened approval and packaging verifiers automatically through the stable Art Production Orchestrator export surface.
