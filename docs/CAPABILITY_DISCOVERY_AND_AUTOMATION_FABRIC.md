# Capability discovery and Automation Fabric v3

Art Studio exposes a canonical machine-readable capability manifest for Development Studio, Brain and EVAVO GitHub MCP routing. It now also declares the current reachable-generation worker and accelerator contract used for routine local production.

The repository capability manifest is `evavo.capabilities.json`. It contains only capabilities that resolve to real repository-owned `pnpm` entrypoints. The dependency-free validator checks each declared entrypoint against `package.json`, rejects duplicate or unknown capability data and fails when the live tool surface drifts away from the declaration.

## Authority split

Art Studio owns governed creative work: immutable source-art review, Project Art workspaces, mastering, motion and atlas validation, pixel-font production, delivery optimisation, provider planning, explicitly gated provider execution and repository-owned MCP profiles.

It does **not** own low-level Git mutation or mainline publication.

- **Local Storage** owns host execution, the Automation Fabric worker pool, generation epochs, worker leases, recoverable cleanup and reviewed downloaded execution.
- **Local Compute** owns live hardware inspection and the `evavo-local-compute-resource-plan` resource governor for GPU-heavy local AI work.
- **EVAVO GitHub MCP** owns structured low-level repository mutation through `control-plane/agent-workspace-mcp.mjs`. Its public remote surface remains read-only.
- **Development Studio** owns engineering planning, exact-state validation orchestration and guarded mainline publication through `scripts/mainline-publish.mjs`.

A worker receipt, provider receipt, resource plan or successful validation proves only the operation it records. A worker receipt does not grant publication, queued work is not completed work, a hardware probe is not creative approval, a resource plan is not provider authorisation, provider output does not prove a Git push, and validation does not constitute creative approval or runtime promotion.

## Compatibility contract

`config/automation-fabric-client-v2.json` remains as the legacy compatibility binding for callers that have not yet adopted reachable-generation semantics. It retains the exact Local Storage, GitHub MCP and Development Studio authority split.

`config/automation-fabric-client-v3.json` is the current contract. The validator requires v2 and v3 to agree on repository-mutation and publication authority so a compatibility file cannot silently route work to a different operator.

## Reachable-generation activation

Routine worker use requires all three states:

```text
installed -> live -> reachable
```

A healthy heartbeat alone is insufficient. Acceptance requires:

- a read-only `storage.capabilities` exact-node round trip;
- a capability-routed pool round trip;
- exactly one request-correlated receipt;
- exact clean resolved online `main` source;
- no duplicate execution; and
- a receipt before routine use is treated as completed.

The mailbox generation epoch applies to resident, autoscaled and burst workers. Pre-epoch backlog remains recoverable but cannot starve new-generation work, and old issues are neither deleted nor automatically closed merely to make the worker pool appear healthy.

## Routing and bounded capacity

Eligible routine work prefers the `windows-local` pool. Required capabilities are explicit, pool claims are atomic and long-running leases are renewed. A specific node selection overrides the pool when diagnostics or specialist hardware are required.

The normal model is two resident workers with a maximum of ten logical workers. Excess demand uses `queue-not-spawn`; a queued job is never reported as completed. One process is retained per worker boundary.

The default route is **file-first PowerShell**. Substantial PowerShell must be written as a complete tracked `.ps1` file, parsed by native PowerShell and invoked non-interactively through the canonical guard. Child exit codes must be checked explicitly. Inline or encoded fragments are not the routine Art Studio route, and accepted routine commands must not be delegated back to the user.

## GPU and AI resource governor

GPU-heavy Art Studio work uses Local Compute 0.13.0 or newer through:

```text
evavo-local-compute-resource-plan
```

The worker route is the exact `windows-general-1` specialist node, not general pool targeting. The job must claim `resource-governor`, `gpu-probe` and `ai-inference`, perform a live hardware probe and obtain a resource plan before model execution.

The contract keeps GPU-heavy concurrency at one job with an exclusive GPU lease and an isolated process. It retains at least 768 MiB of free VRAM headroom and 4 GiB of free system RAM, caps the model executor at 90% of VRAM and 72% of system RAM, and permits planned CPU offload, memory-mapped weights, quantised weights or KV cache and context or batch reduction when needed to avoid out-of-memory failure.

The Windows pagefile is never treated as primary model memory. Unified-memory oversubscription is fallback-only when the runtime supports it. Model processes are unloaded after heavy work, CUDA caches are cleaned, and process exit remains the primary GPU-memory cleanup boundary. Provider execution still needs its separate provider gate and per-call confirmation.

## Repository and publication boundaries

Broad repository writes stay on the local stdio GitHub MCP surface and use structured compare-and-swap operations. Raw Git and raw GitHub mutation are not the default Art Studio interfaces.

Mainline publication remains Development Studio authority. It requires exact head and status, declared paths only, live remote-main rechecks, normal push and post-push remote SHA verification. Force push, hard reset, `git clean`, stash-as-recovery and publication-time rebase remain disabled.

Cleanup candidates go through the recoverable Local Storage `TO_DELETE` boundary. Downloaded executables are hash-pinned and purpose-reviewed; a successful download alone never authorises execution.

## Capability effects

The manifest deliberately separates planning, execution and publication:

- review, planning and validation capabilities declare only the effects they actually perform;
- network-capable provider and production MCP capabilities require explicit gates, credentials or per-call confirmation;
- no Art Studio capability may declare the `publish` or `financial` effect; and
- Git and mainline publication remain delegated authorities even after local validation succeeds.

## Validation

Run the focused contract locally with:

```powershell
node .\scripts\check-art-studio-capability-contract.mjs
node --test .\scripts\test-art-studio-capability-contract.mjs
node .\scripts\check-art-studio-automation-fabric-v3.mjs
node --test .\scripts\test-art-studio-automation-fabric-v3.mjs
```

The path-scoped GitHub Actions workflow runs all four dependency-free checks and verifies that validation leaves repository source unchanged.
