# Document Ink Finishing

Art Studio owns the visual finishing rules for genuine handwritten personal-mark raster assets used by Document Studio. It does **not** decide whether a document should be signed, which field is legally appropriate, or whether execution is approved.

## Ownership boundary

- **Document Studio**: form/PDF understanding, reviewed source/keep capture geometry, provenance, private profile construction, genuine date/text composition, candidate field geometry, reviewed execution plan, source-hash binding, PDF application and post-write visual QA.
- **Art Studio**: photographed-paper extraction, illumination/paper-cast correction, alpha cleanup, transparent-edge mastering, hostile-background proofing, multi-variant handwriting atlases, natural glyph spacing/side-bearing, whole-name/signature variant selection and rendering, rigid visual transforms, local paper integration and image-level quality evidence.
- **Local Storage**: private physical asset boundary and logical-URI resolution on the Windows node.
- Genuine signature/name/month/digit/letter source bytes and private capture manifests never belong in Git.

## Non-negotiable authenticity rules

1. Never generate, redraw or morph a person's signature to create variation.
2. Signature variation may choose among separately captured genuine signatures and apply only bounded rigid transforms to the complete raster.
3. Whole captured handwritten names are preferred when available; general handwritten text may be composed from genuine captured glyph variants.
4. Flexible dates may combine genuine digit/separator/month-word captures. Missing handwriting fails closed rather than falling back to a font or generated imitation.
5. Short handwritten text may combine genuine glyph captures or whole captured fragments such as `.com`; missing characters fail closed and there is no font fallback.
6. Preserve visible ink structure and stroke geometry. Cleanup may change paper/background separation and edge transparency but must not redesign the stroke.
7. Keep all transforms receipt-bound and deterministic from the execution seed.

## Photoshop-class photographed-paper extraction

`tools/document_ink_finisher.py extract-photo` is the preferred finishing entry for handwriting photographed on white, pink, yellow, grey or unevenly lit paper.

```powershell
python tools/document_ink_finisher.py extract-photo `
  <private-photo.jpg> `
  <create-only-transparent.png> `
  --kind glyph `
  --crop x0,y0,x1,y1 `
  --keep kx0,ky0,kx1,ky1 `
  --proof <create-only-proof.png> `
  --evidence <create-only-evidence.json>
```

The sequence is deliberate:

1. take a generous reviewed source crop with enough surrounding paper to model illumination;
2. estimate the local low-frequency paper/lighting field rather than assuming a single white value;
3. derive ink alpha from darkness relative to that local paper, removing colour cast and shadow gradient;
4. apply a reviewed inner `keep` rectangle when neighbouring handwriting is present;
5. remove only tiny admitted photographic/JPEG components using a stricter policy for glyphs and a conservative policy for signatures/names;
6. soften the true ink edge slightly, then hard-prune alpha below the admitted floor so distant paper/JPEG ghosts are exactly transparent;
7. neutralise hidden/semitransparent paper RGB so white, grey, pink or yellow fringes do not appear after resampling;
8. fail closed when admitted ink touches the reviewed crop/keep boundary;
9. trim with safe padding and save a create-only transparent PNG;
10. create a proof over white, black and green backgrounds so matte/halo defects are visible immediately.

The proof is QA evidence only. It is never a handwriting source and is never admitted to a personal-marks profile.

## Wide crop + reviewed keep region

The source crop and keep region have different jobs and should not be conflated:

- `crop`: wide enough for reliable local paper/lighting estimation;
- `keep`: a reviewed rectangle inside that crop containing only the selected handwriting sample.

Pixels outside `keep` become transparent. Pixels inside are not inpainted, redrawn or reconstructed. Clear-edge QA applies to the admitted keep boundary so an actual clipped flourish/letter still fails even when the outer crop has lots of spare paper.

## Multi-variant handwriting atlas

`tools/handwriting_atlas.py` turns already-admitted transparent captures into a measured, SHA-pinned handwriting atlas. It is intentionally font-like in convenience but **not** a generated font: every rendered stroke comes from a genuine captured sample.

### Build

```powershell
python tools/handwriting_atlas.py build `
  <private-catalog.json> `
  <private-asset-root> `
  <create-only-atlas.json>
```

For every genuine glyph/fragment variant the builder records asset SHA-256, transparent canvas size, visible-ink bounding box, visible-ink width/height, side-bearing, bounded natural advance and optional reviewed style/label metadata. Exact duplicate variants are de-duplicated by content hash. Asset paths must remain below the selected private root.

A catalog may contain ordinary glyphs (`A`–`Z`, `0`–`9`, `/`, `@`, punctuation), whole fragments (`.com`, month words, frequently written abbreviations), and `wholeMarks` for separately captured `name` and `signature` samples.

### Render text or dates

```powershell
python tools/handwriting_atlas.py render `
  <private-atlas.json> `
  "25/08/26" `
  <create-only-render.png> `
  --seed job-123 `
  --proof <create-only-proof.png> `
  --receipt <create-only-receipt.json>
```

The same render command handles ordinary text, numbers and numeric dates. Month-word dates work when the atlas contains those genuine month fragments.

Rendering prefers the longest genuine fragment, chooses among genuine variants deterministically, avoids immediate repeats, normalizes each **whole glyph raster** to a shared ink height/baseline, preserves measured natural advance, applies only small whole-glyph variation, preserves spaces, fails closed on missing characters and never falls back to a computer font.

This creates the useful behaviour of a personal handwriting font — repeated letters and numbers do not always look identical — without inventing new pen strokes.

## Names and signatures

Use this hierarchy:

1. **Signature:** whole genuine signature variant only. Never construct a signature from letter glyphs.
2. **Name:** prefer a whole genuine handwritten-name variant when one matches the required presentation. Use glyph composition only when a different text string is genuinely required.
3. **Whole fragment/word:** prefer a genuine captured fragment such as `.com`, a month word or common abbreviation over decomposing it into letters.
4. **General text/date:** compose from genuine letter/number/separator variants.

### Select a whole mark by hash

```powershell
python tools/handwriting_atlas.py select-mark `
  <private-atlas.json> `
  --kind signature `
  --seed job-123 `
  --style natural
```

Selection returns SHA/style/count only and never exposes a private source path.

### Render a whole genuine name or signature

```powershell
python tools/handwriting_whole_mark.py `
  <private-atlas.json> `
  <create-only-output.png> `
  --kind signature `
  --seed job-123 `
  --style natural `
  --proof <create-only-proof.png> `
  --receipt <create-only-receipt.json>
```

`handwriting_whole_mark.py` selects one whole genuine captured name/signature variant, verifies its SHA pin, applies only bounded whole-raster scale/rotation, trims transparent safety canvas and creates the same white/black/green proof used by the glyph renderer. For signatures the receipt explicitly records `signatureSynthesizedFromGlyphs=false`. A previous source SHA can be supplied so another genuine variant is preferred on the next render.

## Transparent master

```powershell
python tools/document_ink_finisher.py master `
  <private-input.png> `
  <create-only-master.png> `
  --evidence <create-only-evidence.json>
```

The master stage trims excess transparent canvas, lightly feathers alpha when needed, clears/neutralises hidden RGB under transparent or semitransparent pixels to prevent matte fringes during resampling, and leaves admitted pen structure intact.

## Hostile-background proof standard

Every newly extracted personal-mark master and representative atlas/whole-mark render should be reviewed over white, near-black and saturated green. Reject the asset if any rectangular paper patch, paper cast, grey fringe, clipping, JPEG speckle, unexpected neighbouring stroke or over-soft edge becomes visible on any proof background.

## Local paper integration

```powershell
python tools/document_ink_finisher.py integrate `
  <private-mark.png> `
  <approved-paper-patch.png> `
  <create-only-integrated.png> `
  --kind signature `
  --seed <execution-seed> `
  --evidence <create-only-evidence.json>
```

The integration stage applies only bounded whole-raster scale/rotation/offset, optional small resolution-matched softness, and local multiply-style paper interaction. It does not apply a fake whole-page photocopy or scan filter.

## Variation limits

Default rigid limits are intentionally small:

| Mark | Rotation | Scale | Offset |
| --- | ---: | ---: | ---: |
| Signature | ±0.8° | ±1.8% | ±0.7 mm |
| Name | ±0.55° | ±1.5% | ±0.55 mm |
| Date | ±0.7° | ±1.8% | ±0.65 mm |
| Short text | ±0.55° | ±1.4% | ±0.45 mm |

The atlas renderer similarly defaults to approximately ±0.45° whole-glyph rotation, ±1.2% scale and very small baseline/x jitter. These are finishing tolerances, not stroke-generation parameters.

## Quality checks

Reject a finished personal mark or handwriting render when any paper halo/cast, residual camera shadow, isolated photographic speckles, clipping, neighbouring handwriting, excessive blur, stretched aspect ratio, implausible spacing/centering, colour mismatch, mechanically repeated variants, ignored natural advance, synthetic stroke deformation or out-of-region change is visible.

## Tests

```powershell
python -m unittest scripts/test_document_ink_finisher.py
python -m unittest scripts/test_handwriting_atlas.py
python -m unittest scripts/test_handwriting_document_bridge.py
python -m unittest scripts/test_handwriting_whole_mark.py
```

The focused suites cover photographed-paper cleanup, transparency/edge preservation, create-only policy, deterministic bounded transforms, genuine-variant selection, natural advance measurement, longest-fragment matching, repeat avoidance, missing-character fail-closed behaviour, whole-signature-only selection/rendering and Document Studio export.

## Governed private-node tasks

Art Studio exposes these operations through `evavo.tasks.d/document-ink-finishing.json` using the managed `image-finishing` Python environment, logical compute paths and network disabled:

- `document-ink-extract-photo`;
- `document-ink-master`;
- `document-ink-integrate`;
- `handwriting-atlas-build`;
- `handwriting-atlas-render`;
- `handwriting-whole-mark-select`;
- `handwriting-whole-mark-render`;
- `handwriting-document-export`.

The tasks create only private derivatives/atlases/proofs/evidence or return sanitized selection hashes. They grant no form-field selection, signing approval, publication or repository authority.

## Document Studio handoff

Document Studio may consume Art Studio finishing/atlas evidence as an image-quality input, but Art Studio evidence never grants document execution authority. Document Studio owns private capture/profile provenance, form interpretation, placement proposal and final PDF execution. The final document operation still requires an approved execution plan and exact source-document SHA-256. This keeps visual quality and signing authority deliberately separate.
