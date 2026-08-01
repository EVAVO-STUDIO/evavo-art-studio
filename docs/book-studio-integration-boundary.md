# Book Studio Integration Boundary

Status: active independent Art Studio authority  
Reviewed: 2 August 2026

## Decision

EVAVO Art Studio remains the canonical art-production authority for Book Studio cover and illustration work.

Book Studio currently runs from `EVAVO-STUDIO/Website/tools/evavo-doc-studio` and is intended to move into `EVAVO-STUDIO/evavo-docs-suite` only after parity-proven cutover. That repository transition does not move Art Studio source or authority.

## Book Studio owns

- exact manuscript, series and edition identity;
- manuscript-grounded cover and illustration briefs;
- visual route requirements and prohibited elements;
- spoiler, historical and continuity constraints;
- illustration inventory, placement, captions and accessibility;
- approval requirements and publication dependencies;
- editable title, author, spine, back-cover, ISBN and barcode layout.

## Art Studio owns

- provider-neutral cover and illustration candidate execution;
- immutable provider, source, model and prompt provenance;
- candidate mastering, comparison, repair, selection and promotion;
- approved artifact references;
- print and digital image delivery packages and evidence.

A successful provider response is never an approved book asset. Art Studio must retain it as an intermediate candidate until the declared selection, quality and promotion stages pass.

## Contract boundary

The repositories communicate through versioned HTTP, OpenAPI, job, artifact, event and receipt contracts. They do not import each other's runtime source.

Book Studio requests must be bound to the exact manuscript, edition and art-brief fingerprints. Book Studio consumes immutable Art Studio artifact references rather than raw provider responses or unverified file paths.

Generated artwork remains text-free whenever Book Design Studio must retain editable typography, captions, labels, series identity, ISBN or barcode authority.

## What Art Studio does not own

Art Studio does not own:

- canonical manuscript or series state;
- book interior layout or edition pagination;
- KDP metadata, rights, AI disclosure, ISBN or barcode authority;
- Kindle or print Previewer evidence;
- physical-proof approval;
- Amazon upload or publication.

## Repository transition safety

The Book Studio move to Docs Suite is staged. During the transition:

```text
websiteBookStudioStillActive: true
docsSuiteCutoverApproved: false
runtimeSourceMoved: false
artAuthorityTransferred: false
providerCandidateIsFinal: false
publicationPerformed: false
```

## Machine-readable authority

```text
docs/book-studio-integration-boundary.json
```

Verify it with:

```powershell
node scripts/check-book-studio-integration-boundary.mjs
```
