import { createHash } from 'node:crypto';

import { COUNCIL_AVATAR_REVIEW_HANDOFF_SCHEMA } from './council-avatar-review-handoff.mjs';

export const COUNCIL_AVATAR_IDENTITY_LOCK_APPROVAL_SCHEMA =
  'evavo.project-art-council-avatar-identity-lock-approval.v1';

const REVIEW_PLAN_SCHEMA = 'evavo.project-art-review-plan.v1';
const REVIEW_DECISIONS_SCHEMA = 'evavo.project-art-review-decisions.v1';
const REVIEW_RECEIPT_SCHEMA = 'evavo.project-art-review-receipt.v1';
const ALLOWED_CHARACTERS = new Set(['council-critic', 'council-open-reviewer']);
const APPROVER_MODES = new Set(['human', 'hybrid']);
const HEX64 = /^[a-f0-9]{64}$/u;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

function verifySelfHash(value, field, label) {
  if (!value || typeof value !== 'object' || !HEX64.test(value[field] ?? '')) {
    throw new Error(`${label} ${field} is invalid`);
  }
  const body = { ...value };
  delete body[field];
  if (sha256(body) !== value[field]) {
    throw new Error(`${label} ${field} mismatch`);
  }
  return value[field];
}

function boundedText(value, label, maximum = 4096) {
  if (typeof value !== 'string') throw new Error(`${label} is required`);
  const text = value.trim();
  if (!text || text.length > maximum || text.includes('\0')) {
    throw new Error(`${label} must contain 1-${maximum} safe characters`);
  }
  return text;
}

function canonicalTimestamp(value, label) {
  const text = boundedText(value, label, 64);
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== text) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
  return Object.freeze({ text, milliseconds });
}

function groupCharacterId(groupId) {
  for (const characterId of ALLOWED_CHARACTERS) {
    if (groupId === `${characterId}-identity-candidates`) return characterId;
  }
  throw new Error(`unexpected Council identity review group: ${groupId}`);
}

function exactDecisionMap(decisions) {
  const result = new Map();
  for (const decision of decisions) {
    if (!decision || typeof decision !== 'object' || typeof decision.itemId !== 'string') {
      throw new Error('review decision is invalid');
    }
    if (result.has(decision.itemId)) {
      throw new Error(`duplicate review decision: ${decision.itemId}`);
    }
    result.set(decision.itemId, decision);
  }
  return result;
}

function materializedByHash(handoff) {
  const result = new Map();
  if (!Array.isArray(handoff.materialized)) {
    throw new Error('Council review handoff materialized candidates are missing');
  }
  for (const candidate of handoff.materialized) {
    if (
      !ALLOWED_CHARACTERS.has(candidate?.characterId) ||
      !HEX64.test(candidate?.contentSha256 ?? '') ||
      !HEX64.test(candidate?.descriptorSha256 ?? '') ||
      typeof candidate?.artifactId !== 'string'
    ) {
      throw new Error('Council review handoff contains an invalid materialized candidate');
    }
    if (result.has(candidate.contentSha256)) {
      throw new Error(`duplicate materialized content hash: ${candidate.contentSha256}`);
    }
    result.set(candidate.contentSha256, candidate);
  }
  return result;
}

function assertFalseAuthority(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} authority is invalid`);
  }
  const entries = Object.entries(value);
  if (!entries.length || entries.some(([, allowed]) => allowed !== false)) {
    throw new Error(`${label} must grant no approval, promotion, execution or publication authority`);
  }
}

function sameStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function approvalAuthority() {
  return Object.freeze({
    identityLockApproval: true,
    candidateApproval: true,
    candidatePromotion: false,
    providerExecution: false,
    providerRetry: false,
    sourceMutation: false,
    repositoryMutation: false,
    gitCommit: false,
    gitPush: false,
    publication: false,
    runtimeActivation: false,
    websiteActivation: false,
    deployment: false,
    forcePush: false,
  });
}

export function compileCouncilAvatarIdentityLockApproval({
  handoff,
  plan,
  decisions,
  receipt,
  approvedBy,
  approvedAt,
  reason,
} = {}) {
  if (handoff?.schema !== COUNCIL_AVATAR_REVIEW_HANDOFF_SCHEMA) {
    throw new Error('Council avatar review handoff schema is invalid');
  }
  verifySelfHash(handoff, 'handoffSha256', 'Council avatar review handoff');
  if (plan?.schema !== REVIEW_PLAN_SCHEMA) {
    throw new Error('Project Art review plan schema is invalid');
  }
  verifySelfHash(plan, 'planSha256', 'Project Art review plan');
  if (decisions?.schema !== REVIEW_DECISIONS_SCHEMA) {
    throw new Error('Project Art review decisions schema is invalid');
  }
  verifySelfHash(decisions, 'decisionSha256', 'Project Art review decisions');
  if (receipt?.schema !== REVIEW_RECEIPT_SCHEMA) {
    throw new Error('Project Art review receipt schema is invalid');
  }
  verifySelfHash(receipt, 'receiptSha256', 'Project Art review receipt');

  if (
    handoff.planSha256 !== plan.planSha256 ||
    decisions.planSha256 !== plan.planSha256 ||
    receipt.planSha256 !== plan.planSha256 ||
    receipt.decisionSha256 !== decisions.decisionSha256 ||
    handoff.reviewId !== plan.reviewId ||
    decisions.reviewId !== plan.reviewId ||
    receipt.reviewId !== plan.reviewId ||
    receipt.reviewerMode !== decisions.reviewer?.mode ||
    receipt.reviewedAt !== decisions.reviewer?.reviewedAt ||
    receipt.itemCount !== decisions.decisions?.length
  ) {
    throw new Error('Council identity approval review provenance drift');
  }
  if (
    handoff.technicalAssuranceRequired !== true ||
    handoff.independentVisualReviewRequired !== true ||
    handoff.candidateApprovalPerformed !== false ||
    handoff.candidatePromotionPerformed !== false ||
    handoff.runtimeActivationPerformed !== false ||
    handoff.websiteActivationPerformed !== false ||
    decisions.independentApprovalPerformed !== false ||
    decisions.candidatePromotionPerformed !== false
  ) {
    throw new Error('Council identity approval input already claims unauthorized authority');
  }
  assertFalseAuthority(plan.authority, 'Project Art review plan');
  assertFalseAuthority(receipt.authority, 'Project Art review receipt');
  if (!APPROVER_MODES.has(decisions.reviewer?.mode)) {
    throw new Error('Council identity lock requires a finalized human or hybrid review');
  }
  if (!Array.isArray(handoff.requiredGates) || handoff.requiredGates.length < 1) {
    throw new Error('Council identity review required gates are missing');
  }
  if (
    !Array.isArray(handoff.characterIds) ||
    handoff.characterIds.length < 1 ||
    handoff.characterIds.some((characterId) => !ALLOWED_CHARACTERS.has(characterId))
  ) {
    throw new Error('Council identity handoff character set is invalid');
  }

  const reviewedAt = canonicalTimestamp(decisions.reviewer.reviewedAt, 'reviewer.reviewedAt');
  const approvalTime = canonicalTimestamp(approvedAt, 'approvedAt');
  if (approvalTime.milliseconds < reviewedAt.milliseconds) {
    throw new Error('Council identity approval cannot predate the finalized review');
  }

  const decisionMap = exactDecisionMap(decisions.decisions ?? []);
  const candidateMap = materializedByHash(handoff);
  const locks = [];
  const observedCharacters = new Set();
  let reviewedItemCount = 0;

  for (const group of plan.groups ?? []) {
    const characterId = groupCharacterId(group.id);
    if (observedCharacters.has(characterId)) {
      throw new Error(`duplicate Council identity review group for ${characterId}`);
    }
    observedCharacters.add(characterId);
    if (
      group.kind !== 'candidate-set' ||
      !sameStringSet(group.requiredGates, handoff.requiredGates) ||
      !Array.isArray(group.items) ||
      group.items.length < 2
    ) {
      throw new Error(`Council identity group ${group.id} has invalid candidate-set semantics`);
    }
    const keeps = [];
    for (const item of group.items) {
      reviewedItemCount += 1;
      const materialized = candidateMap.get(item.sha256);
      if (!materialized || materialized.characterId !== characterId) {
        throw new Error(`Council identity review item ${item.id} is not bound to the materialized handoff lineage`);
      }
      const decision = decisionMap.get(item.id);
      if (
        !decision ||
        decision.groupId !== group.id ||
        decision.sourceSha256 !== item.sha256
      ) {
        throw new Error(`Council identity decision binding drift for ${item.id}`);
      }
      if (decision.disposition === 'keep') keeps.push({ item, decision, materialized });
    }
    if (keeps.length !== 1) {
      throw new Error(`Council identity group ${group.id} requires exactly one kept candidate`);
    }
    const { item, decision, materialized } = keeps[0];
    for (const gate of handoff.requiredGates) {
      if (decision.gates?.[gate] !== 'pass') {
        throw new Error(`Council identity kept candidate ${item.id} must pass required gate ${gate}`);
      }
    }
    if (
      (decision.defects?.length ?? 0) !== 0 ||
      (decision.requiredChanges?.length ?? 0) !== 0
    ) {
      throw new Error(`Council identity kept candidate ${item.id} still contains repair requirements`);
    }
    locks.push(Object.freeze({
      characterId,
      reviewGroupId: group.id,
      reviewItemId: item.id,
      sourceSha256: item.sha256,
      masteredArtifactId: materialized.artifactId,
      masteredDescriptorSha256: materialized.descriptorSha256,
      masteredContentSha256: materialized.contentSha256,
      sourceCandidateArtifactId: materialized.sourceCandidateArtifactId,
      identityLocked: true,
      promotionEligibleByThisApproval: false,
      runtimeActivationAllowedByThisApproval: false,
      websiteActivationAllowedByThisApproval: false,
    }));
  }

  if (
    reviewedItemCount !== decisionMap.size ||
    reviewedItemCount !== candidateMap.size ||
    locks.length !== observedCharacters.size ||
    locks.length < 1 ||
    !sameStringSet([...observedCharacters], handoff.characterIds)
  ) {
    throw new Error('Council identity approval did not bind the complete reviewed candidate/character set');
  }

  const body = Object.freeze({
    schema: COUNCIL_AVATAR_IDENTITY_LOCK_APPROVAL_SCHEMA,
    status: 'approved',
    approvedAt: approvalTime.text,
    approvedBy: boundedText(approvedBy, 'approvedBy', 256),
    reason: boundedText(reason, 'reason', 8192),
    reviewer: Object.freeze({
      mode: decisions.reviewer.mode,
      id: decisions.reviewer.id,
      reviewedAt: reviewedAt.text,
    }),
    source: Object.freeze({
      handoffSha256: handoff.handoffSha256,
      planSha256: plan.planSha256,
      decisionSha256: decisions.decisionSha256,
      receiptSha256: receipt.receiptSha256,
      authorizationSha256: handoff.authorizationSha256,
      runtimePackageSha256: handoff.runtimePackageSha256,
    }),
    requiredGates: Object.freeze([...handoff.requiredGates]),
    locks: Object.freeze(locks),
    nextActions: Object.freeze([
      'Use each approved masteredArtifactId only as the canonical identity reference for that exact Council character.',
      'Compile direction-master and animation-family candidate requests from the approved identity lock.',
      'Run independent continuity and motion review before any promotion into Avatar Runtime.',
      'Create a separate release/promotion authorization before mutating Avatar Runtime or website assets.',
    ]),
    authority: approvalAuthority(),
  });
  return Object.freeze({ ...body, approvalSha256: sha256(body) });
}

export function validateCouncilAvatarIdentityLockApproval(approval) {
  if (
    !approval ||
    approval.schema !== COUNCIL_AVATAR_IDENTITY_LOCK_APPROVAL_SCHEMA ||
    approval.status !== 'approved'
  ) {
    throw new Error('Council avatar identity lock approval is invalid');
  }
  verifySelfHash(approval, 'approvalSha256', 'Council avatar identity lock approval');
  if (
    approval.authority?.identityLockApproval !== true ||
    approval.authority?.candidateApproval !== true ||
    approval.authority?.candidatePromotion !== false ||
    approval.authority?.runtimeActivation !== false ||
    approval.authority?.websiteActivation !== false ||
    !Array.isArray(approval.locks) ||
    approval.locks.some(
      (lock) =>
        !ALLOWED_CHARACTERS.has(lock.characterId) ||
        lock.identityLocked !== true ||
        lock.promotionEligibleByThisApproval !== false ||
        lock.runtimeActivationAllowedByThisApproval !== false ||
        lock.websiteActivationAllowedByThisApproval !== false,
    )
  ) {
    throw new Error('Council avatar identity lock approval authority/binding drift');
  }
  return approval;
}
