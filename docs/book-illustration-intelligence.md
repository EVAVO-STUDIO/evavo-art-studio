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
