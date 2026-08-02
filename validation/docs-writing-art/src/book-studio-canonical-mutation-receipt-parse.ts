import type { WebsiteCanonicalMutationReceiptV1 } from './book-studio-canonical-mutation-types';
import { canonicalJson, digest, gitSha, id, integer, objectId, record, rejectUnknown, sha256Text, text, timestamp } from './book-studio-canonical-mutation-shared';

const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@/-]{1,512}$/;
const RECEIPT_KEYS = new Set([
  'outputKind','schemaVersion','mutationId','idempotencyKey','planFingerprint','transactionId','sourceRepository',
  'sourceCommit','sourcePath','sourceBlobSha1','expectedStateRevision','observedStateRevisionBefore',
  'observedStateRevisionAfter','expectedStateFingerprint','observedStateFingerprintBefore',
  'observedStateFingerprintAfter','manuscriptRevisionIdBefore','manuscriptRevisionIdAfter',
  'manuscriptSha256Before','manuscriptSha256After','compareAndSwapSucceeded','idempotentReplay','persistedAt',
  'persistedBy','rollbackSnapshotObjectId','rollbackSnapshotSha256','receiptFingerprint',
  'canonicalManuscriptMutationPerformed','publicationPerformed',
]);

export async function parseWebsiteCanonicalMutationReceipt(value: unknown, blockers: string[]): Promise<WebsiteCanonicalMutationReceiptV1> {
  const source = record(value, 'Website canonical mutation receipt', blockers);
  rejectUnknown(source, RECEIPT_KEYS, 'Website canonical mutation receipt', blockers);
  if (source.outputKind !== 'evavo_website_book_canonical_mutation_receipt') blockers.push('Website receipt outputKind is invalid.');
  if (source.schemaVersion !== 1) blockers.push('Website receipt schemaVersion is invalid.');
  if (source.sourceRepository !== 'EVAVO-STUDIO/Website') blockers.push('Website receipt source repository is invalid.');
  if (source.compareAndSwapSucceeded !== true && source.compareAndSwapSucceeded !== false) blockers.push('Website receipt compareAndSwapSucceeded must be boolean.');
  if (source.idempotentReplay !== true && source.idempotentReplay !== false) blockers.push('Website receipt idempotentReplay must be boolean.');
  if (source.canonicalManuscriptMutationPerformed !== true) blockers.push('Website receipt must prove canonical manuscript mutation was performed.');
  if (source.publicationPerformed !== false) blockers.push('Website receipt cannot claim publication.');
  const sourcePath = typeof source.sourcePath === 'string' && SAFE_PATH.test(source.sourcePath) ? source.sourcePath : '';
  if (!sourcePath) blockers.push('Website receipt source path is invalid.');
  const unsigned = {
    outputKind: 'evavo_website_book_canonical_mutation_receipt' as const,
    schemaVersion: 1 as const,
    mutationId: id(source.mutationId, 'receipt.mutationId', blockers),
    idempotencyKey: id(source.idempotencyKey, 'receipt.idempotencyKey', blockers),
    planFingerprint: digest(source.planFingerprint, 'receipt.planFingerprint', blockers),
    transactionId: id(source.transactionId, 'receipt.transactionId', blockers),
    sourceRepository: 'EVAVO-STUDIO/Website' as const,
    sourceCommit: gitSha(source.sourceCommit, 'receipt.sourceCommit', blockers),
    sourcePath,
    sourceBlobSha1: gitSha(source.sourceBlobSha1, 'receipt.sourceBlobSha1', blockers),
    expectedStateRevision: integer(source.expectedStateRevision, 'receipt.expectedStateRevision', blockers, 0, Number.MAX_SAFE_INTEGER),
    observedStateRevisionBefore: integer(source.observedStateRevisionBefore, 'receipt.observedStateRevisionBefore', blockers, 0, Number.MAX_SAFE_INTEGER),
    observedStateRevisionAfter: integer(source.observedStateRevisionAfter, 'receipt.observedStateRevisionAfter', blockers, 1, Number.MAX_SAFE_INTEGER),
    expectedStateFingerprint: digest(source.expectedStateFingerprint, 'receipt.expectedStateFingerprint', blockers),
    observedStateFingerprintBefore: digest(source.observedStateFingerprintBefore, 'receipt.observedStateFingerprintBefore', blockers),
    observedStateFingerprintAfter: digest(source.observedStateFingerprintAfter, 'receipt.observedStateFingerprintAfter', blockers),
    manuscriptRevisionIdBefore: id(source.manuscriptRevisionIdBefore, 'receipt.manuscriptRevisionIdBefore', blockers),
    manuscriptRevisionIdAfter: id(source.manuscriptRevisionIdAfter, 'receipt.manuscriptRevisionIdAfter', blockers),
    manuscriptSha256Before: digest(source.manuscriptSha256Before, 'receipt.manuscriptSha256Before', blockers),
    manuscriptSha256After: digest(source.manuscriptSha256After, 'receipt.manuscriptSha256After', blockers),
    compareAndSwapSucceeded: source.compareAndSwapSucceeded === true,
    idempotentReplay: source.idempotentReplay === true,
    persistedAt: timestamp(source.persistedAt, 'receipt.persistedAt', blockers),
    persistedBy: text(source.persistedBy, 'receipt.persistedBy', blockers, 300),
    rollbackSnapshotObjectId: objectId(source.rollbackSnapshotObjectId, 'receipt.rollbackSnapshotObjectId', blockers),
    rollbackSnapshotSha256: digest(source.rollbackSnapshotSha256, 'receipt.rollbackSnapshotSha256', blockers),
    canonicalManuscriptMutationPerformed: true as const,
    publicationPerformed: false as const,
  };
  const receiptFingerprint = digest(source.receiptFingerprint, 'receipt.receiptFingerprint', blockers);
  if (receiptFingerprint !== await sha256Text(canonicalJson(unsigned))) blockers.push('Website receipt fingerprint does not match its exact canonical contents.');
  return { ...unsigned, receiptFingerprint };
}

export async function fingerprintWebsiteCanonicalMutationReceipt(
  receipt: Omit<WebsiteCanonicalMutationReceiptV1, 'receiptFingerprint'> | WebsiteCanonicalMutationReceiptV1,
): Promise<string> {
  const { receiptFingerprint: _discarded, ...unsigned } = receipt as WebsiteCanonicalMutationReceiptV1;
  return sha256Text(canonicalJson(unsigned));
}
