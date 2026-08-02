# Book Art Immutable Promotion Receipts

Art Studio is the approval authority for generated, edited, licensed and commissioned Book Art. Docs Suite owns manuscript intent, cover and interior composition, typography, placement and publication use.

The `book-production-promotion-adapter` converts evidence from Art Studio's existing immutable promotion transaction into `evavo_book_art_artifact_receipt` records and complete `evavo_art_studio_book_promotion_batch` outputs.

## Required evidence chain

Each compiled receipt requires all of the following exact records:

1. The `CandidatePromotionResult` returned by the real Art Studio promotion transaction.
2. The selected `master` artifact and a passing descriptor/content verification result.
3. The immutable `candidate-selection-evidence` artifact and passing verification.
4. The immutable `candidate-promotion-authorization` artifact and passing verification.
5. An immutable `book-art-production-evidence` artifact and its exact JSON bytes.
6. Matching source lineage, labels, promotion identity, reference generation, content SHA-256 and byte length.

The production evidence binds the promoted master to the Book Studio workspace, project, book, edition and request, the source art brief, technical quality evidence, dimensions, provenance, rights status, generated-text result and unresolved risks.

## Approval boundary

A receipt is `approved` only when:

- the current Art Studio reference resolves to the verified master artifact;
- master, selection, authorization and production-evidence artifacts all pass exact verification;
- the immutable lineage and promotion labels agree;
- commercial rights are approved;
- generated text is absent;
- unresolved risks are empty;
- selection and promotion receipt hashes are present;
- the compiled receipt passes the versioned Book Art handoff validator.

A caller cannot declare an arbitrary object approved. A provider response, legacy Website shortlist, selection record or technically valid image is insufficient on its own.

## Batch boundary

`compileBookArtPromotionBatch` requires one unique promotion record for every expected migration item. Missing, unexpected or duplicate records fail before any batch is emitted. Results are canonically ordered and fingerprinted.

The batch remains migration and handoff evidence:

```text
authoritativeWritesPerformed: false
artifactBytesRewritten: false
publicationPerformed: false
```

The actual Art Studio promotion transaction remains the only operation that updates the approved artifact reference. The adapter does not promote candidates, copy or rewrite artwork, bind artwork into a book, or publish a book.

## Downstream use

Docs Suite accepts this batch through its promotion-to-use join. That join separately verifies the Website source manifest, Art import batch, promotion batch, exact Book Design use intent, approved artifact, selection evidence and promotion evidence. It emits no partial binding batch.

Website remains the active compatibility writer until dual-run parity, state migration, rollback and named cutover approval are complete.
