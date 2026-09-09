# EVAVO Workbench First

Use the Agent Workbench before inventing a new tool, choosing an implementation route, or assuming a specialist is available.

## Default operating loop

1. **Orient** with `scripts/agent-workbench.mjs` for the exact objective.
2. **Check the local fleet** with `scripts/agent-workbench-fleet.mjs` when the task may cross repository or studio boundaries.
3. **Prefer semantic authority** in this order: repository capability, Development Studio registered tool, validated estate capability, then raw MCP/package launch inventory.
4. **Guide the next action** with `scripts/agent-workbench-guide.mjs` or `evavo_agent_workbench_guide` when an exact snapshot has been retained.
5. **Hand off** work that belongs to another canonical authority instead of silently expanding the current repository's authority.
6. **Verify execution separately**. A source file, package script, MCP registration, route, plan, guidance result, or handoff does not prove that runtime work executed.
7. **Publish separately** through the owning repository's governed publication authority.

## What the workbench sees

The repository snapshot combines the standard capability manifest, package automation, the reviewed Development Studio tool registry when available, and the repository's root MCP launch catalogue.

MCP launch evidence is deliberately sanitized. The workbench may retain the server name, command basename, argument count, and environment variable **names**. It must not retain raw argument values or environment values.

A root MCP registration always has `runtimeReadiness: "unknown"` until a separate live protocol or runtime receipt proves otherwise.

The fleet snapshot scans only local sibling repositories that already expose the EVAVO workbench contract. It is useful for routing across a local EVAVO checkout, but it does **not** prove the complete GitHub/provider estate and must never be used to claim that a missing repository or capability does not exist.

## MCP v2 surface

The guidance-aware workbench MCP v2 exposes five read-only tools:

- `evavo_agent_workbench_capabilities`
- `evavo_agent_workbench_snapshot`
- `evavo_agent_workbench_fleet`
- `evavo_agent_workbench_guide`
- `evavo_agent_workbench_handoff`

It supports standard MCP `2025-03-26` and EVAVO `server/discover` `2026-07-28`.

## Health and registration

Use `node scripts/agent-workbench-doctor.mjs` to verify the complete workbench contract, dual-protocol MCP surface, awareness safeguards, fleet safeguards, required artifacts, and root MCP registration.

Use `node scripts/agent-workbench-doctor.mjs --repair-registration` only for the bounded `.mcp.json` workbench-v2 registration repair. That repair does not run candidate work and grants no execution, mutation, or publication authority.

Brain additionally owns its isolated Brain-runtime specialist registration and `scripts/agent-workbench-brain-doctor.mjs` checks.

## Non-negotiable boundaries

- Discovery does not authorize execution.
- Registration does not prove runtime readiness.
- Guidance does not authorize effects.
- A handoff does not authorize the receiving authority to execute.
- A local fleet scan does not prove provider completeness or absence.
- No workbench compiler or doctor grants repository mutation, provider mutation, financial, credential, deployment, or publication authority.
