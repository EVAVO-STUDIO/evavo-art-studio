# Capability discovery and Automation Fabric v2

Art Studio now exposes a canonical, machine-readable capability manifest for Development Studio, Brain and EVAVO GitHub MCP routing.

The manifest is `evavo.capabilities.json`. It declares only capabilities that resolve to real repository-owned `pnpm` entrypoints. The dependency-free validator checks every declared entrypoint against `package.json`, rejects duplicate or unknown capability data, and continuously fails if the live tool surface drifts away from the declaration.

## Authority split

Art Studio owns governed creative work: immutable source-art review, Project Art workspaces, mastering, motion and atlas validation, pixel-font production, delivery optimisation, provider planning, explicitly gated provider execution and repository-owned MCP profiles.

It does **not** own low-level Git mutation or mainline publication.

- **Local Storage** owns host execution, worker routing, recoverable cleanup and reviewed downloaded execution.
- **EVAVO GitHub MCP** owns structured low-level repository mutation through its hardened local stdio surface. Its public remote surface remains read-only.
- **Development Studio** owns engineering planning, exact-state validation orchestration and guarded mainline publication.

A worker receipt, provider receipt or successful validation proves only the operation it records. A worker receipt does not grant publication, provider output does not prove a Git push, and validation does not constitute creative approval or runtime promotion.

## Automation Fabric v2 client

`config/automation-fabric-client-v2.json` binds Art Studio to the canonical Automation Fabric v2 contract:

- route eligible work to the `windows-local` worker pool;
- use file-first PowerShell with the canonical guard;
- require capability routing and a structured receipt;
- prefer automation over manual terminal relay;
- keep broad repository writes on the hardened local stdio surface;
- preserve exact-head, exact-status and live remote-SHA publication checks;
- prohibit force push, hard reset, clean, stash-as-recovery and rebase publication shortcuts;
- send deletion candidates through the recoverable `TO_DELETE` boundary;
- hash-pin and review downloaded executables before execution.

Substantial PowerShell must be written as a complete tracked `.ps1` file and invoked non-interactively through the canonical guard. Inline or encoded PowerShell is not the default Art Studio automation route.

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

The dedicated GitHub Actions workflow runs the same checks without installing dependencies and verifies that validation leaves the repository unchanged.
