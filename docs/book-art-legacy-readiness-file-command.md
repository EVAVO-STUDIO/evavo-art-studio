# Legacy Book Art readiness file command

Status: local, compile-only migration evidence  
Manifest contract: `evavo_book_art_legacy_dry_run_readiness_batch_file_v1`  
Batch contract: `evavo_book_art_legacy_dry_run_readiness_batch_v1`

The dedicated `evavo-book-art-legacy-readiness-batch` command reads an explicit private manifest and exact local legacy Website Book Art files, calls the fail-closed batch readiness compiler, and creates one exclusive local JSON receipt.

It does not discover files, read outside the supplied source root, register bytes in Art Studio, write source or evidence artifacts, use a runtime repository, call a provider, select or promote artwork, create a Book Artwork Use binding, change the canonical writer, approve cutover, upload to a retailer, or publish.

## Build and run

```powershell
corepack pnpm --filter @evavo/art-studio-cli build

corepack pnpm --filter @evavo/art-studio-cli start:legacy-readiness -- `
  --input C:\Private\BookMigration\legacy-art-readiness.json `
  --source-root C:\Private\BookMigration\legacy-art `
  --receipt C:\Private\BookMigration\legacy-art-readiness-receipt.json
```

The same built binary is exposed as:

```text
evavo-book-art-legacy-readiness-batch
```

The receipt path must not already exist. The command reserves it before reading the manifest or any source file. A blocked domain result is still written as evidence and exits with code `2`. An operational or filesystem rejection removes the reserved file and exits with code `1`.

## Manifest

Source files use normalized forward-slash paths relative to `--source-root`:

```json
{
  "outputKind": "evavo_legacy_book_art_dry_run_readiness_batch_file_input",
  "schemaVersion": 1,
  "contract": "evavo_book_art_legacy_dry_run_readiness_batch_file_v1",
  "batchId": "legacy-cover-readiness-2026-08-07",
  "sourceRepository": "EVAVO-STUDIO/Website",
  "sourceCommitSha": "0123456789abcdef0123456789abcdef01234567",
  "compiledAt": "2026-08-07T06:00:00.000Z",
  "compiledBy": "named-migration-operator",
  "items": [
    {
      "itemId": "book-1-paperback-front-cover",
      "registrationInput": {
        "outputKind": "evavo_legacy_book_art_byte_registration_input",
        "schemaVersion": 1
      },
      "sourceFile": "book-1/paperback/front-cover.png"
    }
  ],
  "sourceArtifactWritesAllowed": false,
  "evidenceArtifactWritesAllowed": false,
  "providerCallsAllowed": false,
  "selectionAllowed": false,
  "promotionAllowed": false,
  "bookUseBindingAllowed": false,
  "canonicalWriterChangeAllowed": false,
  "runtimeCutoverApprovalAllowed": false,
  "publicationAllowed": false
}
```

Each `registrationInput` must be the complete single-item legacy byte-registration input, not the abbreviated example above.

## Filesystem boundary

The command:

- rejects symbolic-link source roots, source parents, source files, manifest files, and receipt parents;
- rejects absolute paths, backslashes, parent traversal, non-normalized paths, duplicates, accessors, sparse input, unsupported fields, and oversized data;
- opens source files with no-follow semantics where the platform provides them;
- verifies file identity, size, modification time, and canonical path before and after reading;
- copies exact bytes into bounded private memory;
- creates the receipt with `O_CREAT | O_EXCL | O_WRONLY`, private permissions, `fsync`, and exact readback verification;
- removes the reserved receipt after any operational failure;
- emits no raw image bytes in stdout or the receipt.

## Receipt

The file receipt binds:

- exact manifest byte length and SHA-256;
- every relative source path, byte length, and SHA-256;
- the source-file-set fingerprint;
- every single-item readiness receipt;
- the deterministic receipt-set and batch fingerprints;
- the complete zero-authority boundary.

A `ready` receipt only proves that the explicitly supplied source set can compile into legacy Art Studio registration plans. It does not prove that all live Website artwork was discovered, and it does not register any source file.

Registration, technical QA, independent selection, Art Studio promotion, Docs Suite Book Artwork Use binding, authenticated parity, canonical-writer cutover, Website deletion, retailer upload, and publication remain separate governed stages.
