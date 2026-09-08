# EVAVO Art Studio animation control plane

EVAVO Art Studio contains a governed animation-production control plane in addition to its sprite mastering, provider, Project Art and delivery systems. The animation layer plans and verifies production work, tracks exact frame candidates, separates producer technical review from independent sequence review, compiles accepted runtime timing and prepares target-specific delivery without granting implicit provider execution, creative approval, artifact promotion, repository mutation or publication authority.

## Canonical workflow

1. **Character-family campaign preflight** verifies that required Art Studio and Cel Animation Studio adapters actually exist, match declared implementation digests, are owned by the correct studio, use bounded repository roots and safe command arrays, and have the required environment names. It reports `ready`, `partial` or `blocked`; it does not execute adapters.
2. **Camera-aware production profile** binds approved camera, identity, style and performance direction into deterministic key-pose, breakdown, in-between, exposure and target plans.
3. **Dependency-safe production batches** identify only the drawings that may be produced next. Missing evidence is not redraw authority.
4. **Event-sourced frame ledger** binds work orders to one exact profile digest and ledger revision. Same-revision candidate receipt batches are atomic; partial batches are rejected.
5. **Producer technical review** checks production evidence without granting creative approval.
6. **Independent moving-sequence review** is owned by Cel Animation Studio. A generated PNG remains a candidate until that independent review accepts it.
7. **Targeted repair** is allowed only when review explicitly authorises repair. Accepted frames are not silently regenerated because unrelated evidence is missing.
8. **Accepted runtime clip** converts accepted timing into exact integer exposure weights and exact-duration runtime timing.
9. **Canonical sequence delivery** binds approved profile, accepted review, exact artifact hashes and a separate named creative-approval record into path-free Godot, Cel and Video delivery plans.
10. **Target-specific intake/runtime acceptance** remains downstream: Video Studio owns video intake, Cel Animation Studio owns independent animation review, and the game runtime owns native Godot runtime acceptance.

## Main MCP surfaces

### Animation pipeline control plane v1.1

`node tools/animation_pipeline_control_plane_v1_1_mcp.mjs`

The Art Studio role can describe the pipeline, calculate the next action, compile and verify production profiles, calculate the next drawing batch, run producer technical review, verify canonical reviews, compile accepted runtime clips and compile/verify sequence delivery.

This surface explicitly disables provider execution, automatic creative approval, artifact promotion, target-repository mutation, Git commit/push, runtime activation and publication.

### Canonical production profile

`node tools/animation_production_profile_canonical_v1_mcp.mjs`

Compiles deterministic production profiles, verifies their content identity, returns dependency-safe batches, reviews drawing/sequence evidence and compiles accepted exact-duration runtime clips.

### Frame work ledger

`node tools/animation_frame_work_ledger_v1_mcp.mjs`

Art Studio owns ledger creation, work-order compilation, candidate receipt binding and same-revision candidate application. Cel Animation Studio owns independent sequence review. The ledger is append-only/evidence-bound and does not execute providers or promote candidates.

### Canonical sequence delivery

`node tools/animation_sequence_delivery_canonical_v1_mcp.mjs`

Compiles and verifies path-free Godot/Cel/Video delivery from approved profile + accepted review + exact PNG bindings + a separate named creative approval. Video intake preserves exact exposure timing and keeps interpolation disabled by default.

### Character-family campaign preflight

`node tools/animation_character_family_campaign_preflight_v1.mjs inspect <input.json>`

or the MCP profile in `.mcp.animation-character-family-campaign-preflight-v1.json`.

Preflight verifies adapter ownership, implementation SHA-256, safe repository-relative entrypoints, executable availability, environment requirements and credential-free manifests. It reads local state only and never executes adapters.

### Execution supervisor

`node scripts/start-animation-execution-supervisor-mcp-v1.mjs`

The supervisor is deliberately separate from the planning/review MCPs. Animation execution is disabled unless `--enable-execution` is explicitly supplied; creative-approval writes are independently disabled unless `--enable-approval-write` is supplied. It uses bounded local workspace/artifact roots, resolves Art/Cel sibling repository identities and forces ComfyUI remote access off by default.

## Authority model

The default animation MCP/control-plane surfaces have **no** authority to:

- execute providers,
- automatically approve creative work,
- promote candidate artifacts,
- mutate target repositories,
- commit or push Git,
- activate game runtime assets,
- publish or deploy media.

The execution supervisor can only gain its explicitly scoped execution/approval-write capabilities through its dedicated opt-in flags. Even then, repository publication and downstream runtime admission remain separate authorities.

## Production-quality rules

- Camera, identity, style and timing inputs are content-bound before frame production.
- Work orders are dependency-safe and revision-bound.
- Candidate receipts do not imply acceptance.
- Same-revision candidate batches are applied atomically.
- Independent Cel Animation Studio review is separate from Art Studio producer review.
- Missing evidence creates review work, not blanket redraw permission.
- Only explicitly rejected/repair-authorised work may be regenerated.
- Accepted sequence timing is represented with exact integer exposure weights.
- Delivery is path-free and hash-bound before any target-specific media resolution.
- Godot runtime acceptance remains a game-runtime responsibility.

## Existing related Art Studio systems

The animation control plane complements, rather than replaces:

- Project Art persistent workspaces and granular image surgery,
- avatar animation suite compilation and frame assurance,
- game-art campaign planning/batching,
- sprite-family/sprite-supervisor packages,
- deterministic atlas and Godot SpriteFrames delivery,
- provider selection and gated OpenAI/ComfyUI execution,
- alpha mastering, silhouette/identity continuity and loop review.

Agents should consult `evavo.capabilities.json` for official discoverability and use the relevant `.mcp.animation-*.json` profile when a dedicated animation MCP surface is required.
