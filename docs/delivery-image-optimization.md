# Delivery image optimization

Status: implemented deterministic foundation

## Purpose

EVAVO projects retain high-quality source art separately from runtime delivery files. Runtime repositories should contain the smallest derivative that satisfies the actual game, web or product surface without visible or alpha damage.

This workflow is owned by `EVAVO-STUDIO/evavo-art-studio` and exposed by `@evavo/art-delivery-optimizer`. Development Studio can invoke it before its existing governed game-media publication planner. Individual game and website repositories should not maintain competing image scripts.

The optimizer is not an image generator and it never commits or pushes. It prepares a checksum-bound, create-only output directory and `optimization-receipt.json`; the existing signed publisher then owns repository mutation.

## Source and delivery boundary

```text
original upload or editable master
→ immutable source hash and source retention
→ role-specific delivery profile
→ optional border-connected matte extraction or luminance-alpha mastering
→ deterministic resize and colour policy
→ multiple encoding candidates
→ decoded-pixel and alpha comparison
→ smallest passing candidate
→ immutable optimization receipt
→ governed repository publication
```

Do not repeatedly recompress a derivative. Re-run the pipeline from the retained source master whenever a delivery profile changes.

## Governed profiles

| Profile | Runtime purpose | Maximum size | Format | Background |
|---|---|---:|---|---|
| `retro-dialogue-portrait-384` | black-stage dialogue close-up | 384 × 384 | palette-aware PNG | preserve |
| `retro-standing-character-576` | full character in a 720p room | 384 × 576 | PNG with alpha | preserve or remove border matte |
| `retro-ui-icon-256` | icons, cursors and UI tokens | 256 × 256 | PNG with alpha | preserve or remove border matte |
| `retro-scene-720p` | fixed-camera room/location plate | 1280 × 720 | opaque PNG | preserve |
| `retro-overlay-720p` | registered weather, light, occlusion or prop layer | 1280 × 720 | PNG with alpha | preserve, remove border matte or luminance-alpha |
| `godot-sprite-lossless` | general colour Godot sprite and mastered alpha intermediate | 2048 × 2048 | canonical RGBA8 PNG | preserve |
| `godot-background-1080p` | non-retro project that truly needs 1080p | 1920 × 1080 | near-lossless WebP | opaque |
| `web-raster-1080p` | responsive web derivative | 1920 × 1080 | near-lossless WebP | preserve |
| `source-master-lossless` | metadata-stripped retained source | unchanged | true-colour PNG | preserve |

A maximum is not a target. The optimizer never enlarges a smaller source. An exact game-owned canvas remains a separate requirement that must be validated before or after optimization.

## Brass & Brine policy

Brass & Brine uses a 1280 × 720 gameplay surface and a deliberately engraved 1990s presentation. The canonical game-owned media contract is:

```text
EVAVO-STUDIO/Brass_Brine
  data/identity/brass_brine_media_production_contract_2026_08_04.json
```

That contract is stricter than the reusable profile maxima. Current exact runtime roles include:

- dialogue portrait content: authored height 272 within a 240 × 272 content area, preserve black, no crop or upscale;
- standing character and crew portrait: 512 × 512 with meaningful alpha;
- ship profile: 512 × 256 with meaningful alpha;
- document plate: 512 × 640, opaque permitted, safe-centre cover;
- UI icon: 256 × 256 with meaningful alpha;
- weather overlay: 1280 × 720 with meaningful or luminance-derived alpha;
- port maps and location backgrounds: exact canvas remains manifest-owned, with 1280 × 720 as the production preference rather than an invented universal size.

Generic profiles remain available for existing projects and intermediate mastering. A Brass & Brine production batch must also satisfy its exact game-side contract. For example, an already exact 512 × 512 cut-out can use `godot-sprite-lossless`; it must not be reduced merely because a legacy standing-character maximum is smaller.

Storing a second 1920 × 1080 copy of a 720p scene does not add authored detail. Godot can scale the native plate to larger windows. A 1080p runtime source remains available for projects whose actual art-direction contract requires it.

### Black backgrounds

Black is not automatically background.

Dialogue close-ups retain their authored black stage. Removing black from those portraits can erase coats, hats, hair, eyes, hatching and shadows.

Standing sprites, isolated props and icons may use `remove-border-matte`. For black, the default extraction contract is:

```text
matte colour:                    #000000
border connection distance:     24
confident opaque seed distance:  64
edge search radius:              12 pixels
transparent RGB bleed:           2 pixels
minimum matching border:         65%
```

The extractor flood-fills only matte-like pixels connected to the outer border. Enclosed black regions remain foreground. Edges are decontaminated and subject colour is bled beneath nearby transparent pixels to avoid grey or black halos on hostile backgrounds.

When the border does not provide enough confident matte evidence, preparation fails rather than guessing.

### Weather, fog, spray and reflection alpha

Rain, snow, fog, foam, spray and reflected light are not solid character cut-outs. A border flood or hard black threshold can break thin lines, remove soft haze and produce harsh edges.

Use `luminance-alpha` when a light-like overlay has been painted over black:

```powershell
pnpm optimize -- image `
  --input C:\Art\rain_sheet_01.png `
  --profile retro-overlay-720p `
  --background luminance-alpha `
  --dry-run
```

The default conversion:

```text
luminance:       Rec.709 integer approximation
black point:     0
white point:     255
gamma:           1.0
output colour:   #ffffff
invert:          false
source alpha:    multiplied into derived alpha
threshold:       none
```

Black becomes transparent, white becomes opaque and intermediate greys remain feathered. The output colour is neutral and tintable by the engine. Batch manifests may set bounded `blackPoint`, `whitePoint`, `gamma`, `outputColour` and `invert` values. The receipt records those values plus the source and mastered SHA-256, source and output alpha counts and the fact that no hard threshold was applied.

This mode is prohibited for opaque profiles. It must not be used to remove the authored black stage from dialogue portraits or to isolate a dark-clothed character.

## Candidate selection and quality

Each profile declares one or more governed encoding candidates. Profiles that must retain spatial RGB beneath transparent pixels, including `godot-sprite-lossless`, use canonical RGBA8 PNG only. Web profiles may test bounded near-lossless qualities.

Every candidate is decoded again and compared with the role-normalized reference. Evidence records:

- mean absolute error;
- root mean square error;
- PSNR;
- alpha mean absolute error;
- maximum alpha difference;
- transparent, partial and opaque pixel counts;
- encoded bytes and SHA-256;
- pass/fail reasons.

The smallest passing candidate is selected. If the source file already satisfies the exact dimensions, colour, alpha and format contract, its bytes are reused. This prevents an already-efficient asset from growing merely because it passed through the pipeline.

The first preserved Brass & Brine character batch demonstrates that boundary:

```text
20 runtime PNG files
529,328 source bytes
499,583 prepared bytes
29,745 bytes saved (5.62%)
zero decoded colour error
zero decoded alpha error
16 portraits losslessly repacked
4 standing sprites reused byte-for-byte
```

## Batch contract

A batch manifest uses `evavo.art-delivery-optimization.v1` and binds every input to its exact SHA-256 and byte length. It also declares the exact repository-relative output path, role profile and background policy.

The batch runner rejects:

- missing, symbolic or non-regular source files;
- traversal or non-canonical paths;
- duplicate IDs;
- exact, case-folded or Unicode-normalized target collisions;
- source hash or byte-length drift;
- wrong target extension for the selected profile;
- overlapping source and output roots;
- a pre-existing output root;
- excessive image dimensions, input bytes or batch size;
- invalid luminance curves, colours or inversion values;
- any candidate set that cannot satisfy the profile quality and byte gates.

`--dry-run` computes all derivatives and receipts without writing. `--apply` writes into a temporary sibling directory and atomically renames that complete directory into place. The output is create-only.

Example weather item:

```json
{
  "id": "rain-sheet-01",
  "sourcePath": "weather/rain_sheet_01.png",
  "targetPath": "assets/art/fx/weather/rain_sheet_01.png",
  "sourceSha256": "<exact-lowercase-sha256>",
  "sourceBytes": 123456,
  "profileId": "retro-overlay-720p",
  "background": {
    "mode": "luminance-alpha",
    "blackPoint": 4,
    "whitePoint": 244,
    "gamma": 0.9,
    "outputColour": "#f2f2f2",
    "invert": false
  }
}
```

## Commands

```powershell
pnpm optimize -- profiles

pnpm optimize -- image `
  --input C:\Art\standing-character.png `
  --profile retro-standing-character-576 `
  --background black `
  --dry-run

pnpm optimize -- image `
  --input C:\Art\rain-over-black.png `
  --profile retro-overlay-720p `
  --background luminance-alpha `
  --dry-run

pnpm optimize -- batch `
  --manifest C:\Art\delivery-manifest.json `
  --source-root C:\Art\source `
  --output-root C:\Art\prepared `
  --dry-run

pnpm optimize -- batch `
  --manifest C:\Art\delivery-manifest.json `
  --source-root C:\Art\source `
  --output-root C:\Art\prepared `
  --apply
```

The resulting `optimization-receipt.json` is the evidence input to Development Studio's game-media publisher. Native Godot import and human visual acceptance remain later gates; a successful optimizer receipt does not claim either.
