# Layered Godot Git operator

The repository-review gate proves that a validated seven-resource Godot handoff is the only intended change in the selected Git working tree. That receipt still does **not** create Git authority by itself.

The Git operator is the next explicit boundary. It accepts the complete handoff evidence plus the current repository-review receipt and an explicit authorization object that must be exactly:

```text
commit: true
push: false
forcePush: false
```

A push is deliberately outside this operator. Successful commit creation therefore does not imply remote publication.

## Immutable admission and ownership

Before any dynamic import, workspace inspection, review recomputation or Git command, the operator captures the complete caller input and dependency override object synchronously.

Dependency overrides must be a plain non-Proxy object with only the documented fields. Accessors are rejected without being invoked, symbolic and unsupported fields are rejected, `complete` must be boolean, and every resolved executable dependency must be a non-Proxy function. Mutating the original dependency object after the API call cannot replace the captured verifier, reviewer, filesystem or Git functions.

The operator also takes ownership of every value that can cross an asynchronous or mutation boundary:

1. the workspace-root result is reduced to immutable `path` and `realPath` data properties;
2. the writer-verifier result is inspected without invoking accessors;
3. all seven verifier-owned resource buffers are copied before the asynchronous repository review;
4. shared-memory buffers are rejected;
5. every copied resource must agree across UTF-8 content, byte count and SHA-256;
6. the recomputed repository-review receipt is captured as immutable JSON before semantic comparison;
7. stable filesystem read results and Git subprocess results are copied and validated before use.

This means a caller cannot change approved bytes after verification and have those later bytes staged or committed. The operator uses only its private exact-byte copies for blob creation, index verification and committed-tree verification.

These admission changes do not alter the receipt protocol or grant broader authority. The operator protocol remains `2026-08-13.1`, and push, deployment, publication and force push remain false.

## Exact commit transaction

Before touching Git state, the operator captures its full input as one bounded immutable JSON snapshot and re-runs the repository review. The supplied review must still match semantically, including the reviewed `HEAD`, branch, origin, seven-resource classification and false Git authority.

For a changed handoff it then:

1. captures the exact pre-operator index entry for each reviewed changed resource;
2. writes each approved byte sequence directly as a Git blob with `git hash-object -w --stdin`;
3. stages only that exact blob with `git update-index --add --cacheinfo`;
4. never uses `git add -A`, `git add .`, pathname-glob staging or a clean filter;
5. rechecks `filter`, `working-tree-encoding` and `ident` attributes;
6. proves `HEAD` and branch still equal the reviewed identities before comparing the staged index;
7. proves the index contains exactly the reviewed changed resource paths;
8. reads each staged blob and working-tree file back and compares it byte-for-byte with the owned approved integration resource;
9. requires no unrelated unstaged or untracked work;
10. commits with an empty temporary `core.hooksPath`, `core.fsmonitor=false`, signing disabled, `--no-verify`, `--no-gpg-sign`, and `--cleanup=verbatim`;
11. proves the commit message exactly equals the authorized single line;
12. proves the new commit is one direct child of the reviewed `HEAD` on the reviewed branch;
13. proves the commit changes exactly the reviewed path set;
14. proves all seven `HEAD:path` blobs equal the owned approved integration bytes; and
15. requires a clean repository immediately afterward.

## Rollback safety

Pre-commit failure does not use a broad reset. The operator retained every changed path's exact index preimage before staging.

Rollback first proves that each current index entry still contains the blob written by this operator. Only then does it restore the exact old index entry, or remove the index entry when the path was originally untracked. Working-tree files are never rewritten during rollback.

If another process changes the same index path after the operator stages it, rollback refuses to overwrite that concurrent state. If the commit command moves `HEAD` but final commit verification cannot complete, automatic rollback is also refused and the result fails closed as an uncertain commit state.

## Already integrated handoffs

When repository review proves all seven resources already equal `HEAD`, the operator produces an `already-integrated` receipt and creates no empty commit.

## CLI

```powershell
node scripts/layered-godot-git-operator.mjs commit `
  --plan D:\EVAVO-Evidence\layered-district.godot-plan.json `
  --receipt D:\EVAVO-Evidence\layered-district.write-receipt.json `
  --audit-receipt D:\EVAVO-Evidence\layered-district.audit-receipt.json `
  --runtime-receipt D:\EVAVO-Evidence\layered-district.runtime-receipt.json `
  --handoff-receipt D:\EVAVO-Evidence\layered-district.handoff-receipt.json `
  --review-receipt D:\EVAVO-Evidence\layered-district.repository-review.json `
  --workspace C:\GitRepos\GodotGameFoundationKit `
  --repository EVAVO-STUDIO/GodotGameFoundationKit `
  --message "feat(art): integrate approved district resources"
```

The CLI uses stable regular-file reads for all evidence files. It always supplies commit-only authorization; there is no CLI push flag.

## Production chain

```text
approved layered art
→ exact Godot integration plan
→ durable workspace write
→ crash recovery if required
→ read-only workspace audit
→ sandboxed Godot 4.6.2 validation
→ read-only handoff promotion gate
→ read-only Git repository review
→ explicit commit-only Git operator
→ separate push review / push authority
```

## Authority boundary

A successful changed-handoff receipt can truthfully record Git object, index, commit and local branch-ref mutation because those operations occurred. It always records all of the following as false:

```text
target repository working-tree mutation
Git hook execution
Git push
deployment
publication
force push
```

The operator does not fetch, pull, merge, rebase, checkout, restore, amend, tag, deploy or publish. Remote movement remains a separate governed boundary.
