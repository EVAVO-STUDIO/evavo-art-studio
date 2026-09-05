# Raster finishing and compositing

EVAVO Art Studio treats final-art cleanup, transparency proofing, reusable effect layers and multi-layer composition as separate governed operations.

## Choose the smallest correct operation

Use **raster finishing** when one existing image needs to become production-ready:

- preserve or apply alpha
- remove empty canvas with guarded trim
- add transparent breathing room
- normalize tone
- adjust brightness, saturation, hue or lightness
- gamma, blur or sharpen
- resize without accidental enlargement
- flatten only when an opaque delivery format is intentional
- export PNG, WebP, AVIF or JPEG with an evidence receipt

CLI:

```text
node tools/finish_raster_asset.mjs --input <image> --output <image> --preset web-support --print-evidence
```

MCP:

```text
evavo_finish_raster_asset
```

Use **raster compositing** when two or more existing images, mattes or overlays need to become one controlled composition:

- ordered layer stack
- resize per layer
- rotate per layer
- external alpha mask per layer
- opacity per layer
- Sharp/libvips blend mode per layer
- exact left/top placement or gravity placement
- transparent or coloured canvas
- optional base image fitted to a requested canvas
- PNG, WebP, AVIF or JPEG output with per-layer evidence

CLI:

```text
node tools/compose_raster_layers.mjs --spec <composition.json> --output <image> --print-evidence
```

MCP:

```text
evavo_compose_raster_layers
```

A composition JSON file references local files rather than embedding image bytes:

```json
{
  "canvas": {
    "width": 1600,
    "height": 900,
    "background": "#00000000"
  },
  "layers": [
    {
      "name": "subject",
      "inputPath": "layers/subject.png",
      "gravity": "centre"
    },
    {
      "name": "signal-glow",
      "inputPath": "layers/glow.png",
      "blend": "screen",
      "opacity": 0.65,
      "left": 980,
      "top": 210
    }
  ],
  "format": "webp",
  "quality": 92
}
```

Relative `inputPath` and `maskPath` values in CLI recipes resolve beside the JSON spec file. Absolute paths remain supported. This means a recipe folder can move as a unit without depending on the shell working directory.

### Composition geometry rules

The compositing pass fails closed before libvips rendering when geometry is ambiguous or outside the requested canvas:

- a job may contain at most 256 layers
- a declared canvas must provide both width and height
- canvas and resize dimensions are bounded to 1 through 32768 pixels
- exact coordinates are non-negative integers
- exact placement must provide both `left` and `top`
- a layer cannot combine exact coordinates with gravity placement
- the transformed layer must fit inside the canvas
- exact placement plus transformed dimensions must remain inside the canvas bounds
- external masks must exactly match the transformed layer dimensions

If intentional clipping is needed later, add it as an explicit crop/clip operation rather than relying on accidental out-of-bounds composite behaviour.

## Drop shadows and outer glows

Use **raster effect layers** when an approved transparent object needs presentation depth without baking that appearance into the source pixels.

Supported deterministic effect layers:

- `drop-shadow`
- `outer-glow`

Both effects are derived from the source alpha. The source image is never rewritten by the effect generator.

Reviewed production presets:

- `product-soft-shadow` — restrained depth for contained product/support objects
- `product-lift-shadow` — stronger lift for floating objects on dark presentation surfaces
- `signal-cherry-glow` — restrained EVAVO cherry signal/accent glow
- `motion-cherry-glow` — softer wider glow intended to remain independently animatable

Preset names preserve their semantic kind. A glow preset cannot be silently converted into a shadow through overrides.

CLI with preset:

```text
node tools/create_raster_effect_layer.mjs \
  --input layers/subject.png \
  --output layers/subject-shadow.png \
  --preset product-soft-shadow \
  --print-evidence
```

Granular CLI:

```text
node tools/create_raster_effect_layer.mjs \
  --input layers/subject.png \
  --output layers/subject-shadow.png \
  --kind drop-shadow \
  --opacity 0.45 \
  --blur 12 \
  --spread 1 \
  --offset-x 10 \
  --offset-y 14 \
  --print-evidence
```

MCP:

```text
evavo_create_raster_effect_layer
```

The effect receipt returns:

- padded output dimensions
- `subjectAnchorLeft`
- `subjectAnchorTop`
- effect colour
- opacity
- blur sigma
- spread
- offset
- padding
- operation history

The anchor is important. The effect layer is larger than the original subject because it includes safe transparent breathing room for blur and offset. To rebuild a finished object plate, use the effect layer as the base canvas and place the original subject at the returned subject anchor.

Example logical order:

```text
finished subject
  -> create drop-shadow layer
  -> compose shadow as base
  -> place original subject at subjectAnchorLeft / subjectAnchorTop
  -> optional additional glow or signal layer
  -> export final plate
```

Outer glow forces zero positional offset. Glow expansion comes from spread and blur, not hidden translation.

Effect generation fails closed when:

- opacity is outside 0 through 1
- spread exceeds the bounded range
- requested padding is too small for blur/spread/offset
- output dimensions exceed the image limit
- output pixel count exceeds the effect memory budget

Shadows and glows remain separate transparent layers so agents can revise, remove, reorder or animate them without damaging the source subject.

## Transparency proofing

Do not judge transparency from a checkerboard screenshot, a white preview pane or a metadata tag alone. Use the governed transparency proof.

The proof sheet renders the same source over:

- black
- white
- neutral grey
- bright green
- magenta
- a dedicated greyscale alpha-mask tile

It also records SHA-256 hashes for the source and generated proof. The source image is never modified.

CLI:

```text
node tools/create_transparency_proof.mjs \
  --input layers/subject.png \
  --output review/subject-transparency-proof.png \
  --print-evidence
```

MCP:

```text
evavo_create_transparency_proof
```

Use this after background removal, logo cleanup, matte refinement, transparent WebP/PNG delivery optimization or any finishing pass where a white halo, fringe, accidental matte or lost alpha would be costly.

For pixel-art or hard-edged assets, the proof can use nearest-neighbour preview scaling. For ordinary art, the default Lanczos preview is appropriate.

A proof is diagnostic evidence, not permission to overwrite a canonical/source asset. Fix the derivative first, re-run the proof, then promote only after the result passes review.

## Segmentation and background removal

Neither deterministic pass pretends to perform semantic segmentation. A matte may come from:

- an existing alpha channel
- local segmentation or background-removal models
- ComfyUI workflows
- Cloudinary background removal when policy and account limits allow it
- chroma/checkerboard recovery already present in Art Studio

The matte is then passed into finishing or compositing, where dimensions, cleanup and output are deterministic and reviewable.

Do not repeatedly run destructive background removal on already-approved transparent art. Prefer the approved alpha source or a preserved matte.

## Detail art versus catalogue/source art

When website or product art has more than one role, preserve the source-of-truth roles explicitly:

- catalogue or canonical identity source
- detail-page derivative
- social/SEO cover
- transparent object/support art
- archived original/provenance source

Do not overwrite a shared catalogue/canonical asset merely to improve one page. Create or promote a detail-specific derivative instead, or replace only a secondary-only public ID after preserving the original under an archive/provenance ID.

When replacing a secondary-only public ID for delivery optimization, preserve the reviewed original first, keep rollback metadata on both assets, and retain the stable public ID for the active derivative so page code and structured data do not drift unnecessarily.

## Motion bridge

Use the `motion-layer` finishing preset for transparent PNG layers that will be animated later. Ordered compositing can assemble still keyframes or intermediate plates, while timing, alpha sequences, sprite sheets, video encoding and loop validation remain responsibilities of the existing animation/video pipeline.

A shadow or glow created as a separate transparent layer can be animated independently later. This is preferable to baking a glow into the subject when the intended final use includes pulsing, flicker, reveal, UI feedback or atmospheric motion.

A future motion-compositing layer may build on the same contracts rather than duplicating alpha, mask and layer semantics.

## Local write safety

Both MCP servers are local-first and fail closed:

- configured allowed roots are required
- writes require an environment gate
- every write call requires explicit `confirmLocalWrite=true`
- input paths are canonicalized through `realpath`
- prospective output directories are canonicalized through their nearest existing ancestor
- symlink or junction escapes outside an allowed root are rejected
- MCP returns receipts and paths, not image bytes
- source files are not overwritten unless the caller explicitly selects the same allowed output path

Raster finishing and transparency proofing use:

```text
EVAVO_RASTER_FINISH_ALLOWED_ROOTS
EVAVO_RASTER_FINISH_ALLOW_WRITES=true
```

Raster compositing and effect-layer generation use:

```text
EVAVO_RASTER_COMPOSE_ALLOWED_ROOTS
EVAVO_RASTER_COMPOSE_ALLOW_WRITES=true
```
