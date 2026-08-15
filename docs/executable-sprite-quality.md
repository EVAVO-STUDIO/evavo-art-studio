# Executable sprite quality

## Purpose

The quality package turns the sprite-continuity plan into decoded-pixel evidence. It does not judge a thumbnail or trust a file extension. It decodes the actual image, measures the RGBA buffer and returns gate-by-gate JSON suitable for the web control plane, REST API, CLI, MCP, CI and durable workers.

This slice is deterministic. Identity, anatomy, costume and style similarity remain separate model-assisted vision gates, but those later workers must consume the same frame and sequence contracts rather than inventing their own thresholds or ordering.

## Frame inspection

A frame report records:

- decoded format, dimensions, page count and source-alpha presence;
- SHA-256 of the exact decoded RGBA pixels;
- transparent, partially transparent and opaque pixel distributions;
- visible bounds, clearances, alpha-weighted centroid and touched sides;
- flat-matte confidence and dominant border colour;
- checkerboard confidence, tile size and dominant checker colours;
- partial-alpha fringe evidence;
- hidden RGB beneath fully transparent pixels;
- every blocking or warning gate with measured values and thresholds.

### Real transparency

An alpha-required frame must contain source alpha and actual transparent or partially transparent pixels. A checkerboard rendered into pixels is not transparency. Checker detection covers periodic tiles from 2 through 128 pixels and still runs when a suspicious candidate contains a small amount of real alpha, preventing a painted grid plus token-transparent-pixel bypass. A uniform green, magenta, white, black or grey border is treated as a likely baked matte when the border coverage and colour-distance evidence cross the declared threshold.

### Transparent RGB

Colour beneath alpha zero can be legitimate. Texture filtering often benefits from subject-coloured edge bleed or extrusion. The inspector therefore compares non-zero transparent pixels with nearby opaque subject pixels:

- matching nearby colour is recorded as intentional bleed;
- unrelated colour is recorded as unexpected contamination;
- only the unexpected fraction is used by the blocking gate.

### Edge halos

Partially transparent pixels are compared with nearby opaque subject colour and known matte colours. A pixel is suspicious when it is materially closer to a matte colour than to the neighbouring subject. This catches white and chroma-key fringes without rejecting antialiasing that agrees with the artwork.

### Safe bounds

The frame-crop gate calculates the visible bounding box and the left, top, right and bottom clearances. A frame fails when visible content enters the declared safety margin. This protects limbs, hair, weapons, shadows, particle trails and effect extents from silent clipping.

## Sequence inspection

A sequence manifest declares exact frame files, global order, direction order, millisecond duration, pivot, baseline, ground-contact frames and deliberate linked-cel duplicates.

The sequence report verifies:

- every file passes frame inspection;
- every frame uses the shared canvas;
- global indices are contiguous;
- per-direction frame indices are contiguous;
- every duration is positive and retained exactly;
- pivots and baselines remain locked;
- declared ground-contact frames meet the baseline tolerance;
- exact duplicate hashes are absent or explicitly declared;
- gross visible-area outliers are surfaced for review.

An exact duplicate is not automatically wrong. Linked cels and deliberate holds are valid production choices, but the later frame must name the frame it intentionally duplicates. An undeclared duplicate remains blocking because it may indicate a missing or accidentally repeated frame.

## CLI

```powershell
pnpm art -- quality-frame `
  --input .\source\hero\frames\down\frame-001.png `
  --expectations .\source\hero\frame-quality.json `
  --output .\evidence\frame-001.quality.json
```

```powershell
pnpm art -- quality-sequence `
  --manifest .\source\hero\hero-idle.sequence.json `
  --output .\evidence\hero-idle.quality.json
```

A quality command exits with code `3` when deterministic blocking gates fail. Validation or command errors use the normal error path rather than being misrepresented as an art-quality failure.

## REST and MCP

The REST API exposes `POST /v1/quality/sprite-frame` for a bounded base64 image and `POST /v1/quality/sprite-sequence` for a guarded local manifest path.

The MCP server exposes:

- `inspect_sprite_frame_quality`;
- `inspect_sprite_sequence_quality`.

MCP and local sequence paths must remain inside `EVAVO_ART_ALLOWED_ROOTS`. File size, decoded pixel count and page count are bounded before analysis.

## Deliberate limitations

This deterministic slice does not yet claim to prove:

- face or character identity;
- anatomy correctness;
- costume and equipment design consistency;
- silhouette similarity beyond measured geometry;
- layer-to-composite reconstruction parity;
- optical-flow quality or loop motion continuity;
- atlas binary padding and extrusion.

Those gates remain blocking in the production plan until their dedicated workers emit measured evidence. They must not be auto-passed simply because the deterministic alpha and geometry checks succeeded.
