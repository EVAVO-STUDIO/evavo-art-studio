# Website Book Studio state migration export

Status: protected read-only export gateway  
Website remains the authoritative writer. Docs Suite validation may return `ready_for_cutover_review`, but this command does not import, persist, cut over, delete or publish state.

## Purpose

The reviewed source ownership has moved to Docs Suite, Writing Studio and Art Studio. Live Website Book state still needs exact, evidence-bound validation before any wider Book product cutover.

This gateway converts one operator-reviewed set of Website state JSON files into the exact Docs Suite contract:

```text
evavo_docs_book_state_migration_bundle_v1
```

It reads the source files without modifying them, computes their exact byte SHA-256 and Git blob SHA-1 identities, performs current Docs Suite validation for each non-art state item, assembles the complete state bundle, then submits that bundle once for an independent second validation.

## Required coverage

Every bundle requires exactly one project item and, for every volume:

```text
manuscript
execution
story
authoring
review_craft
canonical_mutation
publication
```

Volumes listed in `artworkRequiredVolumeIds` also require one `artwork_use` source containing an approved Art Studio artifact receipt and exact Docs Suite Book Artwork Use binding. Together they form the approved Book Artwork Use evidence required for migration review.

Missing, duplicate, unknown or mismatched state is rejected before bundle submission.

## Source manifest

The operator manifest is JSON:

```json
{
  "outputKind": "evavo_website_book_state_migration_export_manifest",
  "schemaVersion": 1,
  "authorityMode": "shadow_migration",
  "bundleId": "book-project-1-export-20260804",
  "sourceRepository": "EVAVO-STUDIO/Website",
  "sourceCommit": "0123456789abcdef0123456789abcdef01234567",
  "projectId": "book-project-1",
  "programmeId": "programme-1",
  "volumeIds": ["volume-1"],
  "artworkRequiredVolumeIds": ["volume-1"],
  "records": [
    {
      "migrationItemId": "state-project",
      "stateKind": "project",
      "scope": "project",
      "scopeId": "book-project-1",
      "sourceFile": "state/project.json",
      "evidenceIds": ["evidence-project-source"]
    }
  ],
  "compiledAt": "2026-08-04T01:00:00.000Z",
  "compiledBy": "Named migration operator",
  "evidenceIds": ["evidence-export-review"],
  "authoritativeWritesAllowed": false,
  "canonicalManuscriptMutationAllowed": false,
  "runtimeCutoverApproved": false,
  "sourceDeletionApproved": false,
  "publicationPerformed": false
}
```

Every `sourceFile` must be a regular, non-symlink JSON file below the manifest directory. Absolute paths, traversal, backslashes, empty files, oversized files and non-JSON content fail closed.

For non-art records, the complete JSON file is the exact Docs Suite operation payload. For `artwork_use`, the file contains:

```json
{
  "binding": { "outputKind": "evavo_book_artwork_use_binding" },
  "artifact": { "outputKind": "evavo_book_art_artifact_receipt" }
}
```

## Operator command

```powershell
$env:EVAVO_DOCS_SUITE_BOOK_MIGRATION_URL = "https://docs.example.com"
$env:EVAVO_DOCS_SUITE_BOOK_MIGRATION_TOKEN = "short-lived-documents-write-token"
$env:EVAVO_DOCS_SUITE_BOOK_MIGRATION_TIMEOUT_MS = "280000"

npx tsx scripts/run-book-studio-state-migration-export.ts capabilities

npx tsx scripts/run-book-studio-state-migration-export.ts export `
  --input migration/manifest.json `
  --output migration/receipt.json `
  --bundle-output migration/bundle.json
```

Outputs are created with no-clobber semantics. Existing receipt or bundle files are never overwritten.

## Transport behavior

For each non-art item the gateway performs one request to:

```text
POST /api/v1/book-studio/operations
```

It verifies the exact operation request fingerprint, result fingerprint, operation identity and all no-authority flags.

It then performs one request to:

```text
POST /api/v1/book-studio/migration/state-bundle
```

It verifies the exact bundle identity, bundle fingerprint and no-write result. Redirects are rejected. Requests and responses are bounded. A timeout or network failure is ambiguous and receives no automatic retry.

## Authority boundary

```text
providerCalled: false
authoritativeWritesPerformed: false
canonicalManuscriptMutationPerformed: false
docsSuiteCanonicalWriterEnabled: false
runtimeCutoverApproved: false
sourceDeletionApproved: false
publicationPerformed: false
```

`ready_for_cutover_review` means only that the exact bundle passed current read-only validation. It does not change the canonical writer or approve deletion or publication.
