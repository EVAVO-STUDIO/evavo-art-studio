# Rally 2.5D vertical-slice art program

The vertical-slice program coordinates the first playable asset set without confusing high-definition concept and technical reference art with the pixel/source-art orchestration system.

## Identity chain

```text
rally-art-program-request
  -> rally-art-program SHA-256
  -> per-asset rally-art-handoff SHA-256
  -> per-role work-order SHA-256
  -> approved rendered PNG SHA-256 values
  -> EVAVO 3D Studio program run
  -> Godot runtime admission
```

The committed request covers the Falcon player vehicle, forest stage, timber bridge, road sign, guardrail, marshal, bird flock and the dust, gravel, skid-smoke, glass, engine-smoke and crash-debris effect families.

## Compile

```powershell
node scripts/game-art-production/rally-25d-program.mjs compile `
  config/game-art-production/programs/rally-vertical-slice.v1.json `
  --output .data/rally-vertical-slice.art-program.json
```

Verify an existing program:

```powershell
node scripts/game-art-production/rally-25d-program.mjs verify `
  .data/rally-vertical-slice.art-program.json
```

## Readiness semantics

A compiled program means every governed work order and handoff identity exists. It does **not** mean that provider execution, rendered PNG admission, creative approval, 3D production or runtime admission has happened.

Until exact rendered artifact URI, SHA-256 and named-human approval evidence exists, every asset remains `work-orders-compiled` and the program remains `awaiting-art-production`.

## Authority

The program compiler can validate and compile metadata. It cannot execute providers, approve art, mutate downstream repositories, commit or push Git, deploy or publish.
