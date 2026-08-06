# Book creative-direction intelligence

The versioned contract is:

`evavo_book_art_creative_direction_v1`

This is the bridge between Writing Studio narrative evidence and Art Studio
candidate production. It does not ask an image provider to “be creative.” It
compiles a specific visual argument from the manuscript, genre, audience,
motifs, settings, characters, scenes, print process and book-layout needs.

## Evidence before aesthetics

Every direction starts with evidence-bound themes, motifs, settings, character
states and scene candidates. Each visible element must have a manuscript or
research reason. A style adjective, genre label or model-friendly phrase cannot
replace evidence.

The compiler rejects:

- named-creator imitation;
- branded-franchise transfer;
- generic provider-prompt shorthand;
- missing source locations;
- invented rights evidence;
- generated typography or labels;
- cover routes that expose major or ending spoilers;
- insufficiently distinct concept routes.

## Concept routes

The compiler creates several materially different concept routes rather than
one prompt with cosmetic variations. Depending on the book, routes can include:

- material symbol;
- environment as pressure;
- relational tension;
- consequence before or after peak action;
- systems cutaway;
- comparative plate;
- sequential rhythm for graphic novels;
- ritual or process;
- typography-led negative space.

The selected route programmes must use different route kinds and composition
archetypes. Each route compiles through the existing governed Book Art brief,
production work order and candidate-set work order. The default is two routes
with three candidates per route, producing six genuinely different candidates
before visual consensus and Docs Suite quality review.

## Style and genre intelligence

The catalogue covers literary, historical, horror, mythic, project-owned
grimdark fantasy, science fiction, crime, romance, children’s books, memoir,
documentary, technical and reference books, graphic novels, pulp, poetry,
cookbooks, academic works and custom genres.

A genre profile controls:

- suitable historical print processes;
- composition archetypes;
- tonal architecture;
- palette logic;
- physically motivated light;
- rhythm and information density;
- known genre clichés to prohibit.

The output is project-owned. It can use historical print processes such as wood
engraving, intaglio, scratchboard, linocut, lithographic tone, duotone,
risograph, brush-and-pen halftone, technical plate and cartographic linework,
but it may not reconstruct a living illustrator’s recognisable surface style.

Historical references support process logic rather than imitation. The
Metropolitan Museum of Art notes that early woodcuts needed robust outlines
because very thin lines could break under pressure; the compiler therefore
treats contour hierarchy and reproduction limits as structural decisions, not
as a scratch texture applied after rendering.

## Material-specific mark grammar

Old-school linework is not simulated by covering an image in random scratches.
The plan requires:

- primary contours for silhouette and structural load;
- secondary contours for plane breaks and construction;
- tertiary marks only where material, light or evidence changes;
- hatching that follows form, material and light;
- distinct edge, wear and mark behaviour for timber, brick, iron, cloth,
  paper, skin, stone, water and other materials;
- controlled black masses and a readable thumbnail;
- hand-resolved transitions and controlled irregularity;
- print-safe positive and reverse lines.

It rejects uniform micro-detail, cloned texture stamps, global distress layers,
plastic smoothing, arbitrary rim light, floating particles, meaningless runes,
pseudo-text and generic movie-poster hierarchy.

## Composition

Composition is derived from purpose and narrative pressure, not from a stock
genre template. The compiler plans focal hierarchy, depth, value groups,
negative space, camera logic, action vectors, title and author zones, reading
direction, spine direction and barcode-safe regions.

Covers favour spoiler-safe symbols, environments, relationships and
consequences. Interior illustration may use later scenes when allowed. Graphic
novels add sequential rhythm, stable camera geography, page-turn logic and
editable balloon or caption space. Technical and reference books use systems,
comparison and label-ready geometry without generated labels.

## Production and authority

The compiler:

1. creates the creative-direction plan;
2. compiles route-specific `evavo_book_art_brief` records;
3. compiles governed production work orders;
4. compiles candidate-set work orders.

It never accepts a provider image as final. It performs no provider call,
selection, promotion, Book-use binding or publication. Every candidate still
requires technical QA, print-craft QA, independent visual consensus, complete
pairwise comparison, Docs Suite creative-quality review, governed selection
and promotion.

## Permanent verification

The source-boundary checker is part of the root `pnpm check` chain. The
dedicated workflow also runs frozen installation, strict contracts TypeScript,
the complete contracts test suite and a clean-tree proof. The release therefore
fails closed if genre coverage, route diversity, anti-generic safeguards or the
non-authoritative production boundary is removed.

## Print readiness

The creative compiler preserves the exact output geometry and delegates final
print validation to the existing illustration intelligence and Docs Suite
edition pipeline. KDP currently requires print images of at least 300 DPI and
0.125 inch bleed where artwork reaches the edge; exact cover dimensions remain
edition-owned rather than guessed by the provider.

## Example entrypoint

```ts
const result = await compileBookArtCreativeDirection(input);

if (result.status !== "ready") {
  throw new Error(result.blockers.join(" "));
}

for (const programme of result.plan.routeProgrammes) {
  // Submit programme.candidateSetWorkOrder through the governed runtime.
}
```
