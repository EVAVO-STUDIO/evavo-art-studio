# Document Ink Finishing

Art Studio owns the visual finishing rules for genuine handwritten personal-mark raster assets used by Document Studio. It does **not** decide whether a document should be signed, which field is legally appropriate, or whether execution is approved.

## Ownership boundary

- **Document Studio**: form/PDF understanding, candidate field geometry, reviewed execution plan, source-hash binding, PDF application and post-write visual QA.
- **Art Studio**: alpha cleanup, transparent-edge mastering, rigid visual transforms, local paper integration and image-level quality evidence.
- **Local Storage**: private physical asset boundary and logical-URI resolution on the Windows node.
- Genuine signature/name/month/digit source bytes never belong in Git.

## Non-negotiable authenticity rules

1. Never generate, redraw or morph a person's signature to create variation.
2. Signature variation may choose among separately captured genuine signatures and apply only bounded rigid transforms to the complete raster.
3. Handwritten names follow the same rule.
4. Flexible dates may combine genuine digit/separator/month-word captures. Missing handwriting fails closed rather than falling back to a font or generated imitation.
5. Preserve visible ink RGB and stroke density. Cleanup may change transparency around the stroke but must not redesign the stroke.
6. Keep all transforms receipt-bound and deterministic from the execution seed.

## Finishing pipeline

`tools/document_ink_finisher.py` provides the focused deterministic finishing surface.

### Transparent master

```powershell
python tools/document_ink_finisher.py master `
  <private-input.png> `
  <create-only-master.png> `
  --evidence <create-only-evidence.json>
```

The master stage trims excess transparent canvas, lightly feathers alpha when needed, clears hidden RGB under fully transparent pixels to prevent matte fringes during resampling, and leaves visible pen RGB untouched.

### Local paper integration

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

These values are finishing tolerances, not random deformation targets. A field that is too small should trigger a placement/review problem rather than progressively crushing or warping the mark.

## Quality checks

A finished personal mark should be rejected when any of the following are visible at 100% or normal document viewing size:

- white/grey rectangular paper halo;
- clipped ascender, descender or signature flourish;
- visible resampling stair-step or excessive blur;
- stretched aspect ratio;
- implausible centering in a long signature field;
- collision with field label, border or unrelated text;
- pen colour that no longer matches the genuine source without an explicit reviewed colour-normalisation step;
- repeated-date glyphs that are mechanically identical when genuine alternatives exist;
- synthetic stroke deformation;
- changes outside the approved mark region.

## Tests

Focused dependency-light validation:

```powershell
python -m unittest scripts/test_document_ink_finisher.py
```

The tests cover alpha preservation, deterministic bounded transforms, genuine-variant selection and local-paper integration.

## Document Studio handoff

Document Studio may consume Art Studio finishing evidence as an image-quality input, but Art Studio evidence never grants document execution authority. The final document operation still requires an approved execution plan and exact source-document SHA-256. This keeps visual quality and signing authority deliberately separate.
