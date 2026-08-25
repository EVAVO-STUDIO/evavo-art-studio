# Document Ink Finishing

Art Studio owns the visual finishing rules for genuine handwritten personal-mark raster assets used by Document Studio. It does **not** decide whether a document should be signed, which field is legally appropriate, or whether execution is approved.

## Ownership boundary

- **Document Studio**: form/PDF understanding, reviewed source/keep capture geometry, provenance, private profile construction, genuine date/text composition, candidate field geometry, reviewed execution plan, source-hash binding, PDF application and post-write visual QA.
- **Art Studio**: photographed-paper extraction, illumination/paper-cast correction, alpha cleanup, transparent-edge mastering, hostile-background proofing, multi-variant handwriting atlases, natural glyph spacing/side-bearing, whole-name/signature variant selection, rigid visual transforms, local paper integration and image-level quality evidence.
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

For every genuine glyph/fragment variant the builder records:

- asset SHA-256;
- transparent canvas size;
- visible-ink bounding box;
- visible-ink width/height;
- left/right/top/bottom side-bearing;
- a bounded natural advance derived from real ink width plus a small amount of the captured breathing room;
- optional reviewed style/label metadata.

Exact duplicate variants are de-duplicated by content hash. Asset paths must remain below the selected private root.

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

Rendering rules:

1. prefer the longest genuine captured fragment available at the current position;
2. choose among genuine variants deterministically from the render seed;
3. avoid immediately repeating the same variant when alternatives exist;
4. normalize each **whole glyph raster** to a shared ink height and baseline while preserving aspect ratio;
5. preserve a bounded amount of measured natural side-bearing/advance rather than advancing only by trimmed visible-ink width;
6. apply only small whole-glyph scale, baseline and rotation variation;
7. preserve explicit word spaces;
8. fail closed when any requested character/fragment is absent;
9. never fall back to a computer font;
10. produce an optional white/black/green hostile-background proof and hash-bound render receipt.

This creates the useful behaviour of a personal handwriting font — repeated letters and numbers do not always look identical — without inventing new pen strokes.

### Names and signatures

Use the hierarchy below:

1. **Signature:** whole genuine signature variant only. Never construct a signature from letter glyphs.
2. **Name:** prefer a whole genuine handwritten-name variant when one matches the required presentation. Use glyph composition only when a different name/text string is genuinely required.
3. **Whole fragment/word:** prefer a genuine captured fragment such as `.com`, a month word or common abbreviation over decomposing it into letters.
4. **General text/date:** compose from genuine letter/number/separator variants.

Whole-mark selection is deliberately separate:

```powershell
python tools/handwriting_atlas.py select-mark `
  <private-atlas.json> `
  --kind signature `
  --seed job-123 `
  --style natural
```

The result returns the selected SHA/style/count only and never exposes a private source path. For signatures it also records that the signature was **not** synthesized from glyphs.

## Transparent master

```powershell
python tools/document_ink_finisher.py master `
  <private-input.png> `
  <create-only-master.png> `
  --evidence <create-only-evidence.json>
```

The master stage trims excess transparent canvas, lightly feathers alpha when needed, clears/neutralises hidden RGB under transparent or semitransparent pixels to prevent matte fringes during resampling, and leaves admitted pen structure intact.

## Hostile-background proof standard

Every newly extracted personal-mark master and representative atlas render should be reviewed over at least:

- white;
- near-black;
- saturated green.

Reject the asset if any rectangular paper patch, pink/yellow cast, grey fringe, clipping, JPEG speckle, unexpected neighbouring stroke or over-soft edge becomes visible on any proof background. A mark that looks acceptable only on white is not production-ready.

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

A finished personal mark or handwriting render should be rejected when any of the following are visible at 100% or normal document viewing size:

- white/grey/pink/yellow rectangular paper halo;
- residual camera shadow or paper gradient inside transparency;
- isolated JPEG/paper-grain speckles;
- clipped ascender, descender, character stroke or signature flourish;
- neighbouring handwriting admitted into the crop;
- visible resampling stair-step or excessive blur;
- stretched aspect ratio;
- implausible centering in a long signature field;
- collision with field label, border or unrelated text;
- pen colour that no longer matches the genuine source without an explicit reviewed colour-normalisation step;
- repeated-date/text glyphs that are mechanically identical when genuine alternatives exist;
- spacing that ignores measured natural advance and makes letters look like stickers;
- synthetic stroke deformation;
- changes outside the approved mark region.

## Tests

Focused dependency-light validation:

```powershell
python -m unittest scripts/test_document_ink_finisher.py
python -m unittest scripts/test_handwriting_atlas.py
```

The tests cover photographed uneven-paper cleanup, transparency/edge preservation, create-only output policy, deterministic bounded transforms, genuine-variant selection, local-paper integration, natural advance measurement, longest-fragment matching, repeat avoidance, missing-character fail-closed behaviour and whole-signature-only selection.

## Governed private-node tasks

Art Studio exposes the finishing operations through `evavo.tasks.d/document-ink-finishing.json` using the managed `image-finishing` Python environment, logical compute paths and network disabled. In addition to extraction/master/integration it exposes:

- `handwriting-atlas-build`;
- `handwriting-atlas-render`;
- `handwriting-whole-mark-select`.

The governed tasks create only atlases/renders/proofs/evidence or return sanitized selection hashes. They grant no form-field selection, signing approval, publication or repository authority.

## Document Studio handoff

Document Studio may consume Art Studio finishing/atlas evidence as an image-quality input, but Art Studio evidence never grants document execution authority. Document Studio owns private capture/profile provenance, form interpretation, placement proposal and final PDF execution. The final document operation still requires an approved execution plan and exact source-document SHA-256. This keeps visual quality and signing authority deliberately separate.
