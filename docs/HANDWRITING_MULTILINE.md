# Genuine Handwriting Multiline Rendering

Use `tools/handwriting_multiline.py` when a genuine handwriting atlas needs to render more than one line of short text. The tool is a compositional layer over `tools/handwriting_atlas.py`; it does not introduce another handwriting generator.

## Authenticity boundary

- Every ink line is rendered independently by the existing SHA-pinned genuine-glyph atlas renderer.
- Missing characters still fail closed.
- There is no computer-font fallback.
- No pen stroke is synthesized, morphed or reconstructed.
- Signatures remain whole genuine captured marks and are not a multiline/glyph-rendering feature.

## Layout behaviour

- Newlines create real vertical line breaks.
- Empty lines remain empty and advance vertically by one normal line plus the configured gap.
- Each non-empty line receives a deterministic child seed derived from the job seed and line number.
- Genuine per-glyph variant selection, repeat avoidance, measured natural advance and bounded rigid variation remain owned by the single-line atlas renderer.
- The multiline layer only stacks the resulting transparent line rasters; it does not reshape them.
- Default line spacing is `0.55` times the median rendered line height and is bounded to `0.20..2.0`.
- At most 32 lines and 512 characters per line are accepted.

## Governed task

`handwriting-multiline-render` runs in the managed `image-finishing` Python environment with network disabled. It creates:

1. a transparent multiline PNG;
2. a white/black/green hostile-background proof;
3. a receipt containing line counts, per-line hashes/sizes, final output hash and truth-boundary evidence.

Example direct invocation:

```powershell
python tools/handwriting_multiline.py `
  <private-atlas.json> `
  "FIRST LINE`nSECOND LINE" `
  <create-only-output.png> `
  --seed <stable-seed> `
  --style uppercase `
  --proof <create-only-proof.png> `
  --receipt <create-only-receipt.json>
```

Use the normal single-line atlas renderer for names, labels and ordinary one-line form text. Prefer whole genuine name samples where available. Use `handwriting-whole-mark-render` for genuine signatures and whole-name marks; signatures must never be assembled from glyphs.
