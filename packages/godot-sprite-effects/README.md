# `@evavo/art-godot-sprite-effects`

Versioned, deterministic Godot 4.6.2 CanvasItem shader packages for Sprite2D, AnimatedSprite2D, AtlasTexture and Control-based sprite surfaces.

The compiler emits one `.gdshader` and one shared `ShaderMaterial` per effect, an exact JSON catalog, a C# per-instance parameter binder, and a checksum-bound receipt. It never mutates gameplay state or claims native renderer approval.

## Effects

- `sprite_feedback`: one combined atlas-safe selection outline, hover emphasis, hit flash and opacity pass.
- `sprite_dissolve`: ordered 4×4 source-pixel dissolve with a controlled red/ink edge and explicit pause-aware time.
- `sprite_ghost`: restrained two-sample memory/apparition drift, desaturation, tint and alpha.
- `sprite_sway`: anchored whole-pixel vertex sway for cloth, signs, foliage and hanging props.
- `sprite_engraved_ink`: stable black/white Bayer treatment with optional authored red-accent retention.
- `sprite_additive_pulse`: explicit additive light pulse for sparks, lamp glints, telegraph cues and compact effect sprites.

## Safety and polish boundaries

- all mutable values use `instance uniform`, so shared materials do not leak one sprite’s state into another;
- animation uses a game-owned `effect_time` parameter, not the global `TIME` built-in;
- every texture sample is clamped to `source_uv_rect` and returns transparent outside the assigned atlas region;
- CanvasItem modulation is captured in the vertex stage and applied once after manual texture sampling;
- no dynamic loops, `discard`, screen-texture copies, extra samplers, derivative sampling or unbounded texture paths;
- shader validation records the exact static texture-sample budget for every effect;
- outline and drift effects require transparent atlas padding/extrusion from the Art Studio atlas pipeline;
- effects are visual-only and may be disabled without changing deterministic simulation or saved gameplay authority;
- native Godot 4.6.2 compile, renderer capture and performance acceptance remain required after static compilation.

## Commands

```powershell
pnpm --filter @evavo/art-godot-sprite-effects build
pnpm --filter @evavo/art-godot-sprite-effects start -- catalog

pnpm --filter @evavo/art-godot-sprite-effects start -- compile `
  --request C:\Art\sprite-effects.json `
  --dry-run

pnpm --filter @evavo/art-godot-sprite-effects start -- compile `
  --request C:\Art\sprite-effects.json `
  --output-root C:\Art\prepared-effects `
  --apply
```

The generated C# binder computes normalized atlas regions and calls `CanvasItem.SetInstanceShaderParameter` for shared-material-safe values.
