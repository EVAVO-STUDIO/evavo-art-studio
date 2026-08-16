# Project Art mastering and motion

Project Art mastering and motion extend the deterministic sandbox from basic image cleanup into a professional raster-production and 2D motion toolkit. The implementation provides governed equivalents for the core operation families commonly used in image editors and motion-compositing applications without invoking Photoshop, After Effects or arbitrary external scripts.

The system is intentionally plan-driven and create-only. Every task binds exact sources, operations, output paths, resource limits and authority state before the Python/Pillow runtime executes it.

## Operation families

### Geometry and canvas

```text
crop
trim-alpha
pad-canvas
resize
pixel-resize
translate
flip-horizontal
flip-vertical
rotate-90
rotate-180
rotate-270
rotate
affine-transform
perspective-transform
```

`rotate` supports arbitrary angles, optional canvas expansion, controlled resampling and transparent or coloured fill. Affine and perspective transforms accept exact inverse-mapping coefficients and optional explicit output dimensions.

### Colour and tonal work

```text
colour-replace
brightness
contrast
saturation
sharpness
grayscale
invert
posterize
threshold
gamma
hue-shift
curves
channel-mixer
autocontrast
levels
palette-normalize
quantize
```

Curves support master, red, green, blue and alpha channels using exact ordered control points. The channel mixer uses explicit RGB matrices and offsets. Alpha is preserved unless an operation is specifically an alpha operation.

### Filters and finishing

```text
gaussian-blur
box-blur
median-filter
motion-blur
unsharp-mask
emboss
find-edges
edge-enhance
```

Emboss, edge finding and edge enhancement support a bounded blend amount so they can be used as subtle finishing passes instead of destructive full-strength effects.

### Alpha, matte and edge repair

```text
alpha-erode
alpha-dilate
alpha-threshold
alpha-feather
connected-matte-to-alpha
edge-decontaminate
defringe
hidden-rgb-rebuild
outline
drop-shadow
outer-glow
rim-light
```

These operations support common generated-image cleanup problems:

- white, black or coloured edge halos;
- matte contamination in semitransparent pixels;
- rough or over-hard alpha edges;
- transparent padding and unwanted connected backgrounds;
- missing hidden RGB around sprite edges;
- inconsistent outline, shadow or glow treatment.

`defringe` combines bounded opaque-neighbour colour reconstruction with optional matte decontamination. It is intended for small edge corrections, not for inventing missing anatomy or replacing creative review.

`rim-light` derives a directional inner edge from the existing alpha silhouette. Width, angle, softness, opacity, colour and `normal`, `screen` or `add` blending are explicit. The operation restores the exact source alpha after colouring, so a lighting pass cannot silently expand or erode the cut-out.

### Texture and lighting preparation

```text
normal-map-from-height
```

`normal-map-from-height` derives a normalized RGB normal map from either luminance or alpha with bounded strength, blur, X/Y inversion and optional alpha preservation. It is useful for draft 2D-lighting maps and relief effects. It is not a substitute for a hand-authored normal map where facial planes, cloth folds, bevel direction or concavity matter.

Use engine lighting for genuinely dynamic light. In Godot, pair the reviewed colour texture and normal texture through `CanvasTexture`, then light it with `PointLight2D` or `DirectionalLight2D` and explicit occluders. A baked `rim-light`, shadow or glow is appropriate only when the art direction requires that effect to remain fixed in the sprite.

## `image-master`

`image-master` applies zero or more deterministic operations, writes one mastered image and emits a self-hashed `evavo.project-art-mastering-report.v1`.

```json
{
  "id": "master-human-king-south",
  "kind": "image-master",
  "source": "working/human-king/south.png",
  "targetPath": "masters/human-king/south.png",
  "reportPath": "masters/human-king/south.mastering.json",
  "outputFormat": "png",
  "operations": [
    { "op": "defringe", "radius": 1, "matteColour": "#ffffff", "strength": 0.75 },
    { "op": "alpha-feather", "radius": 0.35 },
    { "op": "levels", "blackPoint": 6, "whitePoint": 246, "gamma": 1.02 },
    { "op": "unsharp-mask", "radius": 0.8, "percent": 80, "threshold": 2 }
  ],
  "profile": {
    "name": "chess-lord-transparent-sprite-master",
    "enforce": true,
    "exactWidth": 512,
    "exactHeight": 512,
    "alphaMode": "required",
    "maximumTransparentRgbFraction": 1,
    "maximumSemiTransparentFraction": 0.18,
    "minimumOpaqueFraction": 0.05,
    "maximumUniqueColours": 256,
    "shadowThreshold": 0,
    "highlightThreshold": 255,
    "maximumShadowClippingFraction": 0.2,
    "maximumHighlightClippingFraction": 0.1,
    "minimumLuminanceSpan": 80,
    "edgeMatteColour": "#ffffff",
    "maximumEdgeMatteDistance": 12,
    "maximumEdgeMatteFraction": 0.02,
    "expectedAlphaBounds": {
      "x": 32,
      "y": 16,
      "width": 448,
      "height": 480,
      "tolerance": 4
    }
  }
}
```

The report records:

- before and after dimensions and pixel identities;
- every operation’s before and after pixel SHA-256;
- alpha bounding box and alpha composition;
- transparent-RGB contamination;
- semitransparent and opaque fractions;
- unique-colour limit;
- shadow and highlight clipping;
- visible luminance span;
- suspected edge-matte fraction;
- stable issue codes;
- exact output identity;
- an all-false approval, Storage, repository and publication authority map.

An enforced profile blocks the complete sandbox before final publication. A non-enforced profile may publish a technically blocked candidate for review, but it does not convert that candidate into an approved master.

## `motion-sequence`

`motion-sequence` renders bounded keyframed 2D compositions into exact PNG frames and a self-hashed `evavo.project-art-motion-sequence.v1` manifest.

```json
{
  "id": "human-king-idle-preview",
  "kind": "motion-sequence",
  "sources": [
    "working/human-king/body.png",
    "masks/human-king/body-mask.png",
    "working/human-king/sword.png"
  ],
  "targetDirectory": "review/human-king/idle-motion",
  "fileNamePattern": "frame-{index}.png",
  "frameCount": 12,
  "fps": 12,
  "canvas": {
    "width": 512,
    "height": 512,
    "background": "#00000000"
  },
  "layers": [
    {
      "sourceIndex": 0,
      "maskSourceIndex": 1,
      "maskChannel": "alpha",
      "sampling": "bicubic",
      "blendMode": "normal",
      "anchor": { "x": 0.5, "y": 0.9 },
      "keyframes": [
        { "frame": 0, "x": 256, "y": 480, "scaleX": 1, "scaleY": 1, "rotation": -0.5, "opacity": 1, "easing": "ease-in-out" },
        { "frame": 6, "x": 256, "y": 476, "scaleX": 1.005, "scaleY": 0.995, "rotation": 0.5, "opacity": 1, "easing": "ease-in-out" },
        { "frame": 11, "x": 256, "y": 480, "scaleX": 1, "scaleY": 1, "rotation": -0.5, "opacity": 1, "easing": "ease-in-out" }
      ]
    }
  ],
  "motionBlur": {
    "samples": 3,
    "shutterFraction": 0.4
  },
  "preview": {
    "animatedGif": true
  }
}
```

Each layer supports:

- exact source and optional mask source;
- alpha or luminance mask interpretation;
- mask inversion;
- nearest, bicubic or Lanczos sampling;
- normal, multiply, screen, add, subtract, darken and lighten blending;
- normalized anchor point;
- position, scale, rotation and opacity keyframes;
- linear, ease-in, ease-out, ease-in-out and hold interpolation.

The renderer streams frame outputs, may retain frames only when an animated GIF was explicitly requested, and applies bounded subframe motion blur. Output count, decoded pixels and byte budgets are verified by both compiler and runtime.

Motion rendering is useful for controlled UI transitions, VFX layers, parallax, camera-safe sprite previews, breathing/idle experiments and review composites. It is not a skeletal animation system and does not replace frame-by-frame creative animation where pose, anatomy or cloth must be redrawn.

## Governed video reference frames

`video-frame-extract` turns an exact local MP4, M4V, MOV, WebM, MKV or AVI source into a bounded set of timestamp-selected PNG reference frames. The task requires exact expected dimensions, one to 512 strictly increasing timestamps and a create-only target directory.

```json
{
  "id": "walk-reference-frames",
  "kind": "video-frame-extract",
  "source": "sources/reference/walk-cycle.mov",
  "targetDirectory": "scratch/reference/walk-cycle",
  "fileNamePattern": "frame-{index}.png",
  "timestampsMs": [0, 83, 167, 250],
  "expectedWidth": 1920,
  "expectedHeight": 1080,
  "preserveSourceAlpha": true
}
```

The runtime invokes only resolved FFmpeg and ffprobe executables through a fixed argument boundary with `shell=False`, bounded output, a timeout, local-file protocols, one selected video stream, disabled autorotation and no audio, subtitle or data streams. It records the exact executable version, bytes and SHA-256, video probe, requested timestamps and every output identity in `evavo.project-art-video-frame-extraction.v1`. Because video frames are discrete, selection is explicitly recorded as the first decodable frame at or after each requested timestamp rather than pretending every source contains a frame at the exact millisecond.

Extracted frames are immutable reference evidence. They do not pass sprite delivery admission merely because they are PNGs, and the video manifest explicitly sets delivery admission and creative approval to false. Copy an exact frame into a working version, edit it, then run normal alpha mastering and review before any sprite or atlas use.

## Sequence consistency profiles

`sequence-review` can apply `off`, `motion-family` or `identity-locked` continuity profiles. In addition to ordinary changed-pixel and centroid checks, profiles measure:

- alpha-bounds width and height drift;
- relative alpha-mass drift;
- visible mean-colour distance; and
- centroid-aligned alpha intersection-over-union.

The metrics catch size pumping, silhouette mutation, disappearing costume mass and palette/lighting jumps even when a moving subject would defeat a simple pixel difference. Thresholds remain explicit and may be tightened for a project. They are technical blockers, not permission to approve a character or animation automatically.

## Non-generic and consistent production

The mastering and motion tools are deterministic production stages. They do not by themselves make provider output stylistically correct. Consistency comes from combining them with:

- approved style profiles and exact direction masters;
- locked character identity, silhouette, costume and equipment rules;
- project palettes, line treatment, material and historical constraints;
- source-bound matching-frame and in-between plans;
- sprite-family and layer-consistency review;
- ordinary adjacent-frame review and final-to-first loop closure;
- explicit keep, edit, recreate, variation, reference-only or reject decisions;
- append-only workspace versions;
- final creative and runtime approval.

Provider generation is one governed input. The workspace makes it possible to repair and master the correct candidate without repeatedly regenerating the entire image and introducing new drift.

## Resource and authority boundary

The compiler and runtime retain code-owned limits for task count, source count and bytes, decoded pixels, active multi-image working sets, output-file count and output bytes. Correctly rehashed plans cannot raise those limits above production policy.

A technical pass is not creative approval. Mastering evidence can prove dimensions, alpha, palette, tonal range and edge cleanliness, but final artistic quality and style correctness remain separately reviewed.

No arbitrary shell is exposed. The only external media execution is the fixed governed FFmpeg/ffprobe boundary for `video-frame-extract`; callers cannot supply a command or arguments outside the task contract. No image task can approve or promote a candidate, write EVAVO Storage, mutate a game repository, commit, push, deploy, publish or force-push.

## Mandatory validation

```bash
pnpm run project-art:mastering:check
```

The executable adversary covers the complete operation surface, directional rim lighting, normal-map derivation, enforced and non-enforced mastering profiles, self-hashed mastering reports, keyframed frame rendering, masks, interpolation, motion blur, GIF evidence, exact video-frame extraction, binary fingerprints, malformed curve rejection and correctly rehashed output-count or video-bound attacks.
