# Book cover commercial release V2

The authoritative production contract is:

`evavo_art_book_cover_commercial_release_v2`

V1 remains readable so previously compiled evidence is not made ambiguous. New production must use V2 because V2 removes a circular proof dependency that existed in the first contract.

## Two-stage proof boundary

Art Studio cannot truthfully require a spine, final wrap, retail title tile or physical print proof before Docs Suite has composed exact typography and edition geometry. V2 therefore separates proofs into two stages.

### Art-stage proofs

These inspect the selected, human-finished, text-free artwork before composition. Depending on the exact direction they may include:

- grayscale;
- blur or squint behaviour;
- retailer light and dark background behaviour; and
- full-size artwork review.

Every Art-stage proof named by the design-intelligence direction must be supplied, reviewed by a named person and pass before the authority can reach `ready_for_docs_composition`.

### Deferred Docs Suite proofs

The following proof families are retained in the exact direction but deliberately deferred until Docs Suite has built the cover:

- 60, 96, 100 and 120 pixel thumbnails;
- retailer search and Kindle library tiles;
- mobile grayscale and three-second glance;
- series shelf and spine shelf;
- full wrap;
- audiobook square; and
- physical print.

Submitting one of these as completed evidence before composition blocks the authority. This prevents placeholder typography or invented wrap geometry from being represented as final proof.

## Local validation is authoritative

The entire V2 gate works on GitHub and Vercel free tiers.

- GitHub Actions are not required.
- Paid CI is not required.
- Vercel is not used as a background worker.
- No paid crawler is required.
- No paid image API is required for validation.
- The validator performs no network request.
- Workflow files are optional wrappers and never authority.

Compile and validate locally:

```powershell
node scripts/run-book-cover-commercial-release-v2-local.mjs --input .\path\to\release-v2-input.json --output .\artifacts\cover-release-v2.json
```

Validate an existing V2 authority:

```powershell
node scripts/run-book-cover-commercial-release-v2-local.mjs --authority .\artifacts\cover-release-v2-authority.json --output .\artifacts\cover-release-v2-validation.json
```

Run the permanent source and regression check:

```powershell
node scripts/check-book-cover-commercial-release-v2.mjs
```

Exit code `0` means the authority is valid and ready for Docs Suite composition. Exit code `2` means the retained record is valid but still requires market evidence, Art-stage proofs or human review. Exit code `1` means the input or authority is invalid.

## What V2 binds

The SHA-256 authority binds:

1. current and diverse genre-and-market evidence;
2. the exact Art Studio design-intelligence direction;
3. the selected route and candidate-set authority;
4. the selected candidate file and final text-free artwork file;
5. named human selection and finishing;
6. rights, source and disclosure evidence;
7. every required Art-stage proof; and
8. the exact list of proofs that Docs Suite must complete after composition.

Any retained change produces a different authority digest. Tampered authority JSON fails deterministic validation.

## Composition boundary

Art Studio authorizes only the next composition stage. It does not build final typography, calculate the final paperback or hardcover wrap, reserve the barcode, produce a publication PDF, submit to KDP or publish anything.

Docs Suite must independently verify the V2 digest, exact metadata, final artwork digest, template and panel geometry, type licences, font files, glyph coverage, editable placements, reserved zones and post-composition proof plan before it can authorize a local render.

Automatic selection, automatic promotion and publication remain false in both repositories.
