# Book Studio craft-genome compatibility

Status: Website proxy only  
Authoritative compatibility owner: Docs Suite  
Reviewed: 5 August 2026

## Ownership

The legacy Website craft-genome compiler, provider-packet builder, strict provider-response validator and phrase-overlap scanner have moved to **Docs Suite compatibility authority**.

Website retains only the public compatibility surface:

```text
GET  /api/books/write/craft-genome
POST /api/books/write/craft-genome
```

The four retained CLI commands remain unchanged:

```text
book craft-genome
book craft-packet
book craft-response-validate
book craft-overlap
```

Every POST performs exactly one authenticated server-side request to the fixed Docs Suite path:

```text
/api/v1/book-studio/legacy-craft-genome
```

No local fallback exists. Ambiguous network failures, redirects, timeouts, invalid JSON, oversized responses, unknown fields, fingerprint mismatches and authority escalation all fail closed.

## Versioned contract

```text
evavo_docs_book_legacy_craft_genome_v1
```

Supported operations:

```text
compile_profile
create_provider_packet
validate_provider_response
scan_phrase_overlap
```

Website validates the retained public operation shape, binds the exact Website Git commit, constructs the compatibility envelope, and verifies the Docs Suite request and result fingerprints before returning the nested legacy result to callers.

The public response remains the old operation result. The migration receipt is checked server-side and is not substituted for the legacy payload.

## Configuration

Preferred environment variables:

```text
EVAVO_DOCS_SUITE_BOOK_CRAFT_URL
EVAVO_DOCS_SUITE_BOOK_CRAFT_TOKEN
EVAVO_WEBSITE_COMMIT_SHA
EVAVO_DOCS_SUITE_BOOK_CRAFT_TIMEOUT_MS
```

URL fallback order:

```text
EVAVO_DOCS_SUITE_BOOK_CRAFT_URL
EVAVO_DOCS_SUITE_BOOK_WRITER_URL
EVAVO_DOCS_URL
https://docs.evavo.com.au
```

Token fallback order:

```text
EVAVO_DOCS_SUITE_BOOK_CRAFT_TOKEN
EVAVO_DOCS_SUITE_BOOK_WRITER_TOKEN
EVAVO_DOCS_TOKEN
```

Commit fallback order:

```text
EVAVO_WEBSITE_COMMIT_SHA
VERCEL_GIT_COMMIT_SHA
GITHUB_SHA
```

The token is server-only and must never be exposed to browser code or returned in an error. HTTPS is mandatory outside localhost. Credentials, query strings and fragments are rejected in the configured base URL.

## Transport guarantees

The proxy:

- uses the fixed Docs Suite endpoint and rejects origin escape;
- sends one POST and never retries automatically;
- sets `redirect: "error"`;
- uses a bounded abort timeout;
- permits at most 8 MiB for the compatibility request and response;
- carries the exact source commit, request ID, timestamp and operation;
- marks provider calls, authoritative writes, canonical mutation, automatic admission, runtime cutover and publication as false;
- requires Docs Suite to attest that Website local execution did not occur;
- recomputes both deterministic SHA-256 fingerprints;
- rejects every unknown response field.

The 8 MiB route-local boundary preserves the legacy comparison corpus allowance without changing unrelated Website or Docs Suite APIs.

## Provider boundary

The Website route does not call a model. It does not build ChatGPT, Claude or compatible-model packets locally and cannot validate a provider response locally.

Docs Suite compatibility execution preserves the old provider-native modes:

```text
ChatGPT                 strict JSON Schema
Claude                  forced single tool
compatible model        adapter JSON Schema
```

A schema-valid provider response is still only eligible for phrase-overlap, continuity, anti-genericity, independent review and canonical commit gates. It is never admitted automatically.

## Authority boundary

This compatibility path does not:

- call a provider from Website;
- mutate a canonical manuscript;
- admit a candidate to canon;
- enable dual authoritative writers;
- promote artwork;
- submit to Amazon KDP;
- publish a book.

The permanent local-runtime checker fails if any of the nine retired Website craft files reappears or if the proxy loses its no-retry, no-fallback, fixed-endpoint, fingerprint or authority constraints.

## Verification

From `tools/evavo-doc-studio`:

```text
npx tsx scripts/check-book-studio-craft-genome.ts
npx tsx scripts/check-book-studio-craft-provider-contract.ts
npx tsc --noEmit --project tsconfig.book-studio-craft-genome.json
npm run build
```

The dedicated workflow also builds the complete root Website production application and proves that validation leaves tracked source clean.
