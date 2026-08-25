# Genuine Handwriting Paragraph Rendering

Use `handwriting-paragraph-render` when genuine handwriting text must wrap naturally to a bounded line width. It is a composition layer over the existing genuine atlas and multiline renderer; it does not introduce a font engine or synthesize pen strokes.

## Tool choice

- **One line**: `handwriting-atlas-render`.
- **Explicit line breaks**: `handwriting-multiline-render`.
- **Automatic word wrapping to a width**: `handwriting-paragraph-render`.
- **Whole handwritten name/signature**: use the whole-mark path instead. Signatures are never assembled from glyphs.

## Wrapping model

Paragraph wrapping uses `normalized-genuine-advance-v1`.

For each genuine captured glyph/fragment variant it uses the atlas's measured:

- visible ink box;
- source ink height;
- natural advance;
- style;
- shared target ink height used by rendering.

The estimator applies the same normalized-advance clamp as `handwriting_atlas.render_text`. Spaces use the same atlas space factor. This keeps wrapping decisions aligned with the actual handwriting renderer without rasterising every trial phrase.

`maxWidthPx` is the handwriting **flow width**. The final transparent PNG may be slightly wider because the underlying renderer retains small transparent safety padding around line images and because tiny bounded whole-glyph rotation is permitted.

## Word integrity

Wrapping occurs only at whitespace between words. The system does not arbitrarily split an oversized word to make it fit. If a single genuine handwritten word is wider than `maxWidthPx`, rendering fails closed and the caller must choose a wider line or supply a deliberately captured fragment/break strategy.

Explicit blank source lines remain blank paragraph lines.

## Example

```powershell
python tools/handwriting_paragraph.py `
  <private-atlas.json> `
  "FIRST LINE OF GENUINE TEXT THAT MAY WRAP" `
  <create-only-output.png> `
  --seed note-001 `
  --max-width-px 900 `
  --style uppercase `
  --line-spacing-factor 0.55 `
  --proof <create-only-proof.png> `
  --receipt <create-only-receipt.json>
```

The receipt records source text, wrapped text, width evidence for every resulting line, line counts, output/proof hashes and the authenticity boundary.

## Limits

- source paragraph: at most 8192 characters;
- requested flow width: 120–8192 px;
- resulting multiline rendering: at most 32 lines;
- each resulting line: at most 512 characters;
- line-spacing factor: 0.20–2.0.

If wrapping would exceed the multiline limits, the operation fails instead of silently dropping text.

## Authenticity boundary

Paragraph rendering:

- uses genuine captured glyph/fragment variants only;
- preserves aspect ratio and stroke geometry;
- uses measured genuine advances;
- has no computer-font fallback;
- generates no synthetic handwriting;
- does not create or reconstruct signatures;
- grants no document signing, field-selection, publication or PDF-execution authority.
