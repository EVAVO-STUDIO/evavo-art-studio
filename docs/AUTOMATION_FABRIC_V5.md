# Art Studio Automation Fabric v5

Art Studio uses EVAVO Local Storage as the canonical Windows execution runtime and Development Studio as the guarded mainline publication authority. The v5 contract separates source configuration, measured workstation state, execution, creative approval and publication so that one successful step can never be misrepresented as another.

## Runtime truth

Routine Art Studio worker use requires real runtime evidence. Configuration, a queued workflow, task registration, or a heartbeat by itself is not execution proof. The accepted runtime states are `reachable` and `physically-accepted`, each backed by correlated receipts.

The reviewed Local Storage floor is `0.48.9`. Its canonical `evavo-local-storage-workstation-accept` command resolves to workstation acceptance v8. Physical acceptance is performed by `scripts/Test-EvavoAutomationFabricPhysical.ps1` on Windows and proves real PowerShell, Python, Node, Bash, archive, BeeStation and recoverable-cleanup behavior without granting publication or provider-promotion authority.

The reviewed runtime revisions are pinned in `config/automation-fabric-client-v5.json`. A newer local checkout is acceptable only when the reviewed revision remains an ancestor and the exact-state planner measures the actual current repository state before execution.

## Digest-bound named repository execution

Development Studio's current runner fabric exposes the named repository task compiler at `packages/runner-fabric/src/repository-task.ts`. For an unmeasured repository task, Art Studio must first request the read-only `storage.repository_task_plan` action.

The planner receipt binds:

- exact repository HEAD;
- exact worktree-status SHA-256;
- exact `evavo.tasks.json` manifest SHA-256; and
- exact named task SHA-256.

Only then may `storage.repository_task_run` execute, carrying those exact values back to Local Storage. The execution strips credentials, uses exact tracked script bytes, keeps retries bounded to transient failures, and cannot commit, push or publish.

Art Studio registers `eva-avatar-worker-stack` as a network-disabled tracked PowerShell named task. That task validates the EVA production path across Art Studio, Avatar Runtime, Development Studio, Local Storage and `next-website`, including EVA dense-motion contracts, voice normalization, compositor v3, nine native image nodes, source-over alpha and visibility-aware timing.

The task is validation-only. It cannot mutate source, approve art, promote provider output, commit, push, publish or activate a runtime.

## Resource-aware execution

The Windows runtime admits heavy work only when sufficient resources are available. Workstation acceptance v8 retains the v4 resource-aware contract and subsequent hardened phases. It records bounded resource evidence, requires managed runtime truth, performs process-tree termination on timeout, preserves recoverable cleanup boundaries and forbids blind retry behavior after non-transient failures.

Art Studio can route image-toolchain, art-pipeline validation and explicitly authorized provider-runtime work through this execution fabric. A worker receipt proves only that worker operation. It is not creative approval, asset promotion, Runtime activation or Git publication evidence.

## Publication

Development Studio remains the publication authority through `scripts/mainline-publish.mjs`. Mainline publication requires declared paths, an exact remote-head recheck and remote SHA verification. Force push, automatic merge, automatic rebase, hard reset, Git clean and stash-as-recovery are not permitted by this contract.

## Recovery

Routine commands must not be delegated to Greg when the worker fabric is accepted. If a receipt is missing or stale, use the supervisor-first Local Storage recovery chain and physical acceptance before submitting more routine work. Do not enqueue mailbox repair commands into an unavailable mailbox. Manual terminal relay is a final fallback only after remote recovery routes fail.

## Validation

Run the dependency-free source contract locally with:

```powershell
node .\scripts\check-art-studio-capability-contract.mjs
node --test .\scripts\test-art-studio-capability-contract.mjs
node .\scripts\check-art-studio-workstation-v5-contract.mjs
node --test .\scripts\test-art-studio-workstation-v5-contract.mjs
```

When the Local Storage worker is reachable, plan `eva-avatar-worker-stack` first and then execute it only with the exact planner-returned HEAD, status SHA-256, task-manifest SHA-256 and task SHA-256.

The path-scoped GitHub workflow runs the dependency-light source checks with read-only repository permissions and parses the tracked EVA PowerShell task on Windows. Hosted validation is not worker-runtime proof and never grants publication authority.
