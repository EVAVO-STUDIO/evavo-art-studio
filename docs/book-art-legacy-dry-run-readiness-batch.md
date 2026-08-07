# Legacy Book Art dry-run readiness batch

Status: compile-only migration evidence  
Contract: `evavo_book_art_legacy_dry_run_readiness_batch_v1`

This boundary compiles a deterministic set of Art Studio readiness receipts for exact legacy Website Book Cover bytes. It is the batch companion to `evavo_book_art_legacy_dry_run_readiness_v1`.

It does not discover Website files, read a filesystem, download artifacts, write source or evidence artifacts, call a provider, select or promote artwork, create a Book Artwork Use binding, change the canonical writer, approve runtime cutover, delete Website source, upload to a retailer or publish.

## Input

One batch identifies a single exact Website source commit and contains explicit items:

```ts
{
  outputKind: "evavo_legacy_book_art_dry_run_readiness_batch_input",
  schemaVersion: 1,
  contract: "evavo_book_art_legacy_dry_run_readiness_batch_v1",
  batchId: "legacy-cover-readiness-2026-08-07",
  sourceRepository: "EVAVO-STUDIO/Website",
  sourceCommitSha: "0123456789abcdef0123456789abcdef01234567",
  compiledAt: "2026-08-07T05:00:00.000Z",
  compiledBy: "named-migration-operator",
  items: [
    {
      itemId: "book-1-paperback-front-cover",
      registrationInput: {},
      sourceBytes: new Uint8Array(),
    },
  ],
  sourceArtifactWritesAllowed: false,
  evidenceArtifactWritesAllowed: false,
  providerCallsAllowed: false,
  selectionAllowed: false,
  promotionAllowed: false,
  bookUseBindingAllowed: false,
  canonicalWriterChangeAllowed: false,
  runtimeCutoverApprovalAllowed: false,
  publicationAllowed: false,
}
```

Every item must carry the complete input already accepted by the single-item legacy byte-registration compiler and the exact source bytes for that record. The item source repository and commit must match the batch.

## Deterministic evidence

Before the first asynchronous boundary the compiler:

- snapshots every caller-owned JSON object through data-property descriptors;
- rejects accessors, symbols, unsafe keys, cycles, shared aliases, sparse arrays and non-plain objects;
- copies every source byte into private bounded memory;
- records the submitted byte length and SHA-256;
- fingerprints the exact registration input;
- orders items by stable identity rather than caller order.

It then compiles one existing single-item readiness receipt per item and emits:

- one item fingerprint per receipt;
- one receipt-set fingerprint;
- one batch fingerprint;
- ready and blocked item totals;
- all item blockers and warnings with item identity;
- no raw source bytes.

The batch is `ready` only when every item is individually ready, all item and registration identities are unique, all items use the exact batch source commit, no registration plan is replayed and every authority flag remains false.

## Failure behaviour

A malformed or hostile object produces a deterministic blocked result. Private exception text is not returned. One invalid source file blocks the complete batch while preserving the other compiled item receipts for diagnosis.

## Migration authority

A ready batch proves only that an explicit set of exact bytes can be compiled into legacy Art Studio registration plans. It does not prove that all live Website artwork has been discovered or exported, and it does not register those bytes.

After private source bytes are resolved, the migration operator may retain the batch result as evidence and separately decide whether to execute the governed byte-registration stage. Technical QA, independent selection, Art Studio promotion and Docs Suite Book Artwork Use binding remain required after registration.
