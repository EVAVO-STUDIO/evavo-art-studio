# Art Studio Automation Fabric v5

Art Studio uses EVAVO Local Storage as the canonical Windows execution runtime and Development Studio as the guarded mainline publication authority. The v5 contract separates source configuration, measured workstation state, execution, creative approval and publication so that one successful step can never be misrepresented as another.

## Runtime truth

Routine Art Studio worker use requires real runtime evidence. Configuration, a queued workflow, task registration, or a heartbeat by itself is not execution proof. The accepted runtime states are `reachable` and `physically-accepted`, each backed by correlated receipts.

The reviewed Local Storage floor is `0.42.1`. Its canonical `evavo-local-storage-workstation-accept` command resolves to the resource-aware v4 implementation. Physical acceptance is performed by `scripts/Test-EvavoAutomationFabricPhysical.ps1` on Windows and proves real PowerShell, Python, Node, Bash, archive, BeeStation and recoverable-cleanup behavior without granting publication or provider-promotion authority.

## Two-stage repository execution

For repository work whose current workstation state has not already been measured, Art Studio must first request the read-only `storage.repository_task_plan` action. The planner receipt must measure:

- exact repository HEAD;
- exact worktree-status SHA-256; and
- exact tracked script SHA-256.

Only then may `storage.repository_task_run` execute, bound to that planner receipt. The execution still strips credentials, uses exact tracked script bytes, keeps retries bounded to transient failures, and cannot commit, push or publish.

This is particularly important for long-running image mastering, sequence validation and provider preparation because a job must not execute against a repository that changed after planning.

## Resource-aware execution

The Windows runtime admits heavy work only when sufficient resources are available. It records baseline and final resource snapshots, performs bounded process-tree termination, runs cleanup even after failures, and forbids blind retries after training crashes. GPU reset and page-file-as-VRAM behavior remain prohibited.

Art Studio can route image-toolchain, art-pipeline validation and explicitly authorized provider-runtime work through this execution fabric. A worker receipt proves only that worker operation. It is not creative approval, asset promotion, Runtime activation or Git publication evidence.

## Publication

Development Studio remains the publication authority through `scripts/mainline-publish.mjs`. Mainline publication requires declared paths, an exact remote-head recheck and remote SHA verification. Force push, automatic merge, automatic rebase, hard reset, Git clean and stash-as-recovery are not permitted by this contract.

## Recovery

Routine commands must not be delegated to Greg when the worker fabric is accepted. If a receipt is missing or stale, use Local Storage recovery and physical acceptance before submitting more routine work. Do not enqueue mailbox repair commands into an unavailable mailbox. Manual terminal relay is a final fallback only after remote recovery routes fail.

## Validation

Run the dependency-free contract locally with:

```powershell
node .\scripts\check-art-studio-workstation-v5-contract.mjs
node --test .\scripts\test-art-studio-workstation-v5-contract.mjs
```

The path-scoped GitHub workflow runs the same tests with read-only repository permissions and confirms validation leaves source unchanged.
