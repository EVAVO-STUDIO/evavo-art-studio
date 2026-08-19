# Capability discovery and Automation Fabric runtime truth

Art Studio exposes a canonical, machine-readable capability manifest for Development Studio, Brain and EVAVO GitHub MCP routing.

The manifest is `evavo.capabilities.json`. It declares only capabilities that resolve to real repository-owned `pnpm` entrypoints. The dependency-free validator checks every declared entrypoint against `package.json`, rejects duplicate or unknown capability data, and continuously fails if the live tool surface drifts away from the declaration.

## Authority split

Art Studio owns governed creative work: immutable source-art review, Project Art workspaces, mastering, motion and atlas validation, pixel-font production, delivery optimisation, provider planning, explicitly gated provider execution and repository-owned MCP profiles.

It does **not** own low-level Git mutation or mainline publication.

- **Local Storage** owns host execution, worker routing, workstation acceptance, recoverable cleanup and reviewed downloaded execution.
- **EVAVO GitHub MCP** owns structured low-level repository mutation through its hardened local stdio surface. Its public remote surface remains read-only.
- **Development Studio** owns engineering planning, digest-bound named repository task compilation, exact-state validation orchestration and guarded mainline publication.

A worker receipt, provider receipt or successful validation proves only the operation it records. A worker receipt does not grant publication, provider output does not prove a Git push, and validation does not constitute creative approval or runtime promotion.

## Current Automation Fabric runtime truth

`config/automation-fabric-client-v5.json` binds Art Studio to Local Storage `0.48.9+` and the current schema-3 runtime-truth contract. The reviewed source revisions are pinned to Local Storage `65e048857b8abdcd60c5c7d2596a198f5e73a143` and Development Studio `1f49e423a502d7a49864664a32239683ebdfb4da`.

The current contract requires:

- the `windows-local` pool and `windows-primary` exact node;
- the installed `evavo-local-storage-workstation-accept` command to resolve to **workstation acceptance v8**;
- exact-state repository planning before unmeasured repository execution;
- exact HEAD, status SHA-256 and tracked-script SHA-256 measurement;
- Development Studio's digest-bound named repository task compiler at `packages/runner-fabric/src/repository-task.ts`;
- named task execution bound to the exact task-manifest SHA-256 and exact task SHA-256 from the planner receipt;
- tracked script bytes and stripped credentials before worker execution;
- resource-aware admission, bounded process-tree termination and transient-only retries capped at three attempts;
- unique command IDs, fail-before-execution duplicate issue handling and idempotent terminal receipt replay;
- stable control-plane execution from exact current managed main;
- fast-forward-only managed runtime updates with divergence quarantined rather than overwritten;
- fresh exact-node and capability-routed pool receipts before routine work resumes.

The approved execution roots follow Local Storage's real root policy:

- `C:\GitRepos`;
- `%USERPROFILE%\Downloads` for the user's normal Downloads folder;
- `resolved-beestation-root`, resolved by Local Storage rather than hard-coded; and
- approved discovered external roots.

The retired `C:\Downloads` location is not an active Art Studio execution root, and Art Studio must not assume `C:\BEESTATION`; BeeStation location is resolved by Local Storage.

Source configuration, a queued workflow, task registration or a heartbeat alone are never treated as runtime proof.

## EVA exact-state worker task

`evavo.tasks.json` registers the named repository task `eva-avatar-worker-stack`. The task is a network-disabled tracked PowerShell script at `scripts/Test-EvaAvatarWorkerStack.ps1` and is intended for Local Storage schema-4 exact-state execution through Development Studio's named task compiler.

The worker validates the cross-repository EVA production stack without granting mutation authority. It checks:

- Art Studio's Automation Fabric and EVA dense-motion contracts;
- Avatar Runtime's EVA dense-motion and voice-text tests;
- Development Studio's named repository task compiler and digest fields;
- Local Storage `0.48.9` plus the workstation acceptance v8 installed command;
- EVA Chat compositor v3, nine-node native decode admission, source-over alpha and visibility-aware timing; and
- that the reviewed Local Storage and Development Studio SHAs remain ancestors of the local checked-out heads.

The worker task has no repository write, commit, push, publication, provider mutation or runtime activation authority. Its receipt is validation evidence only and does not grant publication.

## Supervisor-first recovery

`config/automation-fabric-recovery-chain.json` defines the fail-closed recovery order and now requires Local Storage `0.48.9+`:

1. `START-EVAVO-WORKER-FABRIC-SUPERVISOR-FIRST.ps1`
2. `START-EVAVO-AUTOMATION-FABRIC-CERTIFIED.ps1`
3. `ARM-EVAVO-WORKER-FABRIC-REPAIR.ps1` as the create-only delayed fallback

The recovery path must not depend on a mailbox that is itself unavailable. Recovery does not complete until fresh exact-node and pool receipts are observed. The recovery chain cannot commit, push, publish, approve creative work, promote provider output or activate a runtime.

Routine terminal commands must not be delegated to Greg while an automated recovery route remains available.

## PowerShell and process execution

Art Studio automation is **file-first**. Substantial PowerShell must be written as a complete tracked `.ps1` file and invoked non-interactively through the canonical guard. Inline or encoded PowerShell is not the default Art Studio automation route.

For repository work, Art Studio requires read-only measurement first and binds execution to the exact planner receipt. Native processes prefer argv-only execution, explicit native exit codes, bounded output retention and process-tree termination on timeout.

## Publication

Development Studio remains the publication authority through `scripts/mainline-publish.mjs`.

Publication requires declared paths, a live remote-head recheck and remote SHA verification. Force push, automatic merge, automatic rebase, hard reset, Git clean and stash-as-recovery remain forbidden.

Local execution, worker receipts, physical acceptance and provider receipts do **not** grant publication.

## Capability effects

The manifest deliberately separates planning, execution and publication:

- review, planning and validation capabilities declare only the effects they actually perform;
- network-capable provider and production MCP capabilities must declare explicit gates, credentials or per-call confirmation;
- no Art Studio capability may declare the `publish` or `financial` effect;
- Git and mainline publication remain delegated authorities even when local validation has passed.

## Validation

Run the focused contract locally with:

```powershell
node .\scripts\check-art-studio-capability-contract.mjs
node --test .\scripts\test-art-studio-capability-contract.mjs
node .\scripts\check-art-studio-workstation-v5-contract.mjs
node --test .\scripts\test-art-studio-workstation-v5-contract.mjs
```

When Local Storage is reachable, Development Studio should first plan `eva-avatar-worker-stack`, then submit the task using the exact planner-returned HEAD, worktree-status SHA-256, task-manifest SHA-256 and task SHA-256. The resulting worker receipt is evidence of that exact execution only.

The dedicated GitHub Actions workflow runs the dependency-light source checks without installing dependencies and verifies that validation leaves the repository unchanged. Hosted validation is read-only; a successful workflow still does not grant publication or runtime activation.
