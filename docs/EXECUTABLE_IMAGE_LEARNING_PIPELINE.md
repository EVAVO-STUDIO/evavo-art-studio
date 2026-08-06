# Executable image learning pipeline

This pipeline converts approved visual references into measurable role-specific style profiles, executes deterministic edits, and independently compares each candidate to the exact source, work order and learned profile.

It is designed for large game-art corpora such as Brass & Brine `RAW_ART`. It does not treat an image as good merely because it resembles another image.

## Install the deterministic backend

```powershell
py -3 -m pip install -r requirements-image-pipeline.txt
```

Hosted and governed validation uses Python 3.13.5 with Pillow 12.2.0 exactly;
`requirements-image-pipeline.txt` is intentionally an exact pin rather than a
floating compatibility range.

Pillow is the primary cross-platform backend. A bounded Windows `System.Drawing` fallback is provided for opaque PNG canvas, resize and conversion work. It deliberately rejects meaningful-alpha and luminance-alpha jobs rather than producing a lower-fidelity substitute.

## 1. Build an approved style bank

The selection schema is `evavo.image-style-reference-selection.v1`:

```json
{
  "schema": "evavo.image-style-reference-selection.v1",
  "references": [
    {
      "sourcePath": "RAW_ART/characters/london_keeper.png",
      "sourceSha256": "<64 hex>",
      "semanticRole": "standing-character",
      "approvedTraits": [
        "front-facing readable silhouette",
        "engraved monochrome line hierarchy",
        "restrained red accent"
      ],
      "approvalAuthority": "<recorded review authority>",
      "reviewSha256": "<64 hex>"
    }
  ]
}
```

Compile it:

```powershell
py -3 tools/build_image_style_reference_bank.py `
  --source-root C:\GitRepos\Brass_Brine `
  --selection C:\EVAVO-Evidence\Brass_Brine\style-selection.json `
  --output C:\EVAVO-Evidence\Brass_Brine\style-bank.json
```

The bank learns role-specific distributions for:

- dimensions and aspect ratio;
- alpha usage;
- luminance and contrast;
- entropy and edge density;
- restrained red-accent ratio;
- subject occupancy and bounds;
- perceptual dHash;
- dominant palette.

Every reference retains its exact source hash, review hash, approved traits and approval authority. Duplicate bytes are admitted only once.

## 2. Execute an edit work order

```powershell
py -3 tools/process_image_work_order.py `
  --source-root C:\GitRepos\Brass_Brine `
  --output-root C:\EVAVO-Evidence\Brass_Brine\candidates `
  --work-order C:\EVAVO-Evidence\Brass_Brine\work-orders\london_keeper.json `
  --output standing_characters\london_keeper.png `
  --receipt C:\EVAVO-Evidence\Brass_Brine\receipts\london_keeper.json
```

The Pillow backend can perform:

```text
crop-safe
canvas-normalize
resize
connected-matte-to-alpha
luminance-to-alpha
edge-decontaminate
hidden-rgb-rebuild
palette-normalize
linework-strengthen
convert
optimize
```

Connected-matte removal floods only the border-connected matte. It does not globally key out all black or white pixels, so dark clothing, hair, rigging, internal holes and engraved shadows remain protected.

The processor:

- verifies the source hash before and after processing;
- rejects provider-generation decisions;
- writes a create-only candidate;
- decodes and rechecks the saved result;
- enforces canvas and alpha policy;
- records before and after features;
- writes `evavo.image-processing-receipt.v1` evidence.

## 3. Evaluate the candidate

```powershell
py -3 tools/evaluate_image_candidate.py `
  --source-root C:\GitRepos\Brass_Brine `
  --candidate-root C:\EVAVO-Evidence\Brass_Brine\candidates `
  --candidate standing_characters\london_keeper.png `
  --work-order C:\EVAVO-Evidence\Brass_Brine\work-orders\london_keeper.json `
  --style-bank C:\EVAVO-Evidence\Brass_Brine\style-bank.json `
  --processing-receipt C:\EVAVO-Evidence\Brass_Brine\receipts\london_keeper.json `
  --output C:\EVAVO-Evidence\Brass_Brine\evaluations\london_keeper.json
```

The evaluator blocks:

- wrong dimensions or runtime format;
- missing meaningful alpha or violated opaque policy;
- blank or fully transparent output;
- unchanged bytes for an edit or recreation;
- candidates outside the approved role profile;
- missing exact receipt bindings;
- tampered style banks.

It records semantic checks still required for approved traits, fixed defects, negative constraints, historical plausibility and cultural specificity. Technical and style-profile acceptance is not creative approval, Godot runtime approval or publication authority.

## Windows fallback

For compatible opaque PNG work:

```powershell
pwsh -NoProfile -File tools/process_image_work_order_system_drawing.ps1 `
  -SourceRoot C:\GitRepos\Brass_Brine `
  -OutputRoot C:\EVAVO-Evidence\Brass_Brine\candidates `
  -WorkOrder C:\EVAVO-Evidence\Brass_Brine\work-orders\document.json `
  -Output documents\document.png `
  -Receipt C:\EVAVO-Evidence\Brass_Brine\receipts\document.json
```

The fallback fails closed for operations it cannot reproduce faithfully.

## Permanent check

```powershell
py -3 tools/verify_executable_image_pipeline.py
```

The fixture creates approved reference images, learns a style bank, removes a connected matte, normalises and saves a candidate, evaluates it, rejects a blank candidate, and rejects a tampered style bank.

## Production authority

All outputs remain outside the target game checkout until the RAW_ART campaign, Godot Test Lab, browser review where required, and Development Studio publication gates accept the exact candidate. Source overwrite, source deletion, provider execution, target-repository mutation and publication are all false in this pipeline.
