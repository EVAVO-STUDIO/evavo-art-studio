# Document Ink Finishing

Art Studio owns the visual finishing rules for genuine handwritten personal-mark raster assets used by Document Studio. It does **not** decide whether a document should be signed, which field is legally appropriate, or whether execution is approved.

## Ownership boundary

- **Document Studio**: form/PDF understanding, reviewed source/keep capture geometry, provenance, private profile construction, genuine date/text composition, candidate field geometry, reviewed execution plan, source-hash binding, PDF application and post-write visual QA.
- **Art Studio**: photographed-paper extraction, illumination/paper-cast correction, alpha cleanup, transparent-edge mastering, hostile-background proofing, multi-variant handwriting atlases, natural glyph spacing/side-bearing, whole-name/signature variant selection and rendering, capture-sheet generation/registration, multiline/paragraph composition, rigid visual transforms, local paper integration and image-level quality evidence.
- **Local Storage**: private physical asset boundary and logical-URI resolution on the Windows node.
- Genuine signature/name/month/digit/letter source bytes and private capture manifests never belong in Git.

## Authenticity hierarchy

1. Signature: whole genuine captured signature variant only.
2. Name: prefer whole genuine captured name variants.
3. Whole words/fragments: prefer a genuine captured fragment such as `.com` or a month word when available.
4. General text/date: compose from genuine captured glyph variants only.
5. Missing handwriting fails closed. There is no computer-font fallback and no synthetic pen-stroke generation.

## Photograph extraction

Use `tools/document_ink_finisher.py extract-photo` with a generous source crop plus reviewed inner keep region. The extractor models local paper/lighting, removes paper colour/shadow, suppresses tiny photographic noise, prunes faint alpha residue, decontaminates hidden matte RGB, checks the admitted edge and can produce a white/black/green hostile-background proof. It never redraws handwriting.

## Handwriting atlas

`tools/handwriting_atlas.py` builds a SHA-pinned multi-variant atlas from already-admitted transparent genuine captures. It measures visible ink bounds, side-bearing and natural advance. Rendering prefers longest genuine fragments, avoids immediate variant repeats, preserves word spaces and aspect ratio, uses a shared ink-height/baseline and only tiny whole-glyph rigid variation.

For longer content, `handwriting-multiline-render` stacks genuine single-line renders with a shared writing-session scale and tiny deterministic whole-line start variation. `handwriting-paragraph-render` additionally wraps at whitespace using the same normalized genuine-advance model. Neither path splits words arbitrarily or introduces a font fallback.

## Coverage

`tools/handwriting_coverage.py <private-atlas.json>` reports exactly what the atlas can genuinely write. It verifies SHA pins/root confinement and reports complete/missing uppercase, lowercase and digits plus fragments, styles, whole-name counts and whole-signature counts. Missing characters are explicit.

## Capture worksheet specification

`tools/handwriting_capture_spec.py` creates a deterministic blank capture specification for collecting missing genuine samples. The variation-rich default requests:

- lowercase `a-z`: three genuine variants each;
- digits `0-9`: three genuine variants each;
- common punctuation/separators: three genuine variants each;
- `.com` and Jan-Dec fragments: two genuine variants each;
- whole handwritten name: four genuine samples;
- whole signature: four genuine samples.

```powershell
python tools/handwriting_capture_spec.py <capture-spec.json> --profile-id <private-profile-id>
```

Use the governed `handwriting-capture-spec-full` task, or `--include-uppercase`, when a full alphabet refresh is wanted. Uppercase defaults to three genuine variants per letter. Lowercase, uppercase and punctuation targets are independently configurable from 1–6 variants. Existing two-variant banks remain valid genuine partial coverage; `handwriting-capture-gap` requests only the additional real samples needed to reach the selected target.

## Printable capture sheets

`tools/handwriting_capture_sheet.py` turns the blank specification into printable A4 SVG worksheets. Each page contains large writing boxes, stable slot IDs, known millimetre geometry and four black 7 mm fiducials whose centres are fixed at `(14,14)`, `(196,14)`, `(196,283)` and `(14,283)` millimetres. It also writes `capture-sheet-manifest.json` containing every slot's box and recommended ink-keep geometry.

```powershell
python tools/handwriting_capture_sheet.py <capture-spec.json> <create-only-sheet-directory>
```

The SVG sheets contain prompts only. They contain no generated handwriting, signature images or private personal-mark bytes. Print or view the page, write each requested sample naturally inside its box, then photograph the completed page.

## Fail-closed fiducial detection

`tools/handwriting_fiducial_detect.py` can propose the four physical page corners from a photographed generated worksheet by detecting the four printed solid-square fiducials.

```powershell
python tools/handwriting_fiducial_detect.py `
  <private-photographed-page.jpg> `
  <create-only-registration-proposal.json> `
  --page 1
```

The detector searches each image quadrant for one plausible high-fill square marker. It rejects missing markers, ambiguous quadrants and photographs whose inferred physical page is cropped outside the image. Because the printed squares are inset from the paper edge, their detected centres are **not** treated as page corners. The tool solves a projective transform from the known 14 mm fiducial-centre geometry and extrapolates the true A4 page corners.

Every automatic result records `manualReviewRequired=true`. Auto-detection is therefore a registration **proposal**, not trusted capture geometry.

## Digest-bound registration review

An auto-detected proposal must be reviewed before slot projection. Review artifacts use `contracts/handwriting-registration-review.v1.schema.json` and bind to the exact proposal SHA-256.

```json
{
  "schema": "evavo.art-studio.handwriting-registration-review.v1",
  "proposalSha256": "<sha256-of-registration-proposal>",
  "decision": "accept",
  "reviewedCornersPx": {
    "topLeft": [120, 80],
    "topRight": [3900, 110],
    "bottomRight": [3880, 2920],
    "bottomLeft": [135, 2940]
  }
}
```

After checking the proposed corners against the photographed page, bind the review:

```powershell
python tools/handwriting_registration_review.py `
  <registration-proposal.json> `
  <review.json> `
  <create-only-reviewed-registration.json>
```

The review tool verifies `proposalSha256`, records the SHA-256 of the exact review artifact, records whether the corners changed during review and creates a reviewed registration with `manualReviewCompleted=true`. It rejects already-reviewed proposals, preventing nested/replayed review chains. It does not read or return handwriting pixels. `handwriting_capture_register.py` rejects any auto-detected registration that lacks this review evidence. Manual corner registrations remain valid directly because their corners were explicitly supplied rather than auto-detected.

## Four-corner photo registration

Registration files use `contracts/handwriting-photo-registration.v1.schema.json`. Project known worksheet slots only from a manual registration or from the reviewed output above:

```powershell
python tools/handwriting_capture_register.py `
  <capture-sheet-manifest.json> `
  <reviewed-registration.json> `
  <private-photographed-page.jpg> `
  <create-only-document-studio-layout.json> `
  --page 1
```

The registration tool computes a four-point projective mapping from A4 millimetres to the photographed image and maps every known writing slot into source-image pixel geometry. It emits `evavo.document-studio.personal-marks-sheet-layout.v1`, including source-image SHA-256, dimensions, whether the corners came from auto-detection, the proposal digest and the review-artifact digest. It does not return handwriting pixels.

The generated layout then feeds Document Studio's existing governed path:

1. `personal-marks-sheet-layout` validates the review provenance and compiles the registered `inkRect`s into a source-SHA-bound capture manifest with wide source crops and inner keep regions;
2. `personal-marks-capture` performs the private photographed-paper cleanup/extraction;
3. captured derivatives are reviewed/proofed and admitted into the private atlas/profile;
4. coverage and capture-gap checks are rerun.

## Capture gap planning

`tools/handwriting_capture_gap.py` compares the desired capture specification with the current genuine atlas and reports exactly what still needs to be collected.

```powershell
python tools/handwriting_capture_gap.py <capture-spec.json> <private-atlas.json> --output <gap-report.json>
```

For each token or whole-mark kind it reports required variants, current genuine variants and missing variants. The maintenance loop is therefore:

**coverage → capture spec → gap plan → printable sheet → write naturally → photograph → fiducial proposal → digest-bound corner review → project slots → Document Studio capture → atlas rebuild → coverage/gap again.**

It never creates replacement handwriting for a missing slot.

## Whole names and signatures

Use `tools/handwriting_whole_mark.py` to render a whole genuine name/signature variant. It verifies the source SHA and applies only bounded whole-raster scale/rotation before generating transparent output, hostile-background proof and receipt. Signature receipts state `signatureSynthesizedFromGlyphs=false`.

## Document Studio handoff

`tools/handwriting_document_bridge.py` exports a create-only profile seed under `contracts/handwriting-document-export.v1.schema.json`. The export copies no image bytes. Document Studio admits that export through the governed `personal-marks-art-import` path, creates an import receipt and retains all PDF approval/source-hash authority.

## Focused acceptance

Run:

```powershell
node scripts/check-handwriting-all.mjs
```

That command validates the governed handwriting task fragments and contracts, then runs the focused suites for photograph extraction, atlas rendering, multiline rendering, paragraph wrapping, whole marks, Document Studio bridge, coverage reporting, capture specification, gap planning, printable sheet generation, fail-closed fiducial detection, digest-bound registration review, projective photo registration and contract compatibility.

All governed handwriting tasks use the managed `image-finishing` Python environment with network disabled. They create only private workflow artifacts or return sanitized read-only reports and never grant signing or document-execution approval.
