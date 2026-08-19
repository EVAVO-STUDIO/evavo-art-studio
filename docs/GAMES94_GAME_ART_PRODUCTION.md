# Games '94 game-art production

Games '94 is a first-class Art Studio game-art production project, not a generic pixel-art prompt preset.

## Canonical profile

```text
profile: games94-sports-arcade
project: games94
target repository: EVAVO-STUDIO/california-games
logical runtime: 640x360
integer review: 1280x720
texture filtering: nearest
```

The reusable profile lives at:

```text
config/game-art-production/profiles/games94-sports-arcade.v1.json
```

The project binding lives at:

```text
config/game-art-production/projects/games94.v1.json
```

The generic production engine must compile Games '94 without any Games '94 conditional in engine code.

## First production vertical slice

The first slice is:

```text
athlete: Jax Mercer
event: Halfpipe Heat
venue: Sunset Concrete
```

The target repository owns the canonical detailed contracts:

```text
data/art/jax_halfpipe_vertical_slice.json
data/art/jax_halfpipe_production_pipeline.json
```

Art Studio mirrors only the reusable production facts needed to compile work orders and review candidates. The game repository remains authoritative for runtime frame mapping and final admission.

## Jax sprite contract

```text
native cel: 64x64
feet pivot: 32,58
ground/contact line: y=58
atlas: 512x512
layout: 8x8
reserved cells: 3,4,5,6,7
texture filtering: nearest
alpha: hard/binary for runtime athlete cels
maximum athlete palette: 16 colours unless a reviewed project change says otherwise
```

Identity must remain stable across the entire bank:

- compact-power silhouette;
- open-face skate helmet;
- sleeveless windbreaker;
- contrast tee;
- baggy knee-length shorts;
- high socks;
- knee pads;
- chunky 1990s skate shoes;
- one consistent double-kick skateboard construction;
- stable skin, wardrobe and equipment ramps;
- head height 9-11 native pixels;
- standing body height 43-52 native pixels.

Do not mechanically mirror a directional cel when clothing, anatomy or board orientation requires a genuine redrawn pose.

## Correct generated-art workflow

A generated contact sheet is **reference material**, not a production sprite sheet.

```text
provider/chat/Library candidate
  -> exact-byte Local Storage intake
  -> persistent Art Studio workspace
  -> pixel-art technical audit
  -> segment candidate into individual source frames when useful
  -> reject or repair bad frames
  -> deterministic raster cleanup
  -> hard alpha / transparent-RGB cleanup
  -> nearest-neighbour native-size normalization
  -> palette normalization
  -> pivot/contact-line normalization
  -> native 1x creative review
  -> adjacent-frame consistency review
  -> animation preview
  -> sprite workstation / advanced Project Art atlas
  -> Godot SpriteFrames package
  -> 640x360 runtime review
  -> 1280x720 integer-upscaled review
  -> exact-hash named-human approval
  -> source/master retention in EVAVO Storage/BeeStation
  -> compact runtime asset publication to california-games
```

If a candidate fails, retain the immutable source and repair or regenerate only the failing frame/layer. Never lower the production gate to admit generated art.

## Workstation choices

Use the smallest correct tool for the task.

### Pixel technical audit

Use `evavo_game_art_pixel_audit` before treating a PNG as a production candidate.

### Generated sheet segmentation

Use `evavo_game_art_sheet_segment` to extract plausible individual source regions from a generated montage. Segmented outputs still require independent review and cleanup.

### Photoshop-like deterministic edits

Use `evavo_game_art_raster_execute` for exact-plan operations such as:

- crop / trim;
- mask and alpha cleanup;
- compositing;
- nearest-neighbour resizing;
- colour replacement;
- levels, brightness, contrast and saturation;
- palette quantization;
- pixelation;
- outlines;
- hard-alpha conversion.

The plan SHA-256 is mandatory and output is create-only.

For more complex mastering, use the existing Project Art mastering and closed-loop repair engine rather than duplicating it.

### Animation review

Use `evavo_game_art_animation_preview` to generate a review artifact from an exact frame sequence. Inspect scale, silhouette, pivot stability, foot/board contact, body volume, equipment geometry and loop quality.

### Sprite/Godot packaging

Use `evavo_game_art_sprite_build` or the advanced Project Art atlas path after every source frame has been reviewed. The output includes a deterministic PNG atlas, frame manifest and Godot SpriteFrames resource.

## Halfpipe environment layers

Produce the venue as composable layers rather than one baked image:

1. sky
2. distance
3. atmosphere
4. midground
5. crowd
6. play_surface
7. foreground
8. effects

The playable halfpipe geometry must not drift because an environment repaint looked better. Sky is the opaque foundation; runtime overlays remain independently movable/occludable where the game needs them.

## Approval evidence

Jax/Halfpipe does not become production-ready from a good-looking atlas alone. Required evidence includes:

- native 1x indexed/contact review;
- nearest-neighbour 2x review;
- black, white, grey, green and magenta transparency mattes;
- ready, takeoff, air, clean-landing and bail runtime views at 640x360;
- the same views at 1280x720 integer scale;
- palette report;
- frame consistency review;
- exact-hash named-human approval receipt.

The current game contract requires the entire 13-asset vertical slice to pass before the event is marked production-ready.

## Authority boundary

Art Studio may review, master, segment, repair, compose and package assets. It does not gain automatic creative approval, Git publication, Storage mutation or force-push authority from these operations.

EVAVO Storage/BeeStation owns durable creative-master retention. Development Studio owns governed repository publication after the game validators pass.
