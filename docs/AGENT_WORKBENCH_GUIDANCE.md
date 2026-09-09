# EVAVO Agent Workbench Guidance

The guidance layer turns a verified `evavo_agent_workbench_snapshot_v1` into a deterministic **next safe action** without executing the selected route.

It exists because a ranked list is useful for orientation but is not enough for a strong Codex-style workflow. An agent also needs to know whether the top route is local read/compute capability, an effectful capability needing admission, a registered tool owned elsewhere, a remote manifest capability whose runtime is unverified, or a raw package script that must first be resolved through its owning capability.

## CLI

```powershell
node scripts/agent-workbench.mjs --objective "<task>" > workbench.snapshot.json
node scripts/agent-workbench-guide.mjs --snapshot workbench.snapshot.json
node scripts/agent-workbench-guide.mjs `
  --snapshot workbench.snapshot.json `
  --route-type capability `
  --route-id <exact-id> `
  --current-phase <phase-id>
node scripts/agent-workbench-guide.mjs --self-test
node scripts/test-agent-workbench-guide.mjs
```

Without an explicit route, guidance deterministically selects the highest-relevance route, breaking ties in favour of a repository capability, then a registered tool, then an estate capability, then a raw package script. This selection is navigation only; it does not grant authority.

## Dispositions

- `read-compute-route` — the declared local capability has no network/write/execute/publish/financial effect, but a live callable interface still needs to be verified before actual execution.
- `effect-admission-required` — the capability declares one or more gated effects and must enter its owning authority's normal admission process.
- `registered-tool-admission-required` — a same-repository registered tool was selected, but registration alone is not runtime or execution proof.
- `handoff-registered-tool` — the selected registered tool belongs to another repository and should be handed to that owner.
- `handoff-runtime-unverified` — an estate manifest capability was selected; source evidence exists but runtime readiness remains unknown.
- `resolve-script-through-capability` — a package script matched, but raw package automation must not bypass the owning capability, mission or safety policy.
- `no-route-match` — the supplied evidence does not contain a route; broaden the objective or refresh the capability/tool evidence rather than inventing one.

Guidance also returns the ordered workbench phase sequence, the next phase, its required evidence, route requirements/blockers, the next authority and the repository's `neverImplied` safety rules.

## MCP

The read-only workbench MCP exposes the same guidance as `evavo_agent_workbench_guide`. The MCP call accepts an exact snapshot path plus optional explicit route and current phase. Snapshot paths and optional external evidence remain confined to admitted evidence roots.

Guidance always retains:

```text
commandExecutionPerformed = false
mutationPerformed = false
selectionDoesNotAuthorizeEffects = true
guidanceDoesNotProveReadiness = true
```

The next system must still perform its normal runtime, provider, mission, creative, validation, publication or other effect-specific admission.
