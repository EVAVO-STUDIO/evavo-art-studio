export const GAME_PRODUCTION_STUDIO_ID = 'art-studio';
export const GAME_PRODUCTION_REPOSITORY = 'EVAVO-STUDIO/evavo-art-studio';
export const GAME_PRODUCTION_SCHEMA_VERSION = '1.0.0';
export const GAME_PRODUCTION_RECEIPT_SCHEMA_VERSION = '1.0.0';
export const GAME_PRODUCTION_GATE_RECEIPT_SCHEMA_VERSION = '1.0.0';

const PLAN_LIMIT = 4 * 1024 * 1024;
const RECEIPT_LIMIT = 1024 * 1024;
const ALLOWED_OPERATIONS = new Set([
  'produce-environment-art',
  'produce-game-art',
  'produce-environment-key-art',
  'produce-game-concept-art',
  'produce-game-ui',
]);

function cloneBounded(value, limit = PLAN_LIMIT) {
  let visits = 0;
  const text = JSON.stringify(value, (_, item) => {
    if (
      ++visits > 300000 ||
      item === undefined ||
      ['function', 'symbol', 'bigint'].includes(typeof item) ||
      (typeof item === 'number' && !Number.isFinite(item))
    ) throw new Error('Expected bounded, dense, finite JSON.');
    return item;
  });
  if (typeof text !== 'string') throw new Error('Expected a JSON value.');
  if (Buffer.byteLength(text, 'utf8') > limit) throw new Error('Creative production input exceeds its byte limit.');
  return JSON.parse(text);
}

function required(value, name) {
  if (typeof value !== 'string' || !value) throw new Error(`${name} must be a non-empty string.`);
  return value;
}

function sameStrings(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function validatePacket(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) throw new Error('Production packet must be an object.');
  for (const key of ['id','kind','status','sourceDigest','sourceAssetId','sourceCategory','title','studio','repository','operation','deliverable']) required(packet[key], key);
  if (packet.kind !== 'creative-production-packet') throw new Error(`Packet ${packet.id} has unsupported kind.`);
  if (packet.status !== 'queued-not-executed') throw new Error(`Packet ${packet.id} must remain queued-not-executed at intake.`);
  if (packet.studio !== GAME_PRODUCTION_STUDIO_ID || packet.repository !== GAME_PRODUCTION_REPOSITORY) throw new Error(`Packet ${packet.id} targets the wrong studio or repository.`);
  if (!ALLOWED_OPERATIONS.has(packet.operation)) throw new Error(`Packet ${packet.id} has unsupported Art Studio operation ${packet.operation}.`);
  for (const key of ['dependsOn','acceptance','sourceRefs','notes']) if (!Array.isArray(packet[key])) throw new Error(`Packet ${packet.id} has invalid ${key}.`);
  if (packet.dependsOn.some(dep => typeof dep !== 'string' || !dep)) throw new Error(`Packet ${packet.id} has invalid dependencies.`);
  for (const key of ['execute','approve','mutateConsumerRepository','publish']) if (packet.authority?.[key] !== false) throw new Error(`Packet ${packet.id} attempts to escalate ${key} authority.`);
}

function validateReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new Error('Completed receipt must be an object.');
  if (receipt.kind !== 'creative-production-receipt' || receipt.schemaVersion !== GAME_PRODUCTION_RECEIPT_SCHEMA_VERSION || receipt.status !== 'completed-reviewed') throw new Error('Completed receipt must be creative-production-receipt v1.0.0 with completed-reviewed status.');
  for (const key of ['packetId','sourceDigest','studio','repository','operation']) required(receipt[key], `receipt.${key}`);
  required(receipt.artifactRevision?.id, 'receipt.artifactRevision.id');
  required(receipt.artifactRevision?.digest, 'receipt.artifactRevision.digest');
  if (!Array.isArray(receipt.evidenceRefs) || receipt.evidenceRefs.length === 0) throw new Error(`Receipt ${receipt.packetId} requires evidenceRefs.`);
  receipt.evidenceRefs.forEach((ref, index) => {
    required(ref?.kind, `receipt.evidenceRefs[${index}].kind`);
    required(ref?.ref, `receipt.evidenceRefs[${index}].ref`);
    if (Object.hasOwn(ref ?? {}, 'digest')) required(ref.digest, `receipt.evidenceRefs[${index}].digest`);
  });
  if (receipt.review?.status !== 'reviewed') throw new Error(`Receipt ${receipt.packetId} must be reviewed.`);
  required(receipt.review?.reviewer, 'receipt.review.reviewer');
  required(receipt.review?.evidenceDigest, 'receipt.review.evidenceDigest');
  for (const key of ['executesProduction','grantsCreativeApproval','mutatesConsumerRepository','publishes']) if (receipt.authority?.[key] !== false) throw new Error(`Receipt ${receipt.packetId} attempts to escalate ${key} authority.`);
}

function bindReceipt(receipt, plan, byId) {
  validateReceipt(receipt);
  if (receipt.sourceDigest !== plan.source.sourceDigest) throw new Error(`Receipt ${receipt.packetId} sourceDigest does not match the plan.`);
  const packet = byId.get(receipt.packetId);
  if (!packet) throw new Error(`Receipt ${receipt.packetId} references an unknown packet.`);
  for (const [receiptKey, packetKey] of [['sourceDigest','sourceDigest'],['studio','studio'],['repository','repository'],['operation','operation']]) {
    if (receipt[receiptKey] !== packet[packetKey]) throw new Error(`Receipt ${receipt.packetId} ${receiptKey} does not match its source packet.`);
  }
}

function validateGateReceipt(receipt, plan, gateById) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new Error('Gate receipt must be an object.');
  if (receipt.kind !== 'creative-production-gate-receipt' || receipt.schemaVersion !== GAME_PRODUCTION_GATE_RECEIPT_SCHEMA_VERSION || receipt.status !== 'approved-reviewed') throw new Error('Gate receipt must be creative-production-gate-receipt v1.0.0 with approved-reviewed status.');
  required(receipt.gateId, 'gateReceipt.gateId');
  required(receipt.sourceDigest, 'gateReceipt.sourceDigest');
  if (receipt.sourceDigest !== plan.source.sourceDigest) throw new Error(`Gate receipt ${receipt.gateId} sourceDigest does not match the plan.`);
  const gate = gateById.get(receipt.gateId);
  if (!gate) throw new Error(`Gate receipt ${receipt.gateId} references an unknown gate.`);
  if (!Array.isArray(receipt.gateDependencies) || receipt.gateDependencies.some(dep => typeof dep !== 'string' || !dep)) throw new Error(`Gate receipt ${receipt.gateId} has invalid gateDependencies.`);
  if (!sameStrings(receipt.gateDependencies, gate.dependsOn ?? [])) throw new Error(`Gate receipt ${receipt.gateId} dependencies do not match the plan gate.`);
  if (!Array.isArray(receipt.evidenceRefs) || receipt.evidenceRefs.length === 0) throw new Error(`Gate receipt ${receipt.gateId} requires evidenceRefs.`);
  receipt.evidenceRefs.forEach((ref, index) => {
    required(ref?.kind, `gateReceipt.evidenceRefs[${index}].kind`);
    required(ref?.ref, `gateReceipt.evidenceRefs[${index}].ref`);
    if (Object.hasOwn(ref ?? {}, 'digest')) required(ref.digest, `gateReceipt.evidenceRefs[${index}].digest`);
  });
  if (receipt.review?.status !== 'reviewed') throw new Error(`Gate receipt ${receipt.gateId} must be reviewed.`);
  required(receipt.review?.reviewer, 'gateReceipt.review.reviewer');
  required(receipt.review?.evidenceDigest, 'gateReceipt.review.evidenceDigest');
  if (receipt.authority?.recordsExternalApproval !== true) throw new Error(`Gate receipt ${receipt.gateId} must record external approval.`);
  for (const key of ['executesProduction','grantsAdditionalApproval','mutatesConsumerRepository','publishes']) if (receipt.authority?.[key] !== false) throw new Error(`Gate receipt ${receipt.gateId} attempts to escalate ${key} authority.`);
}

function receiptSummary(receipt) {
  return {
    kind: 'creative-production-receipt',
    packetId: receipt.packetId,
    studio: receipt.studio,
    repository: receipt.repository,
    operation: receipt.operation,
    artifactRevision: cloneBounded(receipt.artifactRevision, RECEIPT_LIMIT),
    review: cloneBounded(receipt.review, RECEIPT_LIMIT),
    evidenceRefs: cloneBounded(receipt.evidenceRefs, RECEIPT_LIMIT),
  };
}

function gateReceiptSummary(receipt) {
  return {
    kind: 'creative-production-gate-receipt',
    gateId: receipt.gateId,
    sourceDigest: receipt.sourceDigest,
    gateDependencies: cloneBounded(receipt.gateDependencies, RECEIPT_LIMIT),
    review: cloneBounded(receipt.review, RECEIPT_LIMIT),
    evidenceRefs: cloneBounded(receipt.evidenceRefs, RECEIPT_LIMIT),
  };
}

export function createGameProductionReceipt({ packet, artifactRevision, evidenceRefs, review }) {
  const source = cloneBounded(packet, RECEIPT_LIMIT);
  validatePacket(source);
  const receipt = {
    kind: 'creative-production-receipt', schemaVersion: GAME_PRODUCTION_RECEIPT_SCHEMA_VERSION,
    status: 'completed-reviewed', packetId: source.id, sourceDigest: source.sourceDigest,
    studio: source.studio, repository: source.repository, operation: source.operation,
    artifactRevision: cloneBounded(artifactRevision, RECEIPT_LIMIT),
    evidenceRefs: cloneBounded(evidenceRefs, RECEIPT_LIMIT), review: cloneBounded(review, RECEIPT_LIMIT),
    authority: { executesProduction: false, grantsCreativeApproval: false, mutatesConsumerRepository: false, publishes: false },
  };
  validateReceipt(receipt);
  return receipt;
}

export function admitGameProductionPlan(input, { gateReceipts = [], completedReceipts = [] } = {}) {
  const plan = cloneBounded(input);
  if (plan?.kind !== 'creative-production-plan' || plan.schemaVersion !== GAME_PRODUCTION_SCHEMA_VERSION) throw new Error('Expected creative-production-plan schemaVersion 1.0.0.');
  required(plan?.source?.sourceDigest, 'source.sourceDigest');
  if (!Array.isArray(plan.packets) || !Array.isArray(plan.gates) || !Array.isArray(gateReceipts) || !Array.isArray(completedReceipts)) throw new Error('packets, plan.gates, gateReceipts and completedReceipts must be arrays.');

  const byId = new Map();
  for (const packet of plan.packets) {
    required(packet?.id, 'packet.id');
    if (byId.has(packet.id)) throw new Error(`Duplicate packet id: ${packet.id}.`);
    if (packet.sourceDigest !== plan.source.sourceDigest) throw new Error(`Packet ${packet.id} sourceDigest does not match the plan source.`);
    byId.set(packet.id, packet);
  }
  const gateById = new Map([...plan.gates, plan.implementationGate].filter(Boolean).map(gate => [gate.id, gate]));

  const receipts = new Map();
  for (const raw of completedReceipts) {
    const receipt = cloneBounded(raw, RECEIPT_LIMIT);
    bindReceipt(receipt, plan, byId);
    if (receipts.has(receipt.packetId)) throw new Error(`Duplicate completed receipt for ${receipt.packetId}.`);
    receipts.set(receipt.packetId, receipt);
  }

  const reviewedGates = new Map();
  for (const raw of gateReceipts) {
    const receipt = cloneBounded(raw, RECEIPT_LIMIT);
    validateGateReceipt(receipt, plan, gateById);
    if (reviewedGates.has(receipt.gateId)) throw new Error(`Duplicate gate receipt for ${receipt.gateId}.`);
    reviewedGates.set(receipt.gateId, receipt);
  }

  const gateMemo = new Map();
  function gateReady(gateId, visiting = new Set()) {
    if (gateMemo.has(gateId)) return gateMemo.get(gateId);
    if (visiting.has(gateId)) return { ready: false, code: 'GATE_DEPENDENCY_CYCLE' };
    const gate = gateById.get(gateId);
    if (!gate) return { ready: false, code: 'UNKNOWN_GATE' };
    const gateReceipt = reviewedGates.get(gateId);
    if (!gateReceipt) return { ready: false, code: 'GATE_RECEIPT_REQUIRED' };
    const next = new Set(visiting); next.add(gateId);
    for (const dependency of gate.dependsOn ?? []) {
      if (gateById.has(dependency)) {
        const state = gateReady(dependency, next);
        if (!state.ready) return { ready: false, code: 'GATE_RECEIPT_CHAIN_INVALID', dependency };
      } else if (byId.has(dependency)) {
        if (!receipts.has(dependency)) return { ready: false, code: 'GATE_RECEIPT_CHAIN_INVALID', dependency };
      } else return { ready: false, code: 'UNKNOWN_GATE_DEPENDENCY', dependency };
    }
    const state = { ready: true, receipt: gateReceipt };
    gateMemo.set(gateId, state);
    return state;
  }

  const selected = plan.packets.filter(packet => packet.studio === GAME_PRODUCTION_STUDIO_ID || packet.repository === GAME_PRODUCTION_REPOSITORY);
  selected.forEach(validatePacket);
  const packets = selected.map(packet => {
    const blockers = [], resolvedDependencies = [];
    for (const dependency of packet.dependsOn) {
      if (dependency.startsWith('gate/')) {
        const state = gateReady(dependency);
        if (!state.ready) blockers.push({ code: state.code, dependency: state.dependency ?? dependency });
        else resolvedDependencies.push(gateReceiptSummary(state.receipt));
      } else if (!byId.has(dependency)) blockers.push({ code: 'UNKNOWN_DEPENDENCY', dependency });
      else {
        const receipt = receipts.get(dependency);
        if (!receipt) blockers.push({ code: 'REVIEWED_RECEIPT_REQUIRED', dependency });
        else resolvedDependencies.push(receiptSummary(receipt));
      }
    }
    return { ...cloneBounded(packet), intake: { readiness: blockers.length ? 'blocked' : 'ready-for-studio-execution-request', blockers, resolvedDependencies, executionAuthorized: false, approvalGranted: false } };
  });
  const readyCount = packets.filter(packet => packet.intake.readiness === 'ready-for-studio-execution-request').length;
  return {
    kind: 'creative-production-studio-intake', schemaVersion: GAME_PRODUCTION_SCHEMA_VERSION,
    status: packets.length === 0 ? 'no-work-for-studio' : readyCount === packets.length ? 'ready-for-explicit-execution-request' : 'blocked-on-dependencies',
    sourceDigest: plan.source.sourceDigest, studio: GAME_PRODUCTION_STUDIO_ID, repository: GAME_PRODUCTION_REPOSITORY,
    packetCount: packets.length, readyCount, receiptCount: receipts.size, gateReceiptCount: reviewedGates.size, packets,
    authority: { executesProduction: false, approvesCreativeWork: false, mutatesConsumerRepository: false, publishes: false },
    requirements: [
      'Require reviewed source-bound gate receipts; a bare gate id never unlocks Art Studio production.',
      'Lock silhouette, palette, material language, camera/readability and target display scale before downstream production.',
      'Use existing Art Studio provider admission, review and workspace authorization after intake; readiness is not execution authorization.',
    ],
  };
}
