# Delivery image optimization

Status: implemented deterministic foundation

## Purpose

EVAVO projects retain high-quality source art separately from runtime delivery files. Runtime repositories should contain the smallest derivative that satisfies the actual game, web or product surface without visible or alpha damage.

This workflow is owned by `EVAVO-STUDIO/evavo-art-studio` and exposed by `@evavo/art-delivery-optimizer`. Development Studio can invoke it before its existing governed chat-asset publication planner. Individual game and website repositories should not maintain competing image scripts.

The optimizer is not an image generator and it never commits or pushes. It prepares a checksum-bound, create-only output directory and `optimization-receipt.json`; the existing publisher then owns repository mutation.

## Source and delivery boundary

```text
original upload or editable master
→ immutable source hash and source retention
→ role-specific delivery profile
→ optional border-connected matte extraction
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
| `retro-overlay-720p` | registered weather, light, occlusion or prop layer | 1280 × 720 | PNG with alpha | preserve or remove border matte |
| `godot-sprite-lossless` | general colour Godot sprite and mastered alpha intermediate | 2048 × 2048 | canonical RGBA8 PNG | preserve |
| `godot-background-1080p` | non-retro project that truly needs 1080p | 1920 × 1080 | near-lossless WebP | opaque |
| `web-raster-1080p` | responsive web derivative | 1920 × 1080 | near-lossless WebP | preserve |
| `source-master-lossless` | metadata-stripped retained source | unchanged | true-colour PNG | preserve |

A maximum is not a target. The optimizer never enlarges a smaller source.

## Brass & Brine policy

Brass & Brine uses a 1280 × 720 gameplay surface and a deliberately engraved 1990s presentation. Its runtime choices are therefore:

- fixed-room and location backgrounds: at most 1280 × 720;
- registered overlays: the exact 1280 × 720 stage when registration requires it;
- dialogue portraits: at most 384 pixels high, above their approximately 314-pixel display frame;
- standing room characters: at most 384 × 576;
- UI icons: at most 256 × 256;
- retained high-resolution originals: outside the runtime derivative set.

Storing a second 1920 × 1080 copy of a 720p scene does not add authored detail. Godot can scale the native plate to larger windows. A 1080p runtime source remains available for projects whose actual art-direction contract requires it.

### Black backgrounds

Black is not automatically background.

Dialogue close-ups retain their authored black stage. Removing black from those portraits can erase coats, hats, hair, eyes, hatching and shadows.

Standing sprites, isolated props, overlays and icons may use `remove-border-matte`. For black, the default extraction contract is:

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
- any candidate set that cannot satisfy the profile quality and byte gates.

`--dry-run` computes all derivatives and receipts without writing. `--apply` writes into a temporary sibling directory and atomically renames that complete directory into place. The output is create-only.

## Commands

```powershell
pnpm optimize -- profiles

pnpm optimize -- image `
  --input C:\Art\standing-character.png `
  --profile retro-standing-character-576 `
  --background black `
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

The resulting `optimization-receipt.json` is the evidence input to the cross-repository Development Studio adapter and chat-asset publisher. Native Godot import and human visual acceptance remain later gates; a successful optimizer receipt does not claim either.
