# Capability discovery and Automation Fabric runtime truth

Art Studio exposes a canonical, machine-readable capability manifest for Development Studio, Brain and EVAVO GitHub MCP routing.

The manifest is `evavo.capabilities.json`. It declares only capabilities that resolve to real repository-owned `pnpm` entrypoints. The dependency-free validator checks every declared entrypoint against `package.json`, rejects duplicate or unknown capability data, and continuously fails if the live tool surface drifts away from the declaration.

## Authority split

Art Studio owns governed creative work: immutable source-art review, Project Art workspaces, mastering, motion and atlas validation, pixel-font production, delivery optimisation, provider planning, explicitly gated provider execution and repository-owned MCP profiles.

It does **not** own low-level Git mutation or mainline publication.

- **Local Storage** owns host execution, worker routing, workstation acceptance, recoverable cleanup and reviewed downloaded execution.
- **EVAVO GitHub MCP** owns structured low-level repository mutation through its hardened local stdio surface. Its public remote surface remains read-only.
- **Development Studio** owns engineering planning, exact-state validation orchestration and guarded mainline publication.

A worker receipt, provider receipt or successful validation proves only the operation it records. A worker receipt does not grant publication, provider output does not prove a Git push, and validation does not constitute creative approval or runtime promotion.

## Current Automation Fabric runtime truth

`config/automation-fabric-client-v5.json` binds Art Studio to Local Storage `0.48.0+` and the current schema-3 runtime-truth contract.

The current contract requires:

- the `windows-local` pool and `windows-primary` exact node;
- the installed `evavo-local-storage-workstation-accept` command to resolve to **workstation acceptance v8**;
- exact-state repository planning before unmeasured repository execution;
- exact HEAD, status SHA-256 and tracked-script SHA-256 measurement;
- tracked script bytes and stripped credentials before worker execution;
- resource-aware admission, bounded process-tree termination and transient-only retries capped at three attempts;
- unique command IDs, fail-before-execution duplicate issue handling and idempotent terminal receipt replay;
- stable control-plane execution from exact current managed main;
- fast-forward-only managed runtime updates with divergence quarantined rather than overwritten;
- fresh exact-node and capability-routed pool receipts before routine work resumes.

The approved execution roots now follow Local Storage's real root policy:

- `C:\GitRepos`;
- `%USERPROFILE%\Downloads` for the user's normal Downloads folder;
- `resolved-beestation-root`, resolved by Local Storage rather than hard-coded; and
- approved discovered external roots.

The retired `C:\Downloads` location is not an active Art Studio execution root, and Art Studio must not assume `C:\BEESTATION`; BeeStation location is resolved by Local Storage.

Source configuration, a queued workflow, task registration or a heartbeat alone are never treated as runtime proof.

## Supervisor-first recovery

`config/automation-fabric-recovery-chain.json` defines the fail-closed recovery order:

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
```

The dedicated GitHub Actions workflow runs the same checks without installing dependencies and verifies that validation leaves the repository unchanged. Hosted validation is read-only; a successful workflow still does not grant publication or runtime activation.
