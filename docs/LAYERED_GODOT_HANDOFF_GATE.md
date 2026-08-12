# Layered Godot handoff gate

The runtime validator proves that the exact layered-production scene can be loaded and instantiated by Godot 4.6.2 in an isolated temporary project. That evidence is still **not Git authority**.

The handoff gate is the separate read-only promotion boundary between runtime validation and repository review. It re-admits the complete runtime-validation receipt against a fresh audit of the selected target workspace before anything may describe the handoff as ready for repository review.

It rejects unresolved `.evavo-godot-transactions` transactions, target drift since runtime validation, invalid or rehashed runtime evidence, repository mismatch, wrong engine evidence, incomplete sandbox cleanup, missing scene-instantiation proof, and any receipt claiming target mutation, activation, Git, deployment, publication, or force-push authority.

A passing self-hashed gate receipt says:

```text
repositoryReviewReady: true
gitCommitAuthorized: false
gitPushAuthorized: false
requiresExplicitRepositoryReview: true
requiresExplicitGitOperator: true
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
→ read-only handoff promotion gate
→ explicit repository review
→ separate explicit Git operator
```
