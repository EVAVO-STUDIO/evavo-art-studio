# Animation Pipeline Control Plane V1

The Animation Pipeline Control Plane is the single agent-facing route through EVAVO's existing canonical animation production, review, receipt and delivery tools.

It does not replace the specialist compilers. It prevents ChatGPT, Claude and local agents from having to choose between overlapping base, canonical, hardened, guard and receipt entry points.

## Studio ownership

| Studio role | Owns | Does not own |
|---|---|---|
| Art Studio | Camera-aware profile compilation, dependency-safe generation batches, producer technical review, targeted repair, accepted delivery compilation | Independent creative acceptance, provider execution, runtime activation |
| Cel Animation Studio | Independent moving-sequence review, review verification, immutable review receipts, delivery verification | Source-frame redesign outside an authorised retry queue, automatic creative approval |
| Video Studio | Verified sequence intake and timing-preserving playback preparation | Retiming approved animation, silent interpolation, image generation |
| Game Runtime | Native Godot runtime acceptance outside this MCP server | Art or sequence approval |

## Governed stage order

```text
camera-aware production profile
→ dependency-safe art production
→ producer technical review
→ independent moving-sequence review
→ immutable review receipt
→ separate authorised creative approval
→ path-free sequence delivery
→ target-specific intake
→ native runtime acceptance where required
```

Missing evidence is review work. It is not permission to regenerate accepted drawings. A rejected drawing may be repaired only through the exact retry scope returned by the independent review.

## Default MCP server

Each participating repository registers `evavo-animation-pipeline-v1` in its root `.mcp.json` and also contains a focused `.mcp.animation-pipeline-v1.json` configuration.

The same server file is used in every repository:

```text
tools/animation_pipeline_control_plane_v1_mcp.mjs
```

The repository sets one role through `EVAVO_ANIMATION_PIPELINE_ROLE`:

```text
art-studio
cel-animation-studio
video-studio
```

## Shared routing tools

Every role exposes:

- `describe_animation_pipeline_v1`
- `next_animation_pipeline_action_v1`

The next-action tool identifies the correct owner and stage without performing side effects. It explicitly pauses at the separate creative-approval boundary.

Art Studio additionally exposes canonical profile compilation, profile verification, dependency-safe batch selection, producer technical review, runtime-clip compilation, review receipts, sequence delivery and Video intake operations.

Cel Animation Studio exposes independent profile review, review verification, accepted runtime-clip compilation, immutable review receipts, delivery verification and Video intake operations.

Video Studio exposes delivery verification and Video intake compilation and verification.

## Safety boundary

The server refuses to start when any of these capabilities is enabled:

```text
provider execution
automatic creative approval
artifact promotion
target repository mutation
Git commit
Git push
runtime activation
publication
```

It also rejects credential-like keys and values in tool payloads, limits each JSONL message to 4 MiB, uses no shell, performs no network requests and writes no files.

The canonical specialist modules remain responsible for their own content digests, evidence bindings, retry limits, artifact checks and delivery semantics.

## Typical agent flow

1. Call `describe_animation_pipeline_v1` once for the active repository role.
2. Submit current high-level state to `next_animation_pipeline_action_v1`.
3. Invoke only the returned stage through the owner studio.
4. Preserve profile, decision, receipt, approval and delivery digests unchanged between studios.
5. Stop on `blocked` or `awaiting-authority` rather than inventing a pass.
6. For Godot, continue through Game Runtime's separately governed native runtime acceptance path before activation.
