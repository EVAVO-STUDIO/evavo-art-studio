# Layered Godot handoff gate

The runtime validator proves that the exact layered-production scene can be loaded and instantiated by Godot 4.6.2 in an isolated temporary project. That evidence is still **not Git authority**.

The handoff gate is the separate read-only promotion boundary between runtime validation and repository review. It re-admits the runtime-validation receipt against the selected target workspace before anything may describe the handoff as ready for repository review.

It rejects unresolved `.evavo-godot-transactions` transactions, target drift since runtime validation, malformed or rehashed runtime evidence, repository mismatch, wrong engine evidence, incomplete sandbox cleanup, missing scene-instantiation proof, and any receipt claiming target mutation, activation, Git, deployment, publication, or force-push authority.

## Strict receipt admission

A receipt self-hash is integrity evidence. It proves that the supplied JSON is internally self-consistent; it does not make arbitrary JSON fields trusted evidence or authority.

The gate therefore re-admits both the audit receipt and runtime-validation receipt as exact contracts. Required fields must be present, unsupported fields are rejected, and every nested object has a closed field set. This includes:

- audit target, files, filesystem identities, totals and read-only authority;
- runtime target and repository identity;
- exact Godot executable evidence and filesystem identity;
- isolated sandbox evidence;
- execution result and scene-instantiation evidence;
- the complete runtime authority map.

A correctly rehashed receipt is rejected if it adds an invented field such as `repositoryWriteAuthorized`, hides a missing cleanup field, changes a known false-authority field, or adds authority-like data inside the target, engine, execution or evidence objects.

## Two-phase target stability

One fresh audit is performed before runtime-receipt admission. After the receipt has been fully validated, the gate checks outstanding transactions again and performs a second fresh audit.

The stable audit payloads must match exactly. A change to any approved resource byte count, SHA-256, filesystem identity, repository target, integration identity, write receipt identity, totals or authority boundary causes `LAYERED_GODOT_HANDOFF_TARGET_DRIFT`.

The gate then checks outstanding transactions once more before issuing its receipt. This closes mutations that occur during receipt admission while keeping the boundary read-only. The resulting receipt remains point-in-time evidence; it does not lock the repository or authorize a later Git action.

A passing self-hashed gate receipt says:

```text
repositoryReviewReady: true
gitCommitAuthorized: false
gitPushAuthorized: false
requiresExplicitRepositoryReview: true
requiresExplicitGitOperator: true
```

It also records:

```text
exactAuditReceiptContract: true
exactRuntimeReceiptContract: true
unsupportedReceiptFieldsRejected: true
targetStableAcrossGate: true
```

That distinction is deliberate. The gate proves that the current handoff can proceed to repository review. It does not create a commit, push a branch, activate a runtime, deploy, or publish.

## CLI

```powershell
node scripts/layered-godot-handoff-gate.mjs gate `
  --plan D:\EVAVO-Evidence\layered-district.godot-plan.json `
  --receipt D:\EVAVO-Evidence\layered-district.write-receipt.json `
  --audit-receipt D:\EVAVO-Evidence\layered-district.audit-receipt.json `
  --runtime-receipt D:\EVAVO-Evidence\layered-district.runtime-receipt.json `
  --workspace C:\GitRepos\GodotGameFoundationKit `
  --repository EVAVO-STUDIO/GodotGameFoundationKit
```

## Handoff chain

```text
approved art
→ Godot integration plan
→ exact workspace write
→ read-only workspace audit
→ sandboxed Godot 4.6.2 runtime validation
→ exact receipt re-admission
→ second fresh audit
→ read-only handoff promotion gate
→ explicit repository review
→ separate explicit Git operator
```
