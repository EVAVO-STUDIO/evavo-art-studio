# EVA dense-motion workstation task

The EVA dense-motion family `eva-20260809-153620` has seven source frames that remain pending in the original workstation preflight: `1`, `2`, `3`, `7`, `8`, `9`, and `10`. Art Studio exposes one tracked, read-only Windows validation task for that source-preflight boundary at `scripts/Invoke-EvaDenseMotionWorkstationValidation.ps1`.

The later v2 release policy requires **ten new final dense masters**, including remasters for the currently live rollback ordinals `4`, `5`, and `6`. The workstation therefore reports two distinct truths:

- seven pending source frames remain the read-only v1 source-preflight set;
- ten new final dense masters are required by `evavo.project-art-eva-dense-motion-ten-master-program.v2`, with `4/5/6` marked as fallback remasters.

The task validates both contracts. It does not generate, master, approve, promote, upload, publish, deploy or activate media.

## Ten-master planning surface

The task configuration exposes `tenMasterPlanning` with:

- compiler: `scripts/compile-project-art-eva-dense-motion-ten-master.mjs`;
- final ordinals: `1` through `10`;
- required new master count: `10`;
- current fallback ordinals: `4`, `5`, `6`;
- fallback remaster ordinals: `4`, `5`, `6`;
- legacy fallback may satisfy final master gate: `false`;
- atomic ten-master activation required: `true`;
- execution by this workstation task: `false`.

The tracked PowerShell validation runs the ten-master compiler syntax check and deterministic regressions, then reports that planning contract in its receipt. That receipt is evidence that the plan was validated; it is **not** evidence that mastering, Cloudinary upload, creative approval or Runtime activation occurred.

## Two-stage worker route

Development Studio owns request compilation. For a workstation state that has not already been measured, compile a planner request first with `scripts/compile-automation-fabric-two-stage-request.mjs` using:

- repository: `EVAVO-STUDIO/evavo-art-studio`
- script path: `scripts/Invoke-EvaDenseMotionWorkstationValidation.ps1`
- target: `pool`
- required capabilities: `powershell`, `node`, `git`, `art-pipeline-validation`

The planner action is `storage.repository_task_plan`. Its successful schema-2 receipt must bind the exact repository HEAD, worktree-status SHA-256 and tracked script SHA-256. Only then may Development Studio compile the execution request for `storage.repository_task_run` using that planner receipt.

The execution request remains read-only. The worker has no repository write, commit, push, publication, provider-mutation, candidate-promotion, creative-approval, deployment or Runtime-activation authority.

## Runtime prerequisites

Routine execution requires EVAVO Local Storage `0.48.9` or newer and an accepted `windows-local` worker runtime. Source configuration, task registration or a heartbeat alone does not prove the worker is usable. Reachability requires correlated request/receipt evidence; physical Windows acceptance is the stronger runtime proof.

The canonical workstation command is `evavo-local-storage-workstation-accept`, which resolves to `evavo_local_storage.workstation_acceptance_v4:main`. Physical acceptance is performed by Local Storage's `scripts/Test-EvavoAutomationFabricPhysical.ps1`.

## Validation performed

The tracked PowerShell task uses strict mode and explicit native exit-code handling. It reads the exact Git HEAD and worktree status, then runs:

```text
node --check scripts/check-project-art-eva-dense-motion-work-order.mjs
node scripts/check-project-art-eva-dense-motion-work-order.mjs
node --check scripts/compile-project-art-eva-dense-motion-ten-master.mjs
node --test scripts/test-project-art-eva-dense-motion-ten-master.mjs
node scripts/check-art-studio-workstation-v5-contract.mjs
node --test scripts/test-art-studio-workstation-v5-contract.mjs
```

The v1 dense-motion guard verifies the exact seven pending source jobs, all ten receipt slots, alpha and identity gates, immutable delivery requirements and final-to-first loop closure while retaining the existing three-frame production fallback. The v2 ten-master regression separately proves that the final production family requires ten new create-only dense masters and that the old `4/5/6` identity-motion-v3 assets cannot satisfy the final gate.

## Publication boundary

A successful planner receipt is a measurement. A successful worker receipt proves that one worker validation. A physical-acceptance receipt proves workstation capability. None of those are Git publication evidence, mastering evidence or creative approval.

Any later repository publication remains governed by Development Studio `scripts/mainline-publish.mjs`, with declared paths, exact remote-head recheck, remote SHA verification and no force push, automatic merge or automatic rebase.
