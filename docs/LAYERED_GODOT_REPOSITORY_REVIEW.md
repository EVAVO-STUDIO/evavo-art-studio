# Layered Godot repository review

The handoff gate proves that the seven approved Godot resources still match their audited runtime-validation chain. It still does **not** prove that the target Git repository is safe to stage or commit.

The repository review is the next read-only boundary. It re-admits the handoff before and after Git inspection and takes two bounded Git snapshots around the second handoff check. A passing result proves that the selected workspace is the exact repository root, the branch is named, `origin` matches the explicitly selected GitHub repository, the index is empty, and every working-tree change is confined to the exact seven approved handoff resources.

It rejects unrelated tracked edits, unrelated untracked files, staged changes, detached HEAD, wrong repository root, wrong `origin`, ignored handoff outputs, deletes, type changes, conflicts, mid-review Git drift, non-canonical carriage-return resource content, and active `filter`, `working-tree-encoding`, or `ident` attributes that could transform bytes during a later stage operation.

The Git subprocess boundary is intentionally narrow. Only exact read-only argument shapes are allowed. `GIT_OPTIONAL_LOCKS=0` prevents optional index locking, fsmonitor is disabled, and diff inspection uses `--no-ext-diff --no-textconv`. No Git hooks, clean filters, staging commands, commits, pushes, fetches, merges, resets, checkouts, restores, or force operations are part of this review.

A changed handoff can return:

```text
repositoryReviewPassed: true
commitRequired: true
commitCandidateReady: true
alreadyIntegrated: false
gitCommitAuthorized: false
gitPushAuthorized: false
requiresExplicitGitOperator: true
```

An idempotent handoff where all seven resources already equal `HEAD` instead returns `commitRequired: false`, `commitCandidateReady: false`, and `alreadyIntegrated: true`. This prevents empty commits.

## CLI

```powershell
node scripts/layered-godot-repository-review.mjs review `
  --plan D:\EVAVO-Evidence\layered-district.godot-plan.json `
  --receipt D:\EVAVO-Evidence\layered-district.write-receipt.json `
  --audit-receipt D:\EVAVO-Evidence\layered-district.audit-receipt.json `
  --runtime-receipt D:\EVAVO-Evidence\layered-district.runtime-receipt.json `
  --handoff-receipt D:\EVAVO-Evidence\layered-district.handoff-receipt.json `
  --workspace C:\GitRepos\GodotGameFoundationKit `
  --repository EVAVO-STUDIO/GodotGameFoundationKit
```

## Production chain

```text
approved art
→ Godot integration plan
→ exact workspace write
→ crash recovery if required
→ read-only workspace audit
→ sandboxed Godot 4.6.2 runtime validation
→ read-only handoff promotion gate
→ read-only Git repository review
→ separate explicit Git operator
```

The repository-review receipt is self-hashed and records the reviewed `HEAD`, branch, object format, origin identity, Git-attribute fingerprint, working-tree classification and repeated Git snapshot hash. It grants no staging, commit, push, deployment or publication authority.
