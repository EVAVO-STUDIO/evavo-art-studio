# Image Effects Agent

Art Studio separates **offline raster finishing effects** from **runtime Godot sprite shaders** so agents do not destructively bake a dynamic treatment into a canonical master by accident.

## Offline raster effects

The media package currently provides `drop-shadow` and `outer-glow` effect layers plus reviewed presets. These are generated as separate transparent PNG layers from source alpha. The source image is never edited, and the returned evidence includes the exact subject anchor needed for later compositing.

Use the MCP tool `evavo_create_raster_effect_layer` when an agent needs a reusable web/game/print layer such as a product shadow or restrained EVAVO glow. Writes are create-only and require the local write gate plus `confirmLocalWrite=true`.

## Godot 4.6.2 runtime shaders

The existing `@evavo/art-godot-sprite-effects` compiler remains authoritative. It currently covers:

- `sprite_feedback` — selection/hover outline, hit flash and opacity;
- `sprite_dissolve` — deterministic ordered dissolve;
- `sprite_ghost` — restrained memory/apparition drift;
- `sprite_sway` — anchored cloth/foliage/sign movement;
- `sprite_engraved_ink` — stable black/white engraving plus optional accent retention;
- `sprite_additive_pulse` — sparks, lamp glints and effect-sprite pulses.

The agent planner maps human intent to these reviewed effects and returns concrete per-instance binder values at `subtle`, `standard` or `strong` strength. It also checks role and performance compatibility instead of silently applying an inappropriate shader.

Runtime state remains safe for shared materials because the compiler's C# binder uses per-instance shader parameters. Animated effects use the game-owned `effect_time` uniform rather than Godot's global `TIME` built-in. Atlas sampling is bounded by `source_uv_rect`.

## MCP tools

Build the two underlying packages first:

```powershell
pnpm --filter @evavo/art-media build
pnpm --filter @evavo/art-godot-sprite-effects build
$env:EVAVO_IMAGE_EFFECTS_ALLOWED_ROOTS = "C:\GitRepos;C:\EVAVO"
node tools/image_effects_mcp.mjs
```

Available tools:

- `evavo_image_effects_capabilities`
- `evavo_plan_godot_sprite_effect`
- `evavo_compile_godot_sprite_effect_pack`
- `evavo_write_godot_sprite_effect_pack`
- `evavo_create_raster_effect_layer`

Planning and in-memory compilation are read-only. File writes also require:

```powershell
$env:EVAVO_IMAGE_EFFECTS_ALLOW_WRITES = "true"
```

and `confirmLocalWrite=true` on the exact call.

## Recommended agent workflow

1. Decide whether the treatment belongs in the canonical raster asset or should remain dynamic at runtime.
2. For dynamic sprite behaviour, call `evavo_plan_godot_sprite_effect` using the actual sprite role and desired strength.
3. Review role/performance warnings and choose the renderer target explicitly.
4. Compile the pack in memory and inspect its receipt/output paths.
5. Write a new pack only into an allowed create-only root.
6. Integrate through the generated binder; do not bypass it with shared material mutation.
7. Run Godot 4.6.2 native shader compilation, renderer capture and representative performance testing before production approval.
8. For offline shadow/glow work, keep the generated effect as a separate layer until a reviewed delivery intentionally composites it.

The MCP server does not generate arbitrary unreviewed shader source from prose. New shader families should be added to the typed catalog, static validator and package tests first, then exposed to agents. This prevents one-off generated shader code from bypassing the production contract.
