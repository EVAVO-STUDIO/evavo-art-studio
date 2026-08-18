# EVA dense-motion workstation task

The EVA dense-motion family `eva-20260809-153620` has seven pending mastering ordinals: `1`, `2`, `3`, `7`, `8`, `9`, and `10`. Art Studio now exposes one tracked, read-only Windows validation task for that family at `scripts/Invoke-EvaDenseMotionWorkstationValidation.ps1`.

The task validates the existing dense-motion work-order and release-evidence contracts plus the Art Studio Automation Fabric v5 runtime-truth contract. It does not generate, approve, promote, upload, publish, deploy or activate media.

## Two-stage worker route

Development Studio owns request compilation. For a workstation state that has not already been measured, compile a planner request first with `scripts/compile-automation-fabric-two-stage-request.mjs` using:

- repository: `EVAVO-STUDIO/evavo-art-studio`
- script path: `scripts/Invoke-EvaDenseMotionWorkstationValidation.ps1`
- target: `pool`
- required capabilities: `powershell`, `node`, `git`, `art-pipeline-validation`

The planner action is `storage.repository_task_plan`. Its successful schema-2 receipt must bind the exact repository HEAD, worktree-status SHA-256 and tracked script SHA-256. Only then may Development Studio compile the execution request for `storage.repository_task_run` using that planner receipt.

The execution request remains read-only. The worker has no repository write, commit, push, publication, provider-mutation, candidate-promotion, creative-approval, deployment or Runtime-activation authority.

## Runtime prerequisites

Routine execution requires EVAVO Local Storage `0.42.1` or newer and an accepted `windows-local` worker runtime. Source configuration, task registration or a heartbeat alone does not prove the worker is usable. Reachability requires correlated request/receipt evidence; physical Windows acceptance is the stronger runtime proof.

The canonical workstation command is `evavo-local-storage-workstation-accept`, which resolves to `evavo_local_storage.workstation_acceptance_v4:main`. Physical acceptance is performed by Local Storage's `scripts/Test-EvavoAutomationFabricPhysical.ps1`.

## Validation performed

The tracked PowerShell task uses strict mode and explicit native exit-code handling. It reads the exact Git HEAD and worktree status, then runs:

```text
node --check scripts/check-project-art-eva-dense-motion-work-order.mjs
node scripts/check-project-art-eva-dense-motion-work-order.mjs
node scripts/check-art-studio-workstation-v5-contract.mjs
node --test scripts/test-art-studio-workstation-v5-contract.mjs
```

The dense-motion guard itself runs the focused work-order and release-evidence tests and verifies the exact seven pending jobs, all ten receipt slots, alpha and identity gates, immutable delivery requirements and final-to-first loop closure while retaining the existing three-frame production fallback.

## Publication boundary

A successful planner receipt is a measurement. A successful worker receipt proves that one worker execution. A physical-acceptance receipt proves workstation capability. None of those are Git publication evidence or creative approval.

Any later repository publication remains governed by Development Studio `scripts/mainline-publish.mjs`, with declared paths, exact remote-head recheck, remote SHA verification and no force push, automatic merge or automatic rebase.
