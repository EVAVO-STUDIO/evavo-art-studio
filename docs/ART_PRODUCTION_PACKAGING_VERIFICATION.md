# Art Production Packaging Verification

Art Studio packaging plans are deterministic metadata contracts. They retain every approved individual PNG identity and describe exact animation-sheet and non-rotating atlas layouts, but they do not execute image mutation, write output files, alter a target repository, commit Git, deploy or publish.

## Threat model

A packaging plan carries `packagingSha256`, calculated over every other field in the plan. That self-hash is useful for identity and replay, but the hash algorithm is public and the hash string alone is not proof that the submitted object still matches it.

The original verifier recompiled the canonical packaging plan from the exact layered-production plan, reviewed loop and named-human approvals, then compared the canonical hash with the submitted `packagingSha256` string. A caller could therefore alter a submitted field while retaining the original hash string. The string still matched the canonical result even though the surrounding submitted payload no longer did.

Sensitive examples include changing:

- source artifact identity or byte count;
- individual-source output paths;
- animation frame order, timing or output paths;
- atlas dimensions or placements;
- rotation or trimming policy;
- packaging-execution, repository, Git or publication authority.

## Verification sequence

The public `verifyArtProductionPackagingPlan` boundary now performs two independent checks in order.

1. It removes only `packagingSha256`, canonically hashes the complete submitted payload and requires that calculated identity to equal the submitted hash string.
2. It invokes the existing deterministic verifier, which recompiles the exact canonical packaging plan from the layered-production plan, production loop and human approvals and requires the identities to match.

This distinguishes two failure classes:

- retained-hash payload mutation fails because the submitted payload no longer hashes to its claimed identity;
- attacker-rehashed mutation fails because the newly self-consistent payload is not the deterministic compilation of the governed source inputs.

A valid packaging plan must pass both checks.

## Authority remains closed

This hardening does not add packaging execution. The verified plan continues to state:

```text
imageMutation: false
packagingExecution: false
creativeApproval: false
targetRepositoryMutation: false
gitCommit: false
gitPush: false
publication: false
```

Provider execution, candidate admission, named-human approval, image-byte packing and target-repository publication remain separate governed transactions.

## Adversarial regression coverage

The package suite now proves that:

- the exact deterministic packaging payload verifies;
- an atlas-placement mutation retaining the canonical hash string is rejected;
- packaging-execution authority escalation followed by attacker recomputation of the package hash is rejected by deterministic recompilation.

The public package and MCP imports receive the hardened verifier automatically through the stable Art Production Orchestrator export surface.
