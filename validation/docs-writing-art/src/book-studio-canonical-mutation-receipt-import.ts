import type {
  WebsiteCanonicalMutationReceiptImportInputV1,
  WebsiteCanonicalMutationReceiptImportResultV1,
} from './book-studio-canonical-mutation-types';
import { canonicalJson, record, rejectUnknown, sha256Text, text, timestamp, unique } from './book-studio-canonical-mutation-shared';
import { validateBookCanonicalMutationPlan } from './book-studio-canonical-mutation-plan-validate';
import { parseWebsiteCanonicalMutationReceipt } from './book-studio-canonical-mutation-receipt-parse';

const IMPORT_KEYS = new Set(['outputKind','schemaVersion','plan','receipt','importedAt','importedBy']);

export async function importWebsiteCanonicalMutationReceipt(input: unknown): Promise<WebsiteCanonicalMutationReceiptImportResultV1> {
  const blockers: string[] = [];
  const requiredActions: string[] = [];
  const source = record(input, 'Website canonical mutation receipt import', blockers);
  rejectUnknown(source, IMPORT_KEYS, 'Website canonical mutation receipt import', blockers);
  if (source.outputKind !== 'evavo_docs_website_canonical_mutation_receipt_import_input' || source.schemaVersion !== 1) blockers.push('Website canonical mutation receipt import identity is invalid.');
  const planBlockers = await validateBookCanonicalMutationPlan(source.plan);
  blockers.push(...planBlockers);
  const plan = source.plan as WebsiteCanonicalMutationReceiptImportInputV1['plan'];
  const receipt = await parseWebsiteCanonicalMutationReceipt(source.receipt, blockers);
  const importedAt = timestamp(source.importedAt, 'importedAt', blockers);
  const importedBy = text(source.importedBy, 'importedBy', blockers, 300);

  if (receipt.mutationId !== plan?.mutationId || receipt.idempotencyKey !== plan?.idempotencyKey || receipt.planFingerprint !== plan?.planFingerprint) blockers.push('Website receipt does not belong to the exact canonical mutation plan.');
  if (receipt.expectedStateRevision !== plan?.expectedWebsiteStateRevision || receipt.expectedStateFingerprint !== plan?.expectedWebsiteStateFingerprint) blockers.push('Website receipt compare-and-swap expectation differs from the plan.');
  if (receipt.observedStateRevisionBefore !== plan?.expectedWebsiteStateRevision || receipt.observedStateFingerprintBefore !== plan?.expectedWebsiteStateFingerprint) blockers.push('Website receipt did not observe the exact expected state before mutation.');
  if (receipt.observedStateRevisionAfter !== receipt.observedStateRevisionBefore + 1) blockers.push('Website receipt must advance canonical state revision exactly once.');
  if (receipt.manuscriptRevisionIdBefore !== plan?.currentSnapshot?.manuscriptRevisionId || receipt.manuscriptSha256Before !== plan?.currentSnapshot?.manuscriptSha256) blockers.push('Website receipt before-manuscript identity differs from the current snapshot.');
  if (receipt.manuscriptRevisionIdAfter !== plan?.proposedSnapshot?.manuscriptRevisionId || receipt.manuscriptSha256After !== plan?.proposedSnapshot?.manuscriptSha256) blockers.push('Website receipt after-manuscript identity differs from the proposed snapshot.');
  if (receipt.observedStateFingerprintAfter !== plan?.proposedSnapshot?.stateFingerprint) blockers.push('Website receipt resulting state fingerprint differs from the exact proposed snapshot.');
  if (receipt.rollbackSnapshotObjectId !== plan?.rollbackSnapshotObjectId || receipt.rollbackSnapshotSha256 !== plan?.rollbackSnapshotSha256) blockers.push('Website receipt rollback identity differs from the plan.');
  if (!receipt.compareAndSwapSucceeded) blockers.push('Website receipt does not prove a successful compare-and-swap transaction.');
  if (Date.parse(receipt.persistedAt) > Date.parse(importedAt)) blockers.push('Website receipt persistedAt cannot be later than the import timestamp.');
  if (receipt.idempotentReplay) requiredActions.push('Retain the original successful transaction receipt identity as the authoritative event; this import is an exact replay observation.');

  const cleanBlockers = unique(blockers);
  const cleanActions = unique(requiredActions);
  const status: WebsiteCanonicalMutationReceiptImportResultV1['status'] = cleanBlockers.length ? 'blocked' : 'ready_for_shadow_observation';
  const withoutFingerprint = {
    outputKind: 'evavo_docs_website_canonical_mutation_receipt_import_result' as const,
    schemaVersion: 1 as const,
    status,
    blockers: cleanBlockers,
    requiredActions: cleanActions,
    mutationId: receipt.mutationId,
    planFingerprint: receipt.planFingerprint,
    receiptFingerprint: receipt.receiptFingerprint,
    transactionId: receipt.transactionId,
    sourceCommit: receipt.sourceCommit,
    sourcePath: receipt.sourcePath,
    sourceBlobSha1: receipt.sourceBlobSha1,
    importedAt,
    importedBy,
    idempotentReplay: receipt.idempotentReplay,
    ...(cleanBlockers.length ? {} : { resultingSnapshotFingerprint: plan.proposedSnapshot.stateFingerprint }),
    statePersisted: false as const,
    authoritativeWritesPerformed: false as const,
    websiteCompatibilityRuntimeStillAuthoritative: true as const,
    docsSuiteCanonicalWriterEnabled: false as const,
    dualAuthoritativeWritesAllowed: false as const,
    runtimeCutoverApproved: false as const,
    sourceDeletionApproved: false as const,
    publicationPerformed: false as const,
  };
  return {
    ...withoutFingerprint,
    importFingerprint: await sha256Text(canonicalJson(withoutFingerprint)),
  };
}
