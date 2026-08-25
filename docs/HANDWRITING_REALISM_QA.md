# Handwriting Realism QA

Use this after rendering genuine handwriting and before document placement when the output is more than a trivial one-off mark.

The purpose is to catch **mechanical-looking assembly patterns** without modifying handwriting. It is deliberately read-only.

## Production gate

1. Render with the narrowest appropriate genuine-handwriting tool:
   - `handwriting-atlas-render` for one line;
   - `handwriting-multiline-render` for explicit line breaks;
   - `handwriting-paragraph-render` for width-aware word wrapping;
   - `handwriting-whole-mark-render` for a whole genuine name/signature.
2. Review the white / near-black / saturated-green hostile-background proof at the final intended placement scale.
3. Run realism QA against the private atlas and render receipt:

```powershell
python tools/handwriting_realism_qa.py `
  <private-atlas.json> `
  <render-receipt.json> `
  --output <create-only-realism-qa.json>
```

4. Treat warnings as reasons to review or improve the genuine capture bank. Never use the QA result to generate replacement handwriting.
5. Hand the selected render to Document Studio only after visual review is satisfactory.

## What QA checks

For single-line renders it looks for:

- immediate reuse of the same captured variant for a repeated token;
- repeated tokens using too little of an available three-or-more-variant bank;
- tokens for which only one genuine variant exists;
- long lines with almost no bounded rotation/scale diversity.

For multiline and paragraph receipts it looks for:

- line scale outside the bounded whole-line normalization range;
- three or more lines beginning at nearly identical horizontal positions;
- inconsistent effective handwriting size between lines;
- missing paragraph wrap evidence.

The report contains `score`, `grade`, metrics and warnings. `strong` means the receipt has no current mechanical-pattern warning; it does **not** certify that a human will always perceive the result as authentic. Final visual review still matters.

## Realism principles

- Prefer three or more genuine variants for frequently repeated letters and punctuation.
- Prefer a whole genuine captured fragment when available, for example a captured month abbreviation or `.com`.
- Keep transforms small and applied to whole captured glyph/line rasters only.
- Preserve measured natural advance and visible side-bearing instead of putting every glyph into a fixed tile.
- Keep multiline writing-session scale coherent while allowing a tiny deterministic line-start drift.
- Never fabricate a missing lowercase letter, punctuation mark, name or signature.
- Signatures remain whole genuine captures only.

## Current practical target

The capture-spec defaults target:

- lowercase: 3 genuine variants per letter;
- optional uppercase refresh: 3 genuine variants per letter;
- digits: 3 genuine variants;
- punctuation/separators: 3 genuine variants;
- common fragments such as `.com` and Jan-Dec: 2 genuine variants;
- whole handwritten name: 4 genuine variants;
- whole signature: 4 genuine variants.

An existing smaller bank remains valid partial coverage. `handwriting-capture-gap` identifies the missing genuine variants; it never synthesizes them.
