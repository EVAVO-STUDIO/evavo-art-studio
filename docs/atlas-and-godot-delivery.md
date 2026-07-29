# Atlas and Godot delivery

## Purpose

This package turns approved individual lossless frames into reproducible runtime artifacts. It does not ask an image provider for a sprite sheet and it does not discard the editable source package.

The delivery boundary has two deterministic stages:

1. `@evavo/art-media` decodes source frames, trims transparent bounds, packs unique frames, renders padding and extrusion, compiles exact timing and writes a PNG atlas, atlas JSON and evidence JSON.
2. `@evavo/art-godot` writes a Godot 4.6.2 descriptor and a reviewed headless importer. A local or authenticated engine worker can run that importer through Godot to save the native `SpriteFrames` resource.

The hosted API and MCP surfaces may generate files only when deliberately enabled. They never execute Godot or another binary. Optional headless Godot execution is exposed only by the explicit local CLI command.

## Source manifest

The manifest separates **unique source frames** from **animation references**. This preserves linked cels and deliberate holds without packing duplicate pixels repeatedly.

```json
{
  "schemaVersion": "1.0",
  "atlasId": "hero",
  "frames": [
    {
      "id": "idle-down-001",
      "path": "source/hero/idle/down/frame-001.png",
      "pivot": { "x": 48, "y": 120 },
      "tags": ["hero", "idle", "down"]
    },
    {
      "id": "idle-down-002",
      "path": "source/hero/idle/down/frame-002.png",
      "pivot": { "x": 48, "y": 120 }
    }
  ],
  "animations": [
    {
      "name": "idle_down",
      "loopMode": "linear",
      "frames": [
        { "frameId": "idle-down-001", "durationMs": 125 },
        { "frameId": "idle-down-002", "durationMs": 250 },
        { "frameId": "idle-down-001", "durationMs": 375 }
      ]
    }
  ],
  "settings": {
    "maximumWidth": 4096,
    "maximumHeight": 4096,
    "padding": 2,
    "extrusion": 1,
    "trim": true,
    "alphaThreshold": 8,
    "powerOfTwo": "preferred",
    "textureFiltering": "nearest",
    "pngCompressionLevel": 9
  },
  "output": {
    "imageFileName": "hero.png",
    "dataFileName": "hero.atlas.json",
    "evidenceFileName": "hero.evidence.json"
  }
}
```

### Manifest rules

- Source-frame IDs and animation names are unique and filesystem-safe.
- Every animation reference must resolve to a declared source frame.
- A source frame may be referenced any number of times and is packed once.
- Frame duration is an exact positive integer in milliseconds.
- `none`, `linear` and `ping-pong` are the only loop modes.
- Empty frames are blocking unless the source frame explicitly declares `allowEmpty: true`.
- Output names are single file names, not paths.
- Input and output paths must remain inside configured allowed roots after real-path resolution.

## Deterministic frame preparation

Every source image is decoded through Sharp/libvips as one sRGB RGBA image page. Input bytes and decoded pixel counts are bounded before mastering.

When trimming is enabled, the builder records:

- original source width and height;
- visible alpha bounds;
- trim offset and trimmed dimensions;
- original pivot;
- pivot relative to the trimmed region;
- source format and source-alpha state;
- SHA-256 of the exact decoded RGBA pixels.

A trim operation changes atlas storage, not the authored coordinate system. Original dimensions, trim offsets and pivots remain in the atlas data and Godot descriptor. Manifest-relative source references are retained instead of machine-specific absolute paths, so atlas data and hashes remain portable across equivalent workstations.

## Packing policy

The packer uses deterministic MaxRects best-short-side-fit placement with stable source ordering.

Blocking rules:

- directional frames, pixel art, tiles and character poses are never rotated;
- each packed region receives transparent padding;
- extrusion copies only the nearest subject-edge pixel;
- padding is outside the extrusion and remains transparent;
- packed rectangles may not overlap;
- the result must fit inside the declared maximum width and height;
- `powerOfTwo: "required"` produces power-of-two dimensions;
- `powerOfTwo: "preferred"` first tries a power-of-two result and falls back only when the maximum dimensions prevent one;
- `powerOfTwo: "not-required"` evaluates a bounded deterministic candidate set based on area, cumulative row widths, geometric growth and uniform samples rather than probing every integer width.

The atlas PNG is encoded once from the lossless RGBA master. Runtime derivatives must never be made by recursively recompressing another derivative.

## Exact timing

Godot stores animation speed plus a relative duration per frame. The package preserves authored milliseconds exactly by calculating the greatest common divisor of every frame duration in an animation.

For durations `125`, `250`, `375` milliseconds:

- duration quantum: `125 ms`;
- animation speed: `1000 / 125 = 8 FPS`;
- relative durations: `1`, `2`, `3`.

This reconstructs every authored duration exactly instead of rounding the sequence to one approximate frame rate.

## Artifact package

The media package writes replaceable files safely on Windows and POSIX systems:

- `<atlas>.png` — transparent sRGB atlas;
- `<atlas>.atlas.json` — packed regions, source sizes, trim offsets, pivots, settings and exact animation timing;
- `<atlas>.evidence.json` — source-manifest hash, atlas-image hash, atlas-data hash, source-frame hashes and deterministic tool version.

Generated data records unique packed frames separately from animation references, so deliberate linked-cel reuse remains visible and auditable. Re-running the same build replaces prior outputs rather than failing because a Windows target file already exists.

## Godot 4.6.2 delivery

`@evavo/art-godot` writes:

- `<atlas>.godot.json` — engine descriptor;
- `<atlas>.spriteframes.import.gd` — reviewed headless importer;
- a declared output path for `<atlas>.sprite_frames.tres`.

The importer uses Godot's public APIs:

- `AtlasTexture.atlas` and `AtlasTexture.region` for packed regions;
- `AtlasTexture.margin` to restore trimmed source dimensions and placement;
- `AtlasTexture.filter_clip` to clip sampling outside the declared region;
- `SpriteFrames.add_animation()`;
- `SpriteFrames.set_animation_speed()`;
- `SpriteFrames.set_animation_loop_mode()` with `LOOP_NONE`, `LOOP_LINEAR` or `LOOP_PINGPONG`;
- `SpriteFrames.add_frame()` with exact relative durations;
- `ResourceSaver.save()` for the native resource.

The generated `SpriteFrames` resource also retains EVAVO metadata for source size, trim rectangle, packed region and pivot. A runtime or editor integration can use that metadata to configure `AnimatedSprite2D.offset`, collision alignment or other authored anchor behaviour without moving pixels inside the packed texture.

## CLI

Build the deterministic package and write the Godot descriptor/importer:

```powershell
pnpm art -- atlas-build `
  --manifest C:\GitRepos\game\art\hero.atlas.json `
  --output-dir C:\GitRepos\game\art\generated `
  --godot-project C:\GitRepos\game
```

Optionally run a reviewed local Godot binary headlessly:

```powershell
pnpm art -- atlas-build `
  --manifest C:\GitRepos\game\art\hero.atlas.json `
  --output-dir C:\GitRepos\game\art\generated `
  --godot-project C:\GitRepos\game `
  --godot-executable "C:\Tools\Godot\Godot_v4.6.2-stable_mono_win64.exe"
```

The process uses `spawn` without a shell and passes only the generated importer and descriptor after project-root checks.

## REST and MCP

The standalone API exposes `POST /v1/atlases/build`.

REST writes require both:

```text
EVAVO_ART_ALLOW_WRITES=true
EVAVO_ART_WRITE_TOKEN=<server-only random token of at least 32 bytes>
```

Clients send the token as either:

```text
Authorization: Bearer <token>
```

or:

```text
x-evavo-art-write-token: <token>
```

The server hashes configured and supplied tokens with SHA-256 and compares fixed-size digests through `timingSafeEqual`. Tokens are never returned by health, capability or build responses.

The local MCP server exposes `build_sprite_atlas_package`. It requires `EVAVO_ART_ALLOW_WRITES=true` and a trusted MCP process connection. Remote Streamable HTTP MCP is not yet enabled by this slice and must add its own authenticated transport boundary before file-generating tools are exposed remotely.

REST and MCP remain restricted to `EVAVO_ART_ALLOWED_ROOTS`, generate files only, return hashes and paths, and report `executionAvailable: false`.

## Verification boundary

Automated tests prove:

- manifest rejection and animation-reference integrity;
- deterministic layout and PNG hashes;
- source-frame reuse;
- portable manifest-relative source metadata;
- repeat builds over existing output files;
- alpha-aware trim bounds;
- transparent padding and real edge extrusion through decoded output pixels;
- bounded no-rotation packing;
- exact duration reconstruction;
- allowed-root and project-root rejection;
- fail-closed and authenticated REST writes;
- non-executing MCP write boundaries;
- descriptor and importer source contracts.

The repository CI does not claim that a Godot executable is installed on every runner. Native `.tres` production remains a local or authenticated engine-worker smoke gate. A release should run the generated importer through the target Godot 4.6.2 binary and open the resulting resource in a representative scene before declaring engine delivery complete.
