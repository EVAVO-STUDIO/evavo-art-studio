# Layered Godot workspace auditor

The layered Godot workspace writer applies exactly seven approved Godot 4.6.2 integration drafts to one explicitly selected repository workspace. The auditor is the separate read-only boundary that verifies the completed write before Godot import, runtime activation, Git commit, push, deployment, or publication.

It is intentionally independent from the writer transaction itself. A successful write receipt is not treated as sufficient evidence that the workspace still contains the approved bytes later.

## Inputs

The auditor requires all four values:

1. the exact self-hashed layered-production Godot integration plan;
2. the exact self-hashed workspace write receipt;
3. the absolute selected workspace path;
4. the explicit `owner/repository` identity.

The plan is revalidated through the same governed writer contract. The auditor then reconstructs the original write request from the receipt request ID and revision and proves that the receipt is bound to that exact request SHA-256 and integration SHA-256.

## Run an audit

```powershell
node scripts/layered-godot-workspace-auditor.mjs audit `
  --plan D:\EVAVO-Evidence\layered-district.godot-plan.json `
  --receipt D:\EVAVO-Evidence\layered-district.write-receipt.json `
  --workspace C:\GitRepos\GodotGameFoundationKit `
  --repository EVAVO-STUDIO/GodotGameFoundationKit
```

The command performs no write. A passing response is a self-hashed audit receipt that records the exact current SHA-256, byte count, and stable filesystem identity of every approved resource.

## What is checked

The auditor fails closed unless all of the following remain true:

- the integration plan self-hash is valid;
- the write receipt self-hash is valid;
- the receipt uses the current writer protocol;
- the receipt request ID, revision, request hash, and integration hash match the reconstructed request;
- the recorded repository matches the explicitly selected repository;
- the recorded workspace matches the selected canonical workspace;
- exactly seven operation records cover the seven integration resources once each;
- every operation retains the approved output path, SHA-256, byte count, and allowed outcome;
- receipt totals match the seven operations and exact integration byte total;
- no cleanup warning remains on the write receipt;
- no write receipt claims Godot, runtime, Git, deployment, publication, or force-push authority;
- every parent directory still exists as a real non-symbolic directory;
- every final target is one stable, singly linked regular file;
- every target byte sequence still exactly equals the approved integration resource;
- no `.evavo-godot-stage-` or `.evavo-godot-backup-` residue remains in any output directory.

The auditor therefore catches both accidental post-write edits and filesystem substitutions that occur after the writer has returned success.

## Audit receipt

A passing receipt contains:

```text
requestSha256
integrationSha256
writeReceiptSha256
repository and canonical workspace
seven exact file identities
seven exact file SHA-256 values
seven exact byte counts
total audited bytes
zero transaction residue
auditedAt
auditSha256
```

Its authority section is entirely read-only. It cannot be used as evidence that Godot was executed, a scene was activated, art was creatively approved, Git history was changed, or a release was published.

## Relationship to the writer

The intended handoff is:

```text
approved layered-production plan
→ Godot integration compiler
→ exact seven-resource integration plan
→ layered Godot workspace writer
→ self-hashed write receipt
→ layered Godot workspace auditor
→ self-hashed audit receipt
→ Godot import and runtime validation
→ repository review
→ explicit Git commit and push
```

The audit step does not replace crash rollback inside the writer. It verifies the durable result visible in the workspace after the write transaction has completed.

## Validation

Run:

```powershell
node scripts/check-layered-godot-workspace-auditor.mjs
```

The adversarial suite covers exact success, target drift, rehashed receipt tampering, transaction residue, repository mismatch, hard-link substitution, and proof that the auditor itself does not rewrite target bytes.
