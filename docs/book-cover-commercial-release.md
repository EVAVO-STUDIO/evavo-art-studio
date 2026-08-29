# Book cover commercial release authority

The versioned contract is:

`evavo_art_book_cover_commercial_release_v1`

This authority is the final Art Studio gate before EVAVO Docs Suite may compose editable title, author, series, spine, back-cover and barcode content around approved cover artwork. It does not publish a book, promote a provider candidate automatically or make a sales claim.

## Local validation is authoritative

The production path is deliberately local-first and compatible with GitHub and Vercel free tiers.

- GitHub Actions are optional wrappers. Their presence, absence, queue status or billing state is never release authority.
- Vercel is not a background worker for cover generation, raster review, market crawling or print preflight.
- No paid CI service is required.
- No paid crawler is required.
- No paid image API is required for validation.
- Validation uses retained JSON evidence and local deterministic code. It does not browse a marketplace during a request.
- Heavy image work and raster QA remain in the local Art Studio production environment.

Run a complete compile and validation locally:

```powershell
node scripts/run-book-cover-commercial-release-local.mjs --input .\path\to\release-input.json --output .\artifacts\cover-commercial-release.json
```

Validate an already compiled authority:

```powershell
node scripts/run-book-cover-commercial-release-local.mjs --authority .\artifacts\cover-commercial-release-authority.json --output .\artifacts\cover-commercial-release-validation.json
```

The runner builds `@evavo/art-contracts` locally unless `--no-build` is supplied. Exit code `0` means the authority is valid and ready for Docs Suite composition. Exit code `2` means the authority is valid but still needs research, proofs or human review. Exit code `1` means the input or retained authority is invalid.

Run the permanent source and regression check:

```powershell
node scripts/check-book-cover-commercial-release.mjs
```

The check compiles the contracts package and runs the focused tests locally. It performs no network request.

## Evidence chain

The compiler binds six separate decisions into one SHA-256 authority:

1. A current Website or Docs Suite genre-and-market authority.
2. An Art Studio book-cover design-intelligence direction.
3. A selected route that exists in that exact direction.
4. The candidate-set authority, selected candidate file and final text-free artwork file.
5. Rights, provenance and named human-finishing evidence.
6. Every required retail and print proof plus named final approval.

Changing any retained input changes the authority digest. Editing a compiled authority after approval fails validation.

## Market evidence gate

A production handoff requires current, diverse market evidence rather than a mood board assembled from a few visible bestsellers. The portable market snapshot must include at least:

- 12 current comparable covers;
- 3 category leaders;
- 3 recent releases;
- 3 adjacent opportunities;
- 2 category paths;
- 8 distinct authors;
- 3 visual modes;
- 2 title-style families;
- 3 palette families;
- 2 evidence-source hosts; and
- 6 retained cover-snapshot digests.

The market authority must be no more than 45 days old at release compilation. Rank, engagement, review and bestseller observations remain contextual. They cannot be represented as proof that a cover treatment caused sales or ranking.

## Selection and authorship gate

At least three independent candidates must have been reviewed. Selection requires complete pairwise originality review, a named selector, a named human finisher and retained finishing evidence.

The approved cover artwork must remain text-free. Generated or baked-in title, subtitle, author, series, spine copy, blurb, price, publisher mark, ISBN and barcode content is prohibited. EVAVO Docs Suite remains the sole authority for editable typography and final edition geometry.

A provider output is not final merely because it is polished. Hands, faces, architecture, period objects, materials, edge logic, occlusion and controlled irregularity must have been reviewed and finished as specific authored work. The release retains the final artwork digest and the finishing-evidence digest separately.

## Rights and disclosure gate

The source manifest, licences, provenance, final artwork rights and human-craft evidence must be complete. AI-assisted or AI-generated source work requires provider and model records. AI-generated final cover content must be marked for disclosure during KDP upload. The authority records the decision but does not perform the upload.

## Proof gate

Every proof named by the exact design-intelligence direction must be supplied and pass. Proofs may include:

- 60, 96, 100 or 120 pixel thumbnails;
- grayscale and mobile grayscale;
- blur or squint tests;
- three-second recognition;
- retailer search and Kindle library tiles;
- light and dark retailer contexts;
- series and spine shelf views;
- full-size front cover;
- full wrap;
- audiobook square; and
- physical print proof.

A missing or failed proof blocks Docs Suite composition. It is not converted into a warning and cannot be bypassed by an automatic fallback.

## Human approval

The final reviewer must explicitly confirm that:

- category fit is achieved without imitation;
- the artwork is specific to the manuscript;
- the selected artwork is text-free;
- named human finishing is complete; and
- every retained design warning has been acknowledged.

Only the `ready_for_docs_composition` state permits the next repository to create a composition binding. Even then, automatic selection, automatic promotion and publication remain false.

## Repository ownership

Art Studio owns artwork evidence, candidate review, human finishing, visual proofs, rights and the commercial release authority.

Docs Suite owns exact metadata, editable typography, type licences, font embedding, trim, bleed, spine width, page-count binding, back-cover layout, barcode reservation, reading order, output PDF construction and publication-package preflight.

The boundary prevents either repository from silently doing the other repository’s job. The Art Studio authority authorizes composition only; Docs Suite must still compile its own deterministic edition binding and publication checks.
