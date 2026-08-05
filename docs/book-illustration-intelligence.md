# Book illustration intelligence

`evavo_art_book_illustration_intelligence_v1` compiles and evaluates print-aware book illustration plans. It supports covers, interior plates, spots, maps, diagrams, ornaments, endpapers, graphic-novel pages and panels.

## Craft model

The contract describes historical and contemporary print mechanisms rather than relying on a superficial texture label. Supported process families include relief engraving, etching, scratchboard, brush-and-pen halftone, linocut, lithographic tone, duotone, risograph, black-only linework, graphic novels, children’s illustration, technical plates, cartography and ornamental print.

Mark grammar controls contour hierarchy, hatch direction, crosshatch depth, stipple density, black-mass use, material-specific marks, line-width thresholds, tonal steps and print separation. Candidate QA measures these alongside anatomy, hands and faces, perspective, continuity, composition, repeated textures, pseudo-detail, random noise and excessive digital smoothing.

## Exact print geometry

Art Studio never guesses a print canvas from trim dimensions. Docs Suite supplies:

- exact delivery width and height;
- trim dimensions;
- geometry authority `docs_suite_exact_dimensions`;
- an external-template fingerprint for full-wrap covers;
- bleed, PPI, colour, paper, screen-frequency and ink-coverage requirements.

Continuous-tone artwork requires at least 300 PPI. Pure line art is planned at 600 PPI or higher. The provider candidate remains an editable intermediate; a flattened delivery derivative is separately required where the edition demands it.

## Rights-safe genre translation

A request such as “Warhammer style” is not copied literally. The contract offers `grimdark_tabletop_fantasy` as a generic, project-owned route and rejects named-creator imitation, franchise marks, proprietary symbols, recognisable trade dress, “AI-undetectable” requests and false handmade claims.

## Editable presentation

Generated artwork remains text-free. Docs Suite owns titles, author lines, spines, back-cover copy, dialogue balloons, captions, sound effects, labels, alt text and reading order. Graphic-novel artwork requires editable lettering separation.

## CLI

```bash
pnpm --filter @evavo/art-contracts build
node scripts/evavo-art-book-illustration-cli.mjs capabilities
node scripts/evavo-art-book-illustration-cli.mjs compile-plan --input art-plan-input.json --output art-plan.json
node scripts/evavo-art-book-illustration-cli.mjs validate-plan --input art-plan.json
node scripts/evavo-art-book-illustration-cli.mjs evaluate-candidate --input candidate-evidence.json
```

Output paths are no-clobber. A candidate can reach only `ready_for_independent_review`; this contract cannot select, promote, bind to a book or publish it.

## Candidate generation dispatch

Cover and interior candidate generation are separate capability IDs:

- `book.cover.candidates.generate`
- `book.interior.candidates.generate`

The dispatcher binds the exact illustration plan, visual packet, source brief,
prevalidated work-order fingerprint, provider-runtime request fingerprint and
adapter-policy fingerprint to the existing
`evavo_book_art_provider_shadow_runtime_v1` boundary. A provider-backed dispatch
permits exactly one attempt, prohibits fallback, and retains mandatory
selection, promotion and Book-use gates. Compiling a dispatch does not itself
call a provider or write candidate bytes.

## Independent visual consensus

`book.visual.consensus` verifies exact reviewer receipts for one candidate and
its exact content digest, artifact fingerprint, plan and QA result. Reviewers
must be distinct from the candidate producer and from each other. Every receipt
has a deterministic fingerprint, canonical timestamp, score, decision,
evidence and findings.

A low score cannot pass merely because its decision string says `pass`.
Consensus is calculated from reviewers who both declare `pass` and meet the
configured score threshold. Dissenting reviewer identities and minority
findings remain in the result. The strongest result is
`ready_for_governed_selection`; no selection, promotion, Book-use binding or
publication is performed.

Additional CLI operations:

```bash
node scripts/evavo-art-book-illustration-cli.mjs compile-generation-dispatch --input dispatch-input.json
node scripts/evavo-art-book-illustration-cli.mjs evaluate-visual-consensus --input consensus-input.json
```
