# Book Studio Universal Production Readiness

## Purpose

The universal readiness compiler turns one versioned `evavo_docs_book_project_v1` project into a deterministic, evidence-led production plan before Writing Studio, Art Studio, edition rendering, external proofing or release work begins.

It supports all 16 content classes currently defined by Book Studio:

```text
fiction
memoir
nonfiction
academic
textbook
reference
cookbook
children
graphic_novel
poetry
anthology
workbook
manual
illustrated
hybrid
custom
```

The compiler works for one standalone book or for dependency-ordered series, collections, shared universes and mixed catalogues. It uses the existing project normalizer and programme compiler rather than inventing a second Book schema.

## Result contract

```text
evavo_docs_book_universal_readiness_v1
```

The result can be:

```text
blocked
needs_work
ready_for_automation
```

`ready_for_automation` means the project has a coherent, bounded production plan. It does not claim that subjective creative quality is guaranteed, that external proofing has happened, or that the book has been published.

Every result is canonical-JSON fingerprinted and includes:

- deterministic release waves and ordered volume IDs;
- content-class-specific review profiles and quality gates;
- enabled edition and output expectations;
- cover and illustration targets;
- a complete owner-separated automation graph;
- machine-readable blockers, warnings and remediations;
- project, programme, volume and result fingerprints.

## Writing Studio integration

Writing Studio remains the reusable candidate authority for voice-, source- and fact-bound drafting and revision. Each volume plan includes:

```text
source_coverage
  -> writing_candidate
  -> editorial_review
  -> canonical_admission
```

The Writing candidate stage is automatic only through the protected Docs Suite to Writing Studio handoff. Writing Studio cannot mutate the canonical manuscript, approve admission, call Art Studio or publish.

## Cover and illustration authority

Docs Suite owns manuscript evidence, creative direction, typography, page layout, edition geometry and final Book-use decisions. Art Studio owns image execution, immutable candidates, technical QA, selection evidence and promotion.

For an Art-enabled cover, the compiler requires:

```text
cover_brief             Docs Suite
cover_candidate         Art Studio
cover_quality           Art Studio
cover_selection         named human/external gate
cover_promotion         Art Studio
cover_binding           Docs Suite
```

Generated cover artwork remains text-free when the project policy requires it. Title, author, series, spine, back-cover copy, ISBN and barcode remain editable Docs Suite layers.

For illustrations, the equivalent pipeline requires manuscript-bound briefs, source and model provenance, technical and page-context review, immutable promotion, exact Book Artwork Use bindings, captions, alt text and reading-order evidence.

A typography-only cover can proceed without inventing Art Studio provider work. It still requires a Docs-owned cover brief and a named cover selection gate.

## Cross-field and edge-case checks

The compiler catches contradictions that a structurally valid project can otherwise contain, including:

- no enabled edition;
- a release candidate without an immutable manuscript identity;
- missing named volume or release approval;
- graphic novels or illustrated books with no illustration programme;
- visual work requested while Art Studio is disabled;
- generated cover or illustration text conflicting with editable typography or labels;
- a series without a shared cover identity;
- cover work not bound to exact manuscript evidence;
- source-critical visuals without evidence;
- reflowable Kindle output paired with fixed-layout-only illustrations;
- missing reflow accessibility fallback;
- missing metadata, rights or AI-disclosure decisions;
- print output without ISBN or barcode evidence;
- print editions without exact trim, current template, Previewer or proof gates;
- Kindle editions without current Kindle Previewer evidence;
- print editions using an audio or digital-only colour mode;
- audiobook editions carrying print geometry;
- missing output-role identities;
- duplicate normalized volume titles;
- excessive cover-candidate programmes that require reviewed waves.

Content classes where visuals are often useful but not universally mandatory receive a warning rather than a false hard rule. Custom books remain supported through the existing versioned custom content class and bounded extensions.

## Human and external gates

Automation is deliberately bounded. Provider-backed and deterministic validation stages may run automatically, but the following remain explicit gates:

- canonical manuscript admission;
- cover and illustration selection;
- immutable Art Studio promotion;
- exact Book-use binding;
- current Kindle or print Previewer result;
- physical proof review;
- ISBN and barcode evidence;
- rights and disclosure decisions;
- named release approval;
- manual platform submission.

This separation is what allows the system to automate deeply without allowing a model score, provider response or stale proof to publish a book automatically.

## Protected REST API

```text
GET  /api/v1/book-studio/universal-readiness
POST /api/v1/book-studio/universal-readiness
```

Both require `documents:read`. GET reports capabilities. POST accepts one complete Book project and returns the readiness result. Responses are private and no-store. The route performs no provider or file-system operation.

## CLI

```text
node apps/web/scripts/evavo-docs-book-readiness-cli.mjs capabilities
node apps/web/scripts/evavo-docs-book-readiness-cli.mjs compile --input project.json
node apps/web/scripts/evavo-docs-book-readiness-cli.mjs compile --input project.json --output readiness.json
```

The CLI uses `EVAVO_DOCS_TOKEN` and `EVAVO_DOCS_URL`. Output files use exclusive no-clobber creation.

## MCP

```text
node apps/web/scripts/evavo-docs-book-readiness-mcp.mjs
```

The strict tool is:

```text
compile_book_universal_readiness
```

It forwards exactly one `project` object to the protected REST endpoint. It does not duplicate readiness logic in the adapter.

## Authority boundary

```text
planningOnly: true
oneBoundedStagePerAutomationCallRequired: true
providerCallPerformed: false
runtimeJobSubmitted: false
artifactBytesWritten: false
canonicalAdmissionAllowed: false
canonicalManuscriptMutationPerformed: false
automaticPublicationAllowed: false
runtimeCutoverApproved: false
publicationPerformed: false
```

The compiler improves project planning, consistency and failure detection. It cannot honestly guarantee artistic success, commercial success or the absence of every subjective weakness. Those claims require real manuscript review, generated or commissioned artifacts, rendered editions, external tools, physical proof and named decisions.
