# Animation Character Family V1

Protocol: `2026-09-01.2`

This subsystem governs a complete character animation family across actions, variants, camera directions, safe mirrors, transitions, loops, event markers, timing and destination runtime plans.

## Ownership

- Art Studio compiles the immutable family plan and targeted production or repair work.
- Cel Animation Studio compiles the independent whole-family review receipt.
- Passing technical review does not create creative approval, promote artifacts, activate a runtime or publish media.

## Coverage

The planner derives camera-aware direction coverage for side-stage, top-down, 2:1 isometric, three-quarter, front-stage, first-person overlay, cinematic and custom fixed cameras. Horizontal mirroring is permitted only when the subject's asymmetric anatomy, costume, weapon, prop and silhouette anchors make it safe.

## Repair discipline

Family status returns exact `produce-clip`, `repair-clip`, `repair-transition`, `repair-family` or `review-family` work. Accepted clips remain protected and broad regeneration is not authorised.

## Runtime planning

An accepted family can produce destination-neutral state, direction, variant, transition and timing plans for Godot, Cel Animation Studio, Video Studio and sprite atlases. The plan remains non-mutating.

## Agent entry points

- CLI: `node tools/animation_character_family_v1.mjs <command> <input.json>`
- MCP: `node tools/animation_character_family_v1_mcp.mjs`
- Check: `node scripts/check-animation-character-family-v1.mjs`
