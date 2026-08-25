# Document Ink Finishing

Art Studio owns the visual finishing rules for genuine handwritten personal-mark raster assets used by Document Studio. It does **not** decide whether a document should be signed, which field is legally appropriate, or whether execution is approved.

## Ownership boundary

- **Document Studio**: form/PDF understanding, reviewed source/keep capture geometry, provenance, private profile construction, genuine date/text composition, candidate field geometry, reviewed execution plan, source-hash binding, PDF application and post-write visual QA.
- **Art Studio**: photographed-paper extraction, illumination/paper-cast correction, alpha cleanup, transparent-edge mastering, hostile-background proofing, multi-variant handwriting atlases, natural glyph spacing/side-bearing, whole-name/signature variant selection and rendering, rigid visual transforms, local paper integration and image-level quality evidence.
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

`tools/handwriting_capture_spec.py` creates a deterministic **blank capture specification** for collecting missing genuine samples. It does not create handwriting. The default spec requests:

- lowercase `a-z`, two natural variants each;
- digits `0-9`, three variants each;
- common punctuation/separators including `/ . , - @ & ( ) + #`;
- `.com` plus Jan-Dec fragments;
- four whole handwritten-name samples;
- four whole signature samples.

```powershell
python tools/handwriting_capture_spec.py `
  <create-only-capture-spec.json> `
  --profile-id <private-profile-id>
```

Use `--include-uppercase` only when a fresh uppercase bank is also needed. Every slot declares its token, variant number, style and QA requirements. The capture spec is safe to keep as workflow metadata, but the subsequently photographed sheets and transparent derivatives remain private personal-mark assets and must not be committed to Git.

## Capture gap planning

`tools/handwriting_capture_gap.py` compares the desired capture specification with the current genuine atlas and reports **exactly what still needs to be collected**.

```powershell
python tools/handwriting_capture_gap.py `
  <capture-spec.json> `
  <private-atlas.json> `
  --output <create-only-gap-report.json>
```

For each token or whole-mark kind it reports required variant count, current genuine variant count and missing variant count. The intended maintenance loop is:

1. create/reuse the capture specification;
2. compare it with the current atlas;
3. collect only missing genuine samples;
4. extract/admit those samples with reviewed crop + keep regions;
5. rebuild the atlas;
6. rerun coverage and gap checks until the required bank is complete.

This prevents repeated collection of handwriting already captured and makes lowercase/symbol expansion measurable. It never creates replacement handwriting for a missing slot.

## Whole names and signatures

Use `tools/handwriting_whole_mark.py` to render a whole genuine name/signature variant. It verifies the source SHA and applies only bounded whole-raster scale/rotation before generating transparent output, hostile-background proof and receipt. Signature receipts state `signatureSynthesizedFromGlyphs=false`.

## Document Studio handoff

`tools/handwriting_document_bridge.py` exports a create-only profile seed under `contracts/handwriting-document-export.v1.schema.json`. The export copies no image bytes. Document Studio performs a separate admission step and retains all PDF approval/source-hash authority.

## Focused acceptance

Run:

```powershell
node scripts/check-handwriting-all.mjs
```

That command validates the governed handwriting task fragments and export contract, then runs the focused suites for photograph extraction, atlas rendering, whole marks, Document Studio bridge, coverage reporting, capture-spec generation, capture-gap planning and contract compatibility.

All governed handwriting tasks use the managed `image-finishing` Python environment with network disabled. They create only private workflow artifacts or return sanitized read-only reports and never grant signing or document-execution approval.
