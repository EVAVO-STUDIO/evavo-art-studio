# EVAVO Agent Workbench Interchange

This document defines the portable interchange layer shared by The Brain, Development Studio and specialist studios that implement `evavo_agent_workbench_config_v1`.

The workbench has three machine-readable contracts:

1. `evavo_agent_workbench_config_v1` describes one repository's role, phases, automation boundaries and handoff rules.
2. `evavo_agent_workbench_snapshot_v1` is a read-only, evidence-bound orientation result compiled from exact repository files and optional live estate/tool evidence.
3. `evavo_agent_workbench_handoff_v1` binds one exact snapshot and one exact selected route for transfer to another authority.

The schemas are retained under `schemas/evavo.agent-workbench-*.schema.json`. The verifier is dependency-free and intentionally checks the truth boundaries that matter even when a generic JSON Schema validator is unavailable.

## Verification

```powershell
node scripts/verify-agent-workbench.mjs config .evavo/agent-workbench.v1.json
node scripts/agent-workbench.mjs --objective "<task>" > workbench.snapshot.json
node scripts/verify-agent-workbench.mjs snapshot workbench.snapshot.json
node scripts/verify-agent-workbench.mjs --self-test
```

A valid snapshot must retain all of these properties:

- the compiler itself was read-only;
- it executed no candidate command;
- it mutated no repository or provider state;
- source capability does not imply runtime readiness;
- a selected route does not grant effects;
- a plan does not prove execution;
- repository publication remains a separate authority.

Validated capability IDs found in an estate snapshot remain `runtimeReadiness: "unknown"` until current runtime evidence proves otherwise.

## Exact route handoff

Compile a handoff only after selecting an exact route from a verified snapshot:

```powershell
node scripts/compile-agent-workbench-handoff.mjs `
  --snapshot workbench.snapshot.json `
  --route-type capability `
  --route-id <exact-capability-id> `
  --to <target-repository-or-authority> `
  --objective "<objective>" `
  --reason "<why this authority owns the next step>" `
  --output handoff.json

node scripts/verify-agent-workbench.mjs handoff handoff.json --snapshot workbench.snapshot.json
```

Supported route types are `capability`, `script`, `tool` and `estate-capability`. Script identity is its exact package-script name; all other route types use their exact `id`.

The compiler hashes the complete snapshot bytes and the canonical selected route object. The verifier can therefore detect a handoff that was compiled from another snapshot, a route that was changed after selection, or a route identity that does not exist in the supplied snapshot.

## Authority boundary

A handoff is routing evidence, not an authorization token. Every handoff has:

```text
executionGranted   = false
mutationGranted    = false
publicationGranted = false
financialGranted   = false
requiresDownstreamAdmission = true
```

The receiving authority must perform its normal admission, readiness, approval, mission, runtime or publication checks. It must not inherit broader permissions from the sending agent.

## Agent rule

For multi-studio work, prefer this sequence:

**compile snapshot -> verify snapshot -> select exact route -> compile handoff -> verify handoff -> downstream admission -> execute -> return execution evidence**.

This keeps Codex/ChatGPT/Claude orchestration compact while preserving EVAVO's existing specialist and effect boundaries.
