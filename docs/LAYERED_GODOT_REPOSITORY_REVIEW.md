# Layered Godot repository review

The handoff gate proves that the seven approved Godot resources still match their audited runtime-validation chain. It still does **not** prove that the target Git repository is safe to stage or commit.

The repository review is the next read-only boundary. It captures the complete caller-owned review request as one bounded immutable JSON snapshot before dynamic imports, workspace inspection, handoff recomputation or Git execution. Required top-level fields must be present, unsupported fields are rejected, and accessors, Proxy objects, cycles, exotic prototypes, sparse or extended arrays, symbolic keys, non-finite numbers and non-JSON values fail closed.

Dependency overrides are also captured synchronously as exact enumerable data properties before the first asynchronous boundary. Getters are never invoked. Unknown dependency fields, Proxy functions and incomplete `complete: true` dependency sets are rejected before repository work begins.

## Exact handoff receipt re-admission

A handoff receipt self-hash proves only that the supplied JSON is internally self-consistent. The repository review therefore re-admits the complete handoff receipt as an exact contract before any Git command runs. It requires:

- the current handoff schema, kind and protocol;
- every governed SHA-256 binding, including `admissionAuditSha256` and `currentAuditSha256`;
- the exact repository and workspace target;
- the complete closed admission map, including `immutableInputSnapshot: true`;
- the complete readiness boundary with Git authority false;
- the complete closed authority map with mutation, activation, commit, push, deployment, publication and force-push authority false.

Unknown fields are rejected at every handoff boundary. A correctly rehashed receipt cannot add authority-like data to the target, admission, readiness or authority objects.

The handoff gate performs fresh audits whenever it is recomputed. Their `admissionAuditSha256`, `currentAuditSha256`, `gatedAt` and self-hash values are therefore point-in-time evidence and can legitimately differ between reviews. Repository review compares the stable governed handoff identity while excluding only those four volatile fields. Request, integration, write-receipt, audit-receipt, runtime-validation, target, admission, readiness and authority semantics must still match exactly.

## Read-only Git review

The review re-admits the handoff before and after Git inspection and takes two bounded Git snapshots around the second handoff check. A passing result proves that the selected workspace is the exact repository root, the branch is named, `origin` matches the explicitly selected GitHub repository, the index is empty, and every working-tree change is confined to the exact seven approved handoff resources.

It rejects unrelated tracked edits, unrelated untracked files, staged changes, detached HEAD, wrong repository root, wrong `origin`, ignored handoff outputs, deletes, type changes, conflicts, mid-review Git drift, non-canonical carriage-return resource content, and active `filter`, `working-tree-encoding`, or `ident` attributes that could transform bytes during a later stage operation.

The Git subprocess boundary is intentionally narrow. Only exact read-only argument shapes are allowed. `GIT_OPTIONAL_LOCKS=0` prevents optional index locking, fsmonitor is disabled, and diff inspection uses `--no-ext-diff --no-textconv`. No Git hooks, clean filters, staging commands, commits, pushes, fetches, merges, resets, checkouts, restores, or force operations are part of this review.

A passing receipt records:

```text
immutableInputSnapshot: true
exactHandoffReceiptContract: true
unsupportedInputFieldsRejected: true
dependenciesCapturedBeforeAsyncBoundary: true
repositoryReviewPassed: true
gitCommitAuthorized: false
gitPushAuthorized: false
requiresExplicitGitOperator: true
```

A changed handoff returns `commitRequired: true`, `commitCandidateReady: true`, and `alreadyIntegrated: false`. An idempotent handoff where all seven resources already equal `HEAD` instead returns `commitRequired: false`, `commitCandidateReady: false`, and `alreadyIntegrated: true`. This prevents empty commits.

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
→ immutable read-only handoff promotion gate
→ immutable exact-contract Git repository review
→ separate explicit Git operator
```

The repository-review receipt is self-hashed and records the immutable admission boundary, reviewed `HEAD`, branch, object format, origin identity, Git-attribute fingerprint, working-tree classification and repeated Git snapshot hash. It grants no staging, commit, push, deployment or publication authority.
