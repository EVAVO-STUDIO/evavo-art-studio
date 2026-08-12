# Layered Godot workspace writer

The layered-production compiler already produces a deterministic Godot 4.6.2 integration plan containing seven exact resource drafts:

1. the `.tscn` scene draft
2. the route graph
3. the placement resource
4. the animation resource
5. the camera resource
6. the pixel-import policy
7. the integration manifest

Those plans intentionally have no repository-write authority. This writer is the separate explicit boundary that can apply one approved, blocker-free `runtime-candidate` plan to one selected repository working tree.

## What it accepts

The writer accepts only:

```text
evavo.layered-production.godot-integration-plan
protocol 2026-08-11.1
Godot 4.6.2
exactly seven declared resources
runtime-candidate assembly
handoffReady=true
reviewOnly=false
zero readiness blockers
```

The plan must retain its exact canonical self-hash. Every resource must retain its declared UTF-8 bytes, byte count and SHA-256 identity. Every write intent must be an exact copy of one declared resource and must name the repository selected at invocation time.

The output paths are checked against the plan's declared outputs. JSON drafts must remain valid JSON, the scene draft must remain a `.tscn` text resource, and non-scene runtime resources must stay under the declared runtime root.

## Verify without writing

```powershell
node scripts/layered-godot-workspace-writer.mjs verify `
  --plan D:\EVAVO-Evidence\layered-district.godot-plan.json `
  --workspace C:\GitRepos\GodotGameFoundationKit `
  --repository EVAVO-STUDIO/GodotGameFoundationKit
```

Verification emits the bound request hash, integration hash, repository, workspace, resource count and total bytes. It performs no file write.

## Apply the exact drafts

```powershell
node scripts/layered-godot-workspace-writer.mjs apply `
  --plan D:\EVAVO-Evidence\layered-district.godot-plan.json `
  --workspace C:\GitRepos\GodotGameFoundationKit `
  --repository EVAVO-STUDIO/GodotGameFoundationKit `
  --request-id layered-district-runtime-write `
  --revision 1.0.0
```

Application produces a self-hashed receipt with one outcome per resource:

```text
created
replaced
unchanged
```

An identical replay is read-only and reports seven `unchanged` outcomes.

## Filesystem protections

The writer fails closed for:

- absolute, traversing, non-portable or repository-control output paths
- Windows-reserved path components
- symbolic workspace roots, symbolic parent directories and symbolic targets
- non-regular targets and multiply linked targets
- plan, resource, byte-count or SHA-256 drift
- target repository mismatch
- stale target changes between preflight and commit
- targets that appear during an exclusive installation
- parent-directory replacement during the transaction

Changed resources are first written to exclusive same-directory stage files. Existing targets are moved to unique backups only after preflight is complete. A stage is installed through an exclusive hard-link operation, then its staging name is removed. The writer re-reads every final target before transaction finalisation.

If any resource cannot be installed safely, every earlier writer-owned replacement is rolled back in reverse order. Externally changed files are never overwritten merely to complete rollback. Hidden stage and backup files are identity checked before cleanup.

## Authority boundary

The writer may change the selected repository working tree only. It does not:

```text
run Godot
activate runtime content
approve art
promote candidates
create a Git commit
push Git history
deploy
publish
force push
```

Repository review, Godot import, scene loading, runtime testing, visual approval, Git commit and Git push remain separate explicit steps.

## Validation

Run the complete focused contract and adversarial suite with:

```powershell
node scripts/check-layered-godot-workspace-writer.mjs
```

The suite proves exact first-write behavior, idempotent replay, stale-file replacement, plan tamper rejection, review-only rejection, repository binding, traversal rejection, symbolic-parent rejection, hard-link rejection and reverse-order rollback after a late target change.
