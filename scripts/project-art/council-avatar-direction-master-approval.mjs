import { createHash } from 'node:crypto';

import { COUNCIL_AVATAR_DIRECTION_MASTER_REVIEW_HANDOFF_SCHEMA } from './council-avatar-direction-master-review-handoff.mjs';

export const COUNCIL_AVATAR_DIRECTION_MASTER_APPROVAL_SCHEMA =
  'evavo.project-art-council-avatar-direction-master-approval.v1';

const REVIEW_PLAN_SCHEMA = 'evavo.project-art-review-plan.v1';
const REVIEW_DECISIONS_SCHEMA = 'evavo.project-art-review-decisions.v1';
const REVIEW_RECEIPT_SCHEMA = 'evavo.project-art-review-receipt.v1';
const APPROVER_MODES = new Set(['human', 'hybrid']);
const REQUIRED_VIEWS = Object.freeze(['full-body-right', 'full-body-left', 'neutral-bust']);
const ALLOWED_CHARACTERS = Object.freeze(['council-critic', 'council-open-reviewer']);
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
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function verifySelfHash(value, field, label) {
  if (!value || typeof value !== 'object' || !HEX64.test(value[field] ?? '')) {
    throw new Error(`${label} ${field} is invalid`);
  }
  const body = { ...value };
  delete body[field];
  if (sha256(body) !== value[field]) throw new Error(`${label} ${field} mismatch`);
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

function falseAuthorityPresent(value, label) {
  if (!value || typeof value !== 'object') throw new Error(`${label} authority is missing`);
  for (const [key, enabled] of Object.entries(value)) {
    if (enabled !== false) throw new Error(`${label} contains unauthorized authority ${key}`);
  }
}

function exactDecisionMap(decisions) {
  const result = new Map();
  for (const decision of decisions ?? []) {
    if (!decision || typeof decision.itemId !== 'string' || result.has(decision.itemId)) {
      throw new Error('Project Art direction review decisions are invalid or duplicated');
    }
    result.set(decision.itemId, decision);
  }
  return result;
}

function materializedByHash(handoff) {
  const result = new Map();
  for (const candidate of handoff.materialized ?? []) {
    if (
      !ALLOWED_CHARACTERS.includes(candidate?.characterId) ||
      !REQUIRED_VIEWS.includes(candidate?.viewId) ||
      !HEX64.test(candidate?.contentSha256 ?? '') ||
      !HEX64.test(candidate?.descriptorSha256 ?? '') ||
      typeof candidate?.artifactId !== 'string'
    ) {
      throw new Error('Direction review handoff contains an invalid materialized candidate');
    }
    if (result.has(candidate.contentSha256)) {
      throw new Error(`Duplicate direction candidate content hash: ${candidate.contentSha256}`);
    }
    result.set(candidate.contentSha256, candidate);
  }
  return result;
}

function authority() {
  return Object.freeze({
    directionMasterApproval: true,
    candidateApproval: true,
    animationProduction: false,
    candidatePromotion: false,
    identityLockMutation: false,
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

export function compileCouncilAvatarDirectionMasterApproval({
  handoff,
  plan,
  decisions,
  receipt,
  approvedBy,
  approvedAt,
  reason,
} = {}) {
  if (handoff?.schema !== COUNCIL_AVATAR_DIRECTION_MASTER_REVIEW_HANDOFF_SCHEMA) {
    throw new Error('Council direction review handoff schema is invalid');
  }
  verifySelfHash(handoff, 'handoffSha256', 'Council direction review handoff');
  if (plan?.schema !== REVIEW_PLAN_SCHEMA) throw new Error('Project Art review plan schema is invalid');
  verifySelfHash(plan, 'planSha256', 'Project Art review plan');
  if (decisions?.schema !== REVIEW_DECISIONS_SCHEMA) throw new Error('Project Art review decisions schema is invalid');
  verifySelfHash(decisions, 'decisionSha256', 'Project Art review decisions');
  if (receipt?.schema !== REVIEW_RECEIPT_SCHEMA) throw new Error('Project Art review receipt schema is invalid');
  verifySelfHash(receipt, 'receiptSha256', 'Project Art review receipt');

  if (
    handoff.planSha256 !== plan.planSha256 ||
    decisions.planSha256 !== plan.planSha256 ||
    receipt.planSha256 !== plan.planSha256 ||
    receipt.decisionSha256 !== decisions.decisionSha256 ||
    handoff.reviewId !== plan.reviewId ||
    decisions.reviewId !== plan.reviewId ||
    receipt.reviewId !== plan.reviewId ||
    decisions.projectId !== plan.projectId ||
    receipt.projectId !== plan.projectId
  ) {
    throw new Error('Council direction approval review provenance drift');
  }
  if (
    handoff.directionMasterApprovalPerformed !== false ||
    handoff.candidatePromotionPerformed !== false ||
    handoff.runtimeActivationPerformed !== false ||
    handoff.websiteActivationPerformed !== false ||
    decisions.independentApprovalPerformed !== false ||
    decisions.candidatePromotionPerformed !== false
  ) {
    throw new Error('Council direction approval input already claims unauthorized authority');
  }
  falseAuthorityPresent(plan.authority, 'Project Art review plan');
  falseAuthorityPresent(receipt.authority, 'Project Art review receipt');
  if (!APPROVER_MODES.has(decisions.reviewer?.mode)) {
    throw new Error('Council direction-master approval requires a finalized human or hybrid review');
  }
  if (
    receipt.reviewerMode !== decisions.reviewer.mode ||
    receipt.reviewedAt !== decisions.reviewer.reviewedAt ||
    receipt.itemCount !== decisions.decisions?.length
  ) {
    throw new Error('Council direction review receipt/reviewer metadata drift');
  }
  const reviewedAt = canonicalTimestamp(decisions.reviewer.reviewedAt, 'reviewer.reviewedAt');
  const approvalAt = canonicalTimestamp(approvedAt, 'approvedAt');
  if (approvalAt.milliseconds < reviewedAt.milliseconds) {
    throw new Error('direction-master approval cannot predate the finalized review');
  }
  if (!Array.isArray(handoff.requiredGates) || handoff.requiredGates.length < 1) {
    throw new Error('Council direction review required gates are missing');
  }

  const candidates = materializedByHash(handoff);
  const decisionMap = exactDecisionMap(decisions.decisions);
  const expectedViewKeys = new Set(
    (handoff.requiredViews ?? []).map((entry) => `${entry.characterId}:${entry.viewId}`),
  );
  if (expectedViewKeys.size !== ALLOWED_CHARACTERS.length * REQUIRED_VIEWS.length) {
    throw new Error('Council direction review required view set is incomplete');
  }
  for (const characterId of ALLOWED_CHARACTERS) {
    for (const viewId of REQUIRED_VIEWS) {
      if (!expectedViewKeys.has(`${characterId}:${viewId}`)) {
        throw new Error(`Council direction review is missing required view ${characterId}:${viewId}`);
      }
    }
  }

  const candidatesByView = new Map();
  const allPlanItems = [];
  for (const group of plan.groups ?? []) {
    const characterId = ALLOWED_CHARACTERS.find((id) => group.id === `${id}-direction-master-candidates`);
    if (!characterId) throw new Error(`Unexpected Council direction review group: ${group.id}`);
    for (const item of group.items ?? []) {
      const materialized = candidates.get(item.sha256);
      if (!materialized || materialized.characterId !== characterId) {
        throw new Error(`Council direction review item ${item.id} does not resolve to handoff lineage`);
      }
      const key = `${materialized.characterId}:${materialized.viewId}`;
      if (!expectedViewKeys.has(key)) throw new Error(`Unexpected Council direction candidate view ${key}`);
      const values = candidatesByView.get(key) ?? [];
      values.push({ group, item, materialized });
      candidatesByView.set(key, values);
      allPlanItems.push(item.id);
      const decision = decisionMap.get(item.id);
      if (!decision || decision.groupId !== group.id || decision.sourceSha256 !== item.sha256) {
        throw new Error(`Council direction decision binding drift for ${item.id}`);
      }
    }
  }
  if (
    allPlanItems.length !== handoff.materialized.length ||
    decisionMap.size !== allPlanItems.length ||
    handoff.candidateCount !== allPlanItems.length
  ) {
    throw new Error('Council direction review candidate set drift');
  }

  const locks = [];
  for (const key of [...expectedViewKeys].sort()) {
    const entries = candidatesByView.get(key) ?? [];
    if (entries.length !== handoff.candidateCountPerView) {
      throw new Error(`Council direction review candidate count drift for ${key}`);
    }
    const kept = entries.filter(({ item }) => decisionMap.get(item.id).disposition === 'keep');
    if (kept.length !== 1) {
      throw new Error(`Council direction view ${key} requires exactly one kept candidate`);
    }
    const { group, item, materialized } = kept[0];
    const decision = decisionMap.get(item.id);
    for (const gate of handoff.requiredGates) {
      if (decision.gates?.[gate] !== 'pass') {
        throw new Error(`Council direction kept candidate ${item.id} must pass required gate ${gate}`);
      }
    }
    if ((decision.defects?.length ?? 0) !== 0 || (decision.requiredChanges?.length ?? 0) !== 0) {
      throw new Error(`Council direction kept candidate ${item.id} still contains repair requirements`);
    }
    locks.push(Object.freeze({
      characterId: materialized.characterId,
      viewId: materialized.viewId,
      reviewGroupId: group.id,
      reviewItemId: item.id,
      sourceSha256: item.sha256,
      masteredArtifactId: materialized.artifactId,
      masteredDescriptorSha256: materialized.descriptorSha256,
      masteredContentSha256: materialized.contentSha256,
      sourceCandidateArtifactId: materialized.sourceCandidateArtifactId,
      directionMasterLocked: true,
      animationProductionAllowedByThisApproval: false,
      promotionEligibleByThisApproval: false,
      runtimeActivationAllowedByThisApproval: false,
      websiteActivationAllowedByThisApproval: false,
    }));
  }

  const body = Object.freeze({
    schema: COUNCIL_AVATAR_DIRECTION_MASTER_APPROVAL_SCHEMA,
    status: 'approved',
    approvedAt: approvalAt.text,
    approvedBy: boundedText(approvedBy, 'approvedBy', 256),
    reason: boundedText(reason, 'reason', 8192),
    reviewer: Object.freeze({
      mode: decisions.reviewer.mode,
      id: decisions.reviewer.id,
      reviewedAt: decisions.reviewer.reviewedAt,
    }),
    source: Object.freeze({
      handoffSha256: handoff.handoffSha256,
      planSha256: plan.planSha256,
      decisionSha256: decisions.decisionSha256,
      receiptSha256: receipt.receiptSha256,
      identityApprovalSha256: handoff.identityApprovalSha256,
      directionMasterPlanSha256: handoff.directionMasterPlanSha256,
      runtimePackageSha256: handoff.runtimePackageSha256,
      authorizationSha256: handoff.authorizationSha256,
    }),
    requiredGates: Object.freeze([...handoff.requiredGates]),
    locks: Object.freeze(locks),
    nextActions: Object.freeze([
      'Use these six direction-master locks as canonical reference inputs for animation key-pose planning.',
      'Compile animation key poses and motion families separately from this approval; this record grants no animation execution authority.',
      'Run frame-level continuity, loop closure, mouth/eye layer and motion review before any runtime promotion.',
      'Create a separate animation release/promotion authorization before mutating Avatar Runtime or website media.',
    ]),
    authority: authority(),
  });
  return Object.freeze({ ...body, approvalSha256: sha256(body) });
}

export function validateCouncilAvatarDirectionMasterApproval(approval) {
  if (
    !approval ||
    approval.schema !== COUNCIL_AVATAR_DIRECTION_MASTER_APPROVAL_SCHEMA ||
    approval.status !== 'approved'
  ) {
    throw new Error('Council direction-master approval is invalid');
  }
  verifySelfHash(approval, 'approvalSha256', 'Council direction-master approval');
  if (
    approval.authority?.directionMasterApproval !== true ||
    approval.authority?.candidateApproval !== true ||
    approval.authority?.animationProduction !== false ||
    approval.authority?.candidatePromotion !== false ||
    approval.authority?.runtimeActivation !== false ||
    approval.authority?.websiteActivation !== false ||
    !Array.isArray(approval.locks) ||
    approval.locks.length !== 6 ||
    approval.locks.some((lock) =>
      !ALLOWED_CHARACTERS.includes(lock.characterId) ||
      !REQUIRED_VIEWS.includes(lock.viewId) ||
      lock.directionMasterLocked !== true ||
      lock.animationProductionAllowedByThisApproval !== false ||
      lock.promotionEligibleByThisApproval !== false ||
      lock.runtimeActivationAllowedByThisApproval !== false ||
      lock.websiteActivationAllowedByThisApproval !== false
    )
  ) {
    throw new Error('Council direction-master approval authority/binding drift');
  }
  const keys = new Set(approval.locks.map((lock) => `${lock.characterId}:${lock.viewId}`));
  if (keys.size !== 6) throw new Error('Council direction-master approval contains duplicate/missing view locks');
  return approval;
}
