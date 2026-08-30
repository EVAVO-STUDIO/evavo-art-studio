# Animation Pipeline Control Plane V1.1

This is the default agent-facing route through EVAVO's canonical animation production, review, receipt and delivery tools.

Use `tools/animation_pipeline_control_plane_v1_1_mcp.mjs`. The earlier V1 server remains an internal compatibility delegate. Agents enter through V1.1 so ownership and state validation are enforced consistently.

## Ownership

| Stage | Owning role |
|---|---|
| Camera-aware production profile | Art Studio |
| Dependency-safe frame production and targeted repair | Art Studio |
| Producer technical self-review | Art Studio |
| Independent moving-sequence review | Cel Animation Studio |
| Immutable independent-review receipt | Cel Animation Studio |
| Separate creative approval | Authorised human reviewer |
| Path-free accepted sequence delivery | Art Studio |
| Delivery verification | Cel Animation Studio |
| Video sequence intake | Video Studio |
| Native Godot runtime acceptance | Game Runtime |

The server exposes only operations owned or consumed by its configured role. Art Studio cannot issue the independent-review receipt. Cel Animation Studio cannot issue accepted delivery. Video Studio cannot compile profiles or review source art.

## Stage order

```text
camera-aware profile
→ dependency-safe art production
→ producer technical review
→ independent moving-sequence review
→ immutable review receipt
→ separate authorised creative approval
→ accepted sequence delivery
→ destination intake
→ native runtime acceptance where required
```

Missing evidence is review work, not redraw permission. Only drawing IDs in an independent retry queue may be regenerated, and accepted drawings remain protected.

## Hardening

`next_animation_pipeline_action_v1` validates explicit status values, target objects and drawing IDs before routing. Unknown status strings, duplicate drawing IDs, malformed target flags and unsupported state schemas fail instead of silently restarting an earlier stage.

A blocked Video intake, Cel intake or Godot runtime-acceptance state stays blocked and is routed to its owner. Canonical review decisions are returned unchanged so later digest verification remains valid.

The MCP server validates JSON-RPC 2.0, returns parse errors for malformed JSON, limits each JSONL request to 4 MiB and publishes role-specific tool discovery. It uses no shell, network access or file writes.

## Authority boundary

The server refuses to start when provider execution, automatic creative approval, artifact promotion, target-repository mutation, Git commit, Git push, runtime activation or publication is enabled. Technical review and immutable receipts support a later authorised creative decision; they never replace it.
