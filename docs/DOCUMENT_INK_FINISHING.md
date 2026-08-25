# Document Ink Finishing

Art Studio owns the visual finishing rules for genuine handwritten personal-mark raster assets used by Document Studio. It does **not** decide whether a document should be signed, which field is legally appropriate, or whether execution is approved.

## Ownership boundary

- **Document Studio**: form/PDF understanding, reviewed source/keep capture geometry, provenance, private profile construction, genuine date/text composition, candidate field geometry, reviewed execution plan, source-hash binding, PDF application and post-write visual QA.
- **Art Studio**: photographed-paper extraction, illumination/paper-cast correction, alpha cleanup, transparent-edge mastering, hostile-background proofing, multi-variant handwriting atlases, natural glyph spacing/side-bearing, whole-name/signature variant selection and rendering, capture-sheet generation/registration, rigid visual transforms, local paper integration and image-level quality evidence.
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

## Coverage

`tools/handwriting_coverage.py <private-atlas.json>` reports exactly what the atlas can genuinely write. It verifies SHA pins/root confinement and reports complete/missing uppercase, lowercase and digits plus fragments, styles, whole-name counts and whole-signature counts. Missing characters are explicit.

## Capture worksheet specification

`tools/handwriting_capture_spec.py` creates a deterministic blank capture specification for collecting missing genuine samples. The default requests lowercase `a-z` twice, digits `0-9` three times, common punctuation/separators twice, `.com` and Jan-Dec twice, plus four whole name and four whole signature samples. It creates no handwriting.

```powershell
python tools/handwriting_capture_spec.py <capture-spec.json> --profile-id <private-profile-id>
```

## Printable capture sheets

`tools/handwriting_capture_sheet.py` turns the blank specification into printable A4 SVG worksheets. Each page contains large writing boxes, stable slot IDs, known millimetre geometry and four black corner fiducials. It also writes `capture-sheet-manifest.json` containing every slot's box and recommended ink-keep geometry.

```powershell
python tools/handwriting_capture_sheet.py <capture-spec.json> <create-only-sheet-directory>
```

The SVG sheets contain prompts only. They contain no generated handwriting, signature images or private personal-mark bytes. Print or view the page, write each requested sample naturally inside its box, then photograph the completed page.

## Four-corner photo registration

For each photographed worksheet page, provide the pixel coordinates of the four page corners using `contracts/handwriting-photo-registration.v1.schema.json`:

```json
{
  "schema": "evavo.art-studio.handwriting-photo-registration.v1",
  "page": 1,
  "cornersPx": {
    "topLeft": [120, 80],
    "topRight": [3900, 110],
    "bottomRight": [3880, 2920],
    "bottomLeft": [135, 2940]
  }
}
```

Then run:

```powershell
python tools/handwriting_capture_register.py `
  <capture-sheet-manifest.json> `
  <registration.json> `
  <private-photographed-page.jpg> `
  <create-only-document-studio-layout.json> `
  --page 1
```

The registration tool computes a four-point projective mapping from A4 millimetres to the photographed image and maps every known writing slot into source-image pixel geometry. It emits `evavo.document-studio.personal-marks-sheet-layout.v1`, including source-image SHA-256 and dimensions. It does not return handwriting pixels.

The generated layout then feeds Document Studio's existing governed path:

1. `personal-marks-sheet-layout` compiles the registered `inkRect`s into a source-SHA-bound capture manifest with wide source crops and inner keep regions;
2. `personal-marks-capture` performs the private photographed-paper cleanup/extraction;
3. captured derivatives are reviewed/proofed and admitted into the private atlas/profile;
4. coverage and capture-gap checks are rerun.

This removes fixed-grid guessing from future capture sheets while still requiring reviewed four-corner registration and downstream clear-edge/hostile-background QA.

## Capture gap planning

`tools/handwriting_capture_gap.py` compares the desired capture specification with the current genuine atlas and reports exactly what still needs to be collected.

```powershell
python tools/handwriting_capture_gap.py <capture-spec.json> <private-atlas.json> --output <gap-report.json>
```

For each token or whole-mark kind it reports required variants, current genuine variants and missing variants. The maintenance loop is therefore:

**coverage → capture spec → gap plan → printable sheet → write naturally → photograph → four-corner register → Document Studio capture → atlas rebuild → coverage/gap again.**

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

That command validates the governed handwriting task fragments and contracts, then runs the focused suites for photograph extraction, atlas rendering, whole marks, Document Studio bridge, coverage reporting, capture specification, gap planning, printable sheet generation, projective photo registration and contract compatibility.

All governed handwriting tasks use the managed `image-finishing` Python environment with network disabled. They create only private workflow artifacts or return sanitized read-only reports and never grant signing or document-execution approval.
