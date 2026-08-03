# Book Studio legacy Art plan translation migration

Status: protected Docs Suite adapter implemented; provider execution and production cutover not approved  
Reviewed: 3 August 2026

## Ownership

Docs Suite owns the exact Book Art brief, manuscript and visual-canon identity, cover composition, editable typography, illustration placement, ISBN, barcode, edition geometry and publication packaging.

Art Studio owns cover and illustration candidate generation, provider execution, immutable source and candidate artifacts, raster mastering, technical QA, comparison, selection and promotion.

Website retains the original cover and illustration generation plans only as migration evidence. Website no longer owns Book Art provider execution, source-byte intake, mastering, candidate selection or promotion.

## Versioned translation flow

```text
exact Docs Suite Book Art brief
  + retained Website cover or illustration generation plan
  + exact candidate ID
  -> evavo_docs_book_art_plan_translation_v1
  -> one protected Art Studio translation call
  -> Art Studio provider-neutral work order
  -> independent Docs Suite work-order recompilation
  -> exact identity, source-evidence and legacy-evidence comparison
  -> ready_for_shadow_comparison or blocked
```

The adapter supports:

```text
evavo_legacy_website_book_art_plan_translation_input
evavo_legacy_website_book_illustration_plan_translation_input
```

Art Studio paths are fixed by the request kind:

```text
POST /v1/book-art/legacy-plans/translate
POST /v1/book-art/legacy-illustration-plans/translate
```

Callers cannot provide an arbitrary remote path, provider adapter, model, provider credential or publication destination.

## Independent response validation

Docs Suite does not trust a returned work-order fingerprint by itself. It independently compiles the complete expected work order from the exact sealed Book Art brief and compares:

- workspace, project, book, edition and request identity;
- manuscript revision and all manuscript, extracted-text, visual-canon and Art Direction hashes;
- purpose and asset class;
- delivery dimensions, MIME types, PPI, colour, alpha and text policy;
- provider-neutral request identity, canvas, background, quality and no-fallback candidate count;
- creative intent, exclusions, style, shot and separate publication assets;
- rights and approved evidence;
- authority boundary and complete work-order fingerprint;
- retained Website plan, task, prompt-digest, style and page evidence.

Any substituted identity, evidence, dimensions, Art Direction, candidate, work order or authority flag blocks the result.

## Protected Docs Suite surfaces

REST:

```text
GET  /api/v1/book-studio/art-plan-translation
POST /api/v1/book-studio/art-plan-translation
```

CLI:

```text
node apps/web/scripts/evavo-docs-book-cli.mjs art-plan-capabilities
node apps/web/scripts/evavo-docs-book-cli.mjs art-plan-translate --input request.json
node apps/web/scripts/evavo-docs-book-cli.mjs art-plan-translate --input request.json --output result.json
```

MCP:

```text
translate_legacy_book_art_plan
```

The REST route requires a workspace session or short-lived automation grant with `documents:read`.

## Server-only configuration

```text
EVAVO_ART_STUDIO_BOOK_ART_URL=https://<private-art-studio-origin>
EVAVO_ART_STUDIO_BOOK_ART_TOKEN=<private bearer token>
EVAVO_ART_STUDIO_BOOK_ART_TIMEOUT_MS=120000
EVAVO_ART_STUDIO_BOOK_ART_MAX_RESPONSE_BYTES=4000000
```

The configured URL must be an HTTPS origin. Loopback HTTP is accepted only for local development. Docs Suite appends one fixed translation path. Tokens reject whitespace and control characters and never enter contracts, evidence, CLI output or MCP output.

## No ambiguous retry

Docs Suite makes one request. Timeout, network failure, unreadable response, oversized response or uncertain remote execution is returned as a blocked no-retry result. Because the remote operation is read-only, an operator may later submit a separately reviewed request, but this coordinator never retries automatically.

## Authority flags

```text
artStudioCallMaximum: 1
ambiguousRetryAllowed: false
providerCallPerformed: false
runtimeJobSubmitted: false
artifactBytesWritten: false
authoritativeBookWritesPerformed: false
selectionPerformed: false
promotionPerformed: false
bookUseBindingCreated: false
runtimeCutoverApproved: false
publicationPerformed: false
```

A successful translation is only `ready_for_shadow_comparison`. Provider execution, visual review, selection, immutable promotion, Docs Suite Book-use binding, production runtime cutover and publication remain separate gates.

## Website migration effect

This adapter completes the destination transport for the four reviewed Website cover and illustration plan paths:

```text
tools/evavo-doc-studio/scripts/run-book-cover-artwork-generation.ts
tools/evavo-doc-studio/src/app/api/book-cover-studio/artwork-generation/route.ts
tools/evavo-doc-studio/scripts/run-book-illustration-studio.ts
tools/evavo-doc-studio/src/app/api/book-illustration-studio/generation/route.ts
```

It does not by itself approve replay of old source, canonical manuscript cutover, deletion of unrelated Book Studio source or publication.
