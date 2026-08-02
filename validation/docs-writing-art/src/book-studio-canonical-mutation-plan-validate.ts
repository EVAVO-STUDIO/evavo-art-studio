import type { BookCanonicalMutationKind, BookCanonicalMutationPlanV1 } from './book-studio-canonical-mutation-types';
import { BOOK_CANONICAL_MUTATION_CONTRACT } from './book-studio-canonical-mutation-types';
import {
  canonicalJson, digest, enumValue, id, ids, integer, objectId, record, rejectUnknown, sameArray,
  sha256Text, text, timestamp, unique,
} from './book-studio-canonical-mutation-shared';
import { parseBookCanonicalChangedUnits } from './book-studio-canonical-mutation-change';
import { deriveBookCanonicalChanges, parseBookCanonicalSnapshot, validateBookCanonicalDeclaredChanges } from './book-studio-canonical-mutation-snapshot';

const PLAN_KEYS = new Set([
  'outputKind','schemaVersion','contract','status','mutationId','idempotencyKey','mutationKind','projectId','programmeId','volumeId',
  'currentSnapshot','proposedSnapshot','changedUnits','authoringAdmissionFingerprint','authoringAdmissionObjectId',
  'reviewCraftAdmissionFingerprint','reviewCraftAdmissionObjectId','executionTaskId','executionTaskFingerprint',
  'executionReceiptId','executionReceiptFingerprint','structuralChangeEvidenceIds','expectedWebsiteStateRevision',
  'expectedWebsiteStateFingerprint','requestedAt','requestedBy','evidenceIds','rollbackSnapshotObjectId',
  'rollbackSnapshotSha256','blockers','warnings','planFingerprint','websiteCompatibilityWriterRequired',
  'docsSuiteCanonicalWriterEnabled','canonicalAdmissionAllowed','canonicalManuscriptMutationPerformed',
  'dualAuthoritativeWritesAllowed','runtimeCutoverApproved','publicationPerformed',
]);
const MUTATION_KINDS = new Set<BookCanonicalMutationKind>(['text_only','structural']);

export async function validateBookCanonicalMutationPlan(plan: unknown): Promise<string[]> {
  const blockers: string[] = [];
  const source = record(plan, 'Canonical mutation plan', blockers);
  rejectUnknown(source, PLAN_KEYS, 'Canonical mutation plan', blockers);
  if (source.outputKind !== 'evavo_docs_book_canonical_mutation_plan' || source.schemaVersion !== 1 || source.contract !== BOOK_CANONICAL_MUTATION_CONTRACT || source.status !== 'ready_for_website_compare_and_swap') blockers.push('Canonical mutation plan identity or status is invalid.');
  if (source.websiteCompatibilityWriterRequired !== true || source.docsSuiteCanonicalWriterEnabled !== false || source.canonicalAdmissionAllowed !== false || source.canonicalManuscriptMutationPerformed !== false || source.dualAuthoritativeWritesAllowed !== false || source.runtimeCutoverApproved !== false || source.publicationPerformed !== false) blockers.push('Canonical mutation plan authority flags are invalid.');
  const mutationKind = enumValue(source.mutationKind, MUTATION_KINDS, 'plan.mutationKind', blockers, 'text_only');
  id(source.mutationId, 'plan.mutationId', blockers);
  id(source.idempotencyKey, 'plan.idempotencyKey', blockers);
  const projectId = id(source.projectId, 'plan.projectId', blockers);
  const programmeId = id(source.programmeId, 'plan.programmeId', blockers);
  const volumeId = id(source.volumeId, 'plan.volumeId', blockers);
  const currentSnapshot = await parseBookCanonicalSnapshot(source.currentSnapshot, 'plan.currentSnapshot', blockers);
  const proposedSnapshot = await parseBookCanonicalSnapshot(source.proposedSnapshot, 'plan.proposedSnapshot', blockers);
  const changedUnits = parseBookCanonicalChangedUnits(source.changedUnits, blockers);
  digest(source.authoringAdmissionFingerprint, 'plan.authoringAdmissionFingerprint', blockers);
  objectId(source.authoringAdmissionObjectId, 'plan.authoringAdmissionObjectId', blockers);
  digest(source.reviewCraftAdmissionFingerprint, 'plan.reviewCraftAdmissionFingerprint', blockers);
  objectId(source.reviewCraftAdmissionObjectId, 'plan.reviewCraftAdmissionObjectId', blockers);
  id(source.executionTaskId, 'plan.executionTaskId', blockers);
  digest(source.executionTaskFingerprint, 'plan.executionTaskFingerprint', blockers);
  id(source.executionReceiptId, 'plan.executionReceiptId', blockers);
  digest(source.executionReceiptFingerprint, 'plan.executionReceiptFingerprint', blockers);
  const structuralChangeEvidenceIds = ids(source.structuralChangeEvidenceIds, 'plan.structuralChangeEvidenceIds', blockers, 100_000, false);
  const expectedWebsiteStateRevision = integer(source.expectedWebsiteStateRevision, 'plan.expectedWebsiteStateRevision', blockers, 0, Number.MAX_SAFE_INTEGER);
  const expectedWebsiteStateFingerprint = digest(source.expectedWebsiteStateFingerprint, 'plan.expectedWebsiteStateFingerprint', blockers);
  timestamp(source.requestedAt, 'plan.requestedAt', blockers);
  text(source.requestedBy, 'plan.requestedBy', blockers, 300);
  ids(source.evidenceIds, 'plan.evidenceIds', blockers, 100_000, true);
  const rollbackSnapshotObjectId = objectId(source.rollbackSnapshotObjectId, 'plan.rollbackSnapshotObjectId', blockers);
  const rollbackSnapshotSha256 = digest(source.rollbackSnapshotSha256, 'plan.rollbackSnapshotSha256', blockers);
  if (!Array.isArray(source.blockers) || source.blockers.length !== 0) blockers.push('Ready canonical mutation plan cannot contain blockers.');
  if (!Array.isArray(source.warnings) || source.warnings.some((value) => typeof value !== 'string')) blockers.push('Canonical mutation plan warnings are invalid.');
  if (currentSnapshot.projectId !== projectId || proposedSnapshot.projectId !== projectId || currentSnapshot.programmeId !== programmeId || proposedSnapshot.programmeId !== programmeId || currentSnapshot.volumeId !== volumeId || proposedSnapshot.volumeId !== volumeId) blockers.push('Canonical mutation plan top-level identity differs from its snapshots.');
  if (proposedSnapshot.revisionNumber !== currentSnapshot.revisionNumber + 1 || proposedSnapshot.parentRevisionId !== currentSnapshot.manuscriptRevisionId) blockers.push('Canonical mutation plan revision chain is invalid.');
  if (proposedSnapshot.manuscriptRevisionId === currentSnapshot.manuscriptRevisionId || proposedSnapshot.manuscriptSha256 === currentSnapshot.manuscriptSha256) blockers.push('Canonical mutation plan does not advance manuscript identity and bytes.');
  if (expectedWebsiteStateRevision !== currentSnapshot.revisionNumber || expectedWebsiteStateFingerprint !== currentSnapshot.stateFingerprint) blockers.push('Canonical mutation plan Website compare-and-swap expectation differs from the current snapshot.');
  if (rollbackSnapshotObjectId !== currentSnapshot.manuscriptObjectId || rollbackSnapshotSha256 !== currentSnapshot.manuscriptSha256) blockers.push('Canonical mutation rollback identity differs from the exact current manuscript snapshot.');
  const derived = deriveBookCanonicalChanges(currentSnapshot.orderedUnits, proposedSnapshot.orderedUnits);
  validateBookCanonicalDeclaredChanges(changedUnits, derived, blockers);
  const currentIds = currentSnapshot.orderedUnits.map((item) => item.unitId);
  const proposedIds = proposedSnapshot.orderedUnits.map((item) => item.unitId);
  if (mutationKind === 'text_only') {
    if (!sameArray(currentIds, proposedIds) || changedUnits.some((item) => item.changeKind !== 'modified')) blockers.push('A text_only canonical mutation plan changed structure.');
    if (currentSnapshot.sourceCoverageFingerprint !== proposedSnapshot.sourceCoverageFingerprint) blockers.push('A text_only canonical mutation plan changed source coverage.');
  } else {
    if (!structuralChangeEvidenceIds.length || currentSnapshot.sourceCoverageFingerprint === proposedSnapshot.sourceCoverageFingerprint) blockers.push('A structural canonical mutation plan lacks structural evidence or refreshed source coverage.');
  }
  const fingerprint = digest(source.planFingerprint, 'plan.planFingerprint', blockers);
  const { planFingerprint: _discarded, ...unsigned } = source;
  if (fingerprint !== await sha256Text(canonicalJson(unsigned))) blockers.push('Canonical mutation plan fingerprint does not match its exact contents.');
  return unique(blockers);
}

export async function fingerprintBookCanonicalMutationPlan(plan: Omit<BookCanonicalMutationPlanV1, 'planFingerprint'> | BookCanonicalMutationPlanV1): Promise<string> {
  const { planFingerprint: _discarded, ...unsigned } = plan as BookCanonicalMutationPlanV1;
  return sha256Text(canonicalJson(unsigned));
}
