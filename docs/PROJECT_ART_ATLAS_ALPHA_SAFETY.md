# Project Art atlas alpha safety

Sprite transparency has two independent failure modes:

1. the visible image can contain a painted checkerboard or matte instead of real alpha;
2. a valid alpha channel can still hide black, white, green, magenta or other polluted RGB beneath transparent pixels.

Art Studio blocks the first failure through decoded-pixel transparency admission. The atlas boundary now prevents the second failure with deterministic transparent RGB bleed and exact RGBA packing.

## Why hidden RGB matters

Straight-alpha textures retain RGB even where alpha is zero. Bilinear filtering, resampling, compression and mip generation sample neighbouring RGB before or while applying alpha. A transparent black, white or chroma-key fringe can therefore become a dark, pale, green or magenta outline at runtime.

Godot exposes **Fix Alpha Border** for this reason, and Unity's **Alpha Is Transparency** similarly dilates colour to reduce edge-filtering artifacts. Art Studio performs a governed equivalent before atlas encoding so the result is engine-neutral, deterministic and represented in the atlas manifest and receipt. Engine import correction remains useful defense in depth.

## Safe default contract

Atlas requests accept:

```json
{
  "options": {
    "alphaPolicy": "required",
    "trimAlpha": true,
    "alphaThreshold": 0,
    "transparentRgbBleed": true,
    "transparentRgbBleedRadius": 8,
    "transparentRgbAlphaThreshold": 0,
    "padding": 2,
    "extrude": 1
  }
}
```

The compiler defaults `transparentRgbBleed` to `true`, the radius to `8`, and `transparentRgbAlphaThreshold` to the configured `alphaThreshold`. The threshold may be raised only when those low-alpha samples are intentionally treated as discardable edge coverage.

The operation:

- propagates RGB from the nearest bounded visible wavefront into transparent or configured low-alpha texels;
- preserves every alpha byte exactly;
- preserves RGB for all pixels above the configured alpha threshold;
- never mutates the source file;
- stops at the configured radius rather than flooding the whole canvas;
- records eligible, filled and unreached pixel counts for every frame;
- records an atlas-level summary in EVAVO, TexturePacker-compatible, Phaser and Godot metadata.

This is edge preparation, not background removal. A painted Photoshop checkerboard, opaque matte or ambiguous natural background still fails transparency admission and must go through the governed mastering, mask or segmentation path first.

## Exact atlas write

Atlas frames and their extrusion pixels are non-overlapping by contract. The packer therefore uses exact RGBA paste rather than alpha compositing. This distinction is essential: compositing a zero-alpha pixel over a transparent atlas discards its hidden RGB, undoing colour bleed and recreating black-edge risk. Exact paste keeps the prepared RGB and alpha bytes intact.

The receipt reports:

```text
evavo.project-art-atlas-transparent-rgb-summary.v1
```

with:

```text
enabled
radius
alphaThreshold
frameCount
appliedFrameCount
eligiblePixels
filledPixels
unreachedPixels
alphaPreserved
strongerAlphaRgbPreserved
exactRgbaAtlasPaste
```

Each frame also carries:

```text
evavo.project-art-transparent-rgb-bleed.v1
```

so downstream tools can reject an atlas that lacks the expected proof.

## Review and runtime checks

Review the encoded atlas, not only source frames, over black, white, mid-grey, green and magenta plates. Test nearest and linear filtering, zoomed-out rendering and any mipmapped runtime path. Keep sprite-region padding and extrusion enabled where filtering can sample outside the frame rectangle.

For pixel art that intentionally uses nearest-neighbour sampling, the same real-alpha admission still applies. Transparent RGB bleed is safe because it does not alter visible pixels, but it can be disabled explicitly for a byte-for-byte specialist pipeline; the disabled state remains recorded in metadata.

## Related boundaries

- ChatGPT and Claude pass paths, hashes, options and receipts through MCP; image bytes never travel through MCP.
- EVAVO Storage handoff remains separate and does not gain write authority here.
- Repository mutation, provider execution, candidate approval, publication and deployment remain outside the atlas executor.
- Use `project-art:review:mcp` for governed offline review evidence before release.

Official engine references:

- [Godot image import: Fix Alpha Border](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_images.html)
- [Godot ResourceImporterTexture](https://docs.godotengine.org/en/stable/classes/class_resourceimportertexture.html)
- [Unity texture import settings: Alpha Is Transparency](https://docs.unity3d.com/Manual/texture-type-default.html)
