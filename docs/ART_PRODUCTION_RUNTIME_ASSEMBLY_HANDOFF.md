# Art Production Runtime Assembly Handoff

The Art Production Runtime Assembly Handoff is the governed metadata bridge between reviewed source-art production and the existing layered runtime-assembly compiler.

It does not assemble pixels, write files, mutate a game repository or activate a runtime. Its purpose is to prove that every source admitted to a `runtime-candidate` assembly is the exact source that passed technical review, received an explicit named-human approval receipt and was retained by the deterministic packaging plan.

## Why a separate handoff is required

The generic layered-assembly contract is intentionally reusable outside the Art Production Orchestrator. For an approved source it requires a content-addressed approval receipt artifact and SHA-256, but the generic compiler does not receive the Art Production loop, complete approval receipts or packaging plan.

A content-addressed hash proves only the identity of the declared receipt artifact. By itself, it does not prove that the receipt belongs to:

- the exact layered-production plan;
- the exact full-production loop and profile;
- the exact review-passed candidate;
- the accepted technical-review attempt;
- the named-human decision request;
- the exact source retained by packaging.

The Art Production wrapper therefore compiles the generic assembly manifest only after independently verifying all of that lineage.

## Compilation sequence

`compileArtProductionRuntimeAssemblyHandoff` performs these checks in order:

1. Semantically verifies the exact production loop against the supplied plan.
2. Verifies the submitted packaging payload and deterministically recompiles it from the exact loop and complete named-human approval receipts.
3. Requires a `runtime-candidate` assembly request.
4. Compiles and verifies the existing blocker-free runtime assembly manifest.
5. Matches every assembly source to one deterministic packaging source.
6. Matches the same source to one complete candidate-bound named-human approval receipt.
7. Requires exact agreement for artifact ID, SHA-256, byte count, dimensions and alpha policy.
8. Requires exact agreement for the accepted technical-review attempt, approval request, approval basis and approval receipt identities.
9. Requires the assembly source to identify `artifact_<approvalReceiptSha256>` for that exact receipt.
10. Emits one self-hashed handoff containing the verified assembly manifest and per-source lineage.

The assembly may use a deliberate subset of the complete package, but every included source must pass the complete chain.

## Retained source lineage

Each handoff source binding retains:

```text
unitId
layerId
layerRole
sourceArtifactId
sourceSha256
sourceBytes
width
height
alpha
targetPath
technicalReviewAttemptSha256
approvalRequestSha256
approvalBasisSha256
approvalReceiptArtifactId
approvalReceiptSha256
```

This creates one continuous identity chain:

```text
source declaration
  -> review-passed candidate
  -> technical-review attempt
  -> named-human decision request
  -> named-human approval receipt
  -> deterministic packaging source
  -> runtime assembly source
```

## Verification sequence

`verifyArtProductionRuntimeAssemblyHandoff` first verifies the submitted handoff itself:

- exact protocol identity;
- exact nested plan, loop, packaging and assembly identities;
- valid runtime-ready assembly manifest;
- source-binding order and uniqueness;
- exact totals;
- closed authority;
- complete handoff self-hash.

It then recompiles the expected handoff from the exact plan, loop, approval receipts, packaging plan and assembly request. A valid handoff must pass both checks.

This distinguishes two failure classes:

- retained-hash mutation fails because the submitted payload no longer matches `handoffSha256`;
- attacker-rehashed mutation fails because the newly self-consistent object is not the deterministic compilation of the governed inputs.

A handoff from another placement layout, source subset, loop, package, receipt set or assembly request cannot be replayed.

## Authority remains closed

The handoff states:

```text
planningOnly: true
artifactRead: false
providerExecution: false
imageMutation: false
creativeDecision: false
packagingExecution: false
automaticAssembly: false
targetRepositoryMutation: false
runtimeActivation: false
gitCommit: false
gitPush: false
deployment: false
publication: false
forcePush: false
```

The retained assembly manifest remains metadata. Existing repository writers, Godot integration, runtime activation, Git publication and deployment continue as separate governed transactions.

## MCP surface

The planning-only MCP tool is:

```text
compile_art_production_runtime_assembly_handoff
```

It can compile a handoff or verify a submitted handoff against the exact retained inputs. It cannot read source bytes, write an atlas or scene, mutate a repository, run Godot, activate a runtime, commit, push, deploy or publish.

## Adversarial regression coverage

The focused package tests prove that:

- an exact approval-bound runtime assembly handoff compiles and verifies;
- the older generic hash-only source shape is rejected by the Art Production handoff;
- an unrelated but self-consistent receipt artifact/hash pair is rejected;
- retained-hash handoff mutation is rejected;
- attacker-rehashed automatic-assembly authority escalation is rejected;
- an otherwise valid handoff cannot be replayed against a changed assembly request.
