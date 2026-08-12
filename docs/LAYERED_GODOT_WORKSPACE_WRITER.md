# Layered Godot workspace writer

The layered-production compiler produces a deterministic Godot 4.6.2 integration plan containing exactly seven resource drafts. The workspace writer is the separate explicit boundary that may apply those exact drafts to one selected repository working tree.

Protocol `2026-08-12.2` keeps the original exact-byte, repository-bound writer contract and adds durable recovery for process interruption or machine termination.

## Accepted handoff

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

The integration plan retains its canonical self-hash. Every resource retains its UTF-8 byte count and SHA-256 identity. Every write intent must be an exact copy of one declared resource and must name the repository selected at invocation time.

## Commands

Verify without writing:

```powershell
node scripts/layered-godot-workspace-writer.mjs verify `
  --plan D:\EVAVO-Evidence\layered-district.godot-plan.json `
  --workspace C:\GitRepos\GodotGameFoundationKit `
  --repository EVAVO-STUDIO/GodotGameFoundationKit
```

Apply the exact drafts:

```powershell
node scripts/layered-godot-workspace-writer.mjs apply `
  --plan D:\EVAVO-Evidence\layered-district.godot-plan.json `
  --workspace C:\GitRepos\GodotGameFoundationKit `
  --repository EVAVO-STUDIO/GodotGameFoundationKit `
  --request-id layered-district-runtime-write `
  --revision 1.0.0
```

Recover an interrupted transaction without the original plan file:

```powershell
node scripts/layered-godot-workspace-writer.mjs recover `
  --workspace C:\GitRepos\GodotGameFoundationKit `
  --repository EVAVO-STUDIO/GodotGameFoundationKit
```

A new apply fails closed with `LAYERED_GODOT_WRITE_RECOVERY_REQUIRED` while any outstanding transaction remains.

## Durable transaction journal

Before the writer creates a resource stage or changes an output target, it creates one repository-local transaction beneath:

```text
.evavo-godot-transactions/<transaction-id>.active/
```

That internal root is reserved and cannot be selected by an integration-plan output path.

The writer publishes three immutable, self-hashed journal boundaries with atomic record installation:

1. **intent**: exact request SHA-256, integration SHA-256, repository, canonical workspace, seven resource identities, and the pre-write parent-directory baseline;
2. **prepared**: exact per-resource outcome, stage identity, prior target identity when present, and deterministic backup name;
3. **finalizing**: an explicit durable commit boundary bound to the exact intent and prepared journal hashes.

Resource stages and replacement backups remain inside the transaction directory. They are not scattered across the game asset folders.

### Why the finalizing boundary matters

Before `finalizing.json` exists, recovery returns the selected repository to the state that existed before writer-owned target mutation. Writer-created targets are removed only when ownership is proven through the retained stage inode. Replaced originals are restored only from the exact identity-bound backup.

After `finalizing.json` exists, the transaction is committed. Recovery does not roll it backwards. It verifies all seven committed resource SHA-256 values and byte counts, removes only the exact retained stages and backups, re-proves singly linked final targets, and completes the transaction forward.

This means process interruption cannot leave the writer guessing whether it should roll back or finish.

## Process interruption cases

The adversarial suite covers interruption:

```text
after durable intent
after durable prepared state
after replacement backup movement
after atomic target linking
after durable finalizing
```

It also verifies that:

- a new write is blocked until recovery completes;
- repository mismatch cannot recover another repository's transaction;
- an external file that appears before a writer-owned create is preserved rather than deleted;
- an external change that occurs before a replacement starts is preserved while earlier writer-owned mutations are rolled back;
- writer-owned targets are removed only when the retained transaction stage proves inode ownership;
- post-finalizing recovery completes the approved resources forward rather than reverting them.

## Filesystem protections

The writer and recovery path fail closed for:

- absolute, traversing, non-portable or repository-control output paths;
- the reserved `.evavo-godot-transactions` internal root;
- Windows-reserved path components;
- symbolic workspace roots, symbolic parent directories and symbolic targets;
- non-regular targets and multiply linked ordinary targets;
- plan, resource, byte-count or SHA-256 drift;
- target repository mismatch;
- stale target changes between preflight and mutation;
- targets that appear during atomic installation;
- altered journal records, stages or backups;
- unexpected transaction-directory entries.

Journal records are written through an exclusive temporary file, flushed, atomically hard-linked into their final immutable record name, and directory-synced before the writer proceeds.

Changed resources are staged in the transaction directory and installed through a hard link into the target path. Replacement originals are moved into the same transaction directory before installation. The retained stage is intentionally kept until the durable finalizing boundary so pre-finalizing recovery can prove ownership of an installed target.

## Receipts

A successful apply emits a self-hashed write receipt containing:

```text
requestSha256
integrationSha256
transactionId
recoveryState=clean
seven resource outcomes
prior identities for non-created targets
repository and canonical workspace
appliedAt
authority boundary
receiptSha256
```

Recovery emits its own self-hashed receipt describing each recovered transaction and whether it was:

```text
discarded-incomplete-preparation
rolled-back
rolled-back-external-preserved
completed-forward
```

Neither receipt claims that Godot has run or that the written resources were activated.

## Authority boundary

The writer may modify the selected repository working tree and may restore or complete its own durably journaled transaction.

It does not:

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

Godot import, scene loading, runtime validation, repository review, Git commit, Git push and deployment remain separate explicit steps.

## Validation

Run:

```powershell
node scripts/check-layered-godot-workspace-writer.mjs
```

The focused suite verifies ordinary application, replay and replacement plus durable interruption/recovery boundaries, repository binding, reserved paths, symbolic paths, hard-link rejection, late external changes and current authority limits.
