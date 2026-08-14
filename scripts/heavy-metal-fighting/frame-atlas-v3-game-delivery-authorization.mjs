import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { types as utilTypes } from "node:util";

import {
  assert,
  boundedString,
  canonicalTimestamp,
  freeze,
  hashValue,
  safeActorId,
  selfHashed,
  SHA256,
} from "./frame-body-named-human-approval-common.mjs";
import {
  assertExactApprovalKeys,
  snapshotApprovalJson,
} from "./frame-body-named-human-approval-snapshot.mjs";
import {
  HMF_ATLAS_V3_GAME_VALIDATION_MAXIMUM_RECEIPT_BYTES,
  verifyHmfAtlasV3GameValidationAdmission,
} from "./frame-atlas-v3-game-validation-admission.mjs";

export const HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_SCHEMA =
  "evavo.heavy-metal-fighting-atlas-v3-game-delivery-authorization.v1";
export const HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_PROTOCOL_VERSION =
  "2026-08-15.2";

const FRAMES = Object.freeze(["bastion", "viper", "citadel", "mirage"]);
const PLAN_SCHEMA = "evavo.heavy-metal-fighting-frame-atlas-v3-plan.v1";
const PLAN_PROTOCOL_VERSION = "2026-08-12.1";
const BUILD_RECEIPT_SCHEMA =
  "evavo.heavy-metal-fighting-frame-atlas-v3-build-receipt.v1";
const BUILD_VERIFICATION_SCHEMA =
  "evavo.heavy-metal-fighting-frame-atlas-v3-build-verification.v1";
const GAME_REPOSITORY = "EVAVO-STUDIO/steel-dominion";
const GIT_SHA = /^[0-9a-f]{40}$/u;
const UTC_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?Z$/u;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SOURCE_WIDTH = 160;
const SOURCE_HEIGHT = 160;
const ATLAS_WIDTH = 2560;
const ATLAS_HEIGHT = 2560;
const AUTHORED_SOURCES = 224;
const RESERVED_SLOTS = Object.freeze(Array.from({ length: 32 }, (_, index) => 224 + index));
const MAX_SOURCE_PNG_BYTES = 16 * 1024 * 1024;
const MAX_ATLAS_PNG_BYTES = 128 * 1024 * 1024;
const MAX_FRAME_BINARY_BYTES = 512 * 1024 * 1024;
const BLOCKERS = Object.freeze([
  "focused-godot-atlas-v3-validation",
  "runtime-cutover-validation",
  "explicit-game-repository-delivery-authorization",
]);

const INPUT_FIELDS = Object.freeze([
  "gameValidationAdmission",
  "gameValidationReceiptBytes",
  "expectedGameHead",
  "atlasBuildEvidence",
  "humanAuthorization",
]);
const VERIFY_INPUT_FIELDS = Object.freeze([...INPUT_FIELDS, "authorization"]);
const BUILD_EVIDENCE_FIELDS = Object.freeze([
  "frameId", "plan", "receipt", "atlasPngBytes", "sourcePngBytes",
]);
const PLAN_FIELDS = Object.freeze([
  "schema", "protocolVersion", "projectId", "publicTitle", "frameId", "compiledAt",
  "registrySha256", "layoutSha256", "deliveryContractSha256", "styleProofExecutionSha256",
  "styleProofApproval", "workspaceRoot", "allowedSourceRoot", "productionMaster", "sources",
  "reservedSlots", "batchEvidence", "outputs", "gameTarget", "authority", "createOnlyOutput",
  "atomicWorkspacePublication", "planSha256",
]);
const PLAN_SOURCE_FIELDS = Object.freeze([
  "slot", "row", "column", "x", "y", "width", "height", "bankId", "productionGroup",
  "unitId", "batchId", "workOrderSha256", "headReceiptSha256", "masterRelativePath",
  "sourcePath", "sourceBytes", "sourceSha256",
]);
const PLAN_MASTER_FIELDS = Object.freeze([
  "contractId", "cell", "authoringCell", "pivot", "columns", "rows", "atlas",
  "slotsPerFrame", "authoredSlotsPerFrame", "reservedSlots", "canonicalFormat",
  "resampling", "runtimeFiltering",
]);
const PLAN_OUTPUT_FIELDS = Object.freeze([
  "image", "manifest", "receipt", "recommendedWorkspaceParent",
]);
const PLAN_BATCH_FIELDS = Object.freeze([
  "batchId", "workOrderBatchSha256", "completedUnits", "unitReceiptHeads",
]);
const PLAN_BATCH_HEAD_FIELDS = Object.freeze(["unitId", "headReceiptSha256"]);
const BUILD_RECEIPT_FIELDS = Object.freeze([
  "schema", "projectId", "frameId", "contractId", "planSha256",
  "styleProofExecutionSha256", "styleProofApproval", "sourceCount", "reservedSlotCount",
  "outputs", "gameTarget", "gameActivationReady", "gameActivationBlockers", "authority",
  "createOnlyOutput", "atomicWorkspacePublication", "sourceMutation",
  "targetRepositoryMutation", "gitMutation", "publication", "receiptSha256",
]);
const STYLE_PROOF_FIELDS = Object.freeze([
  "id", "actorClass", "actorId", "occurredAt", "evidenceSha256",
]);
const RECEIPT_OUTPUT_FIELDS = Object.freeze(["image", "manifest"]);
const RECEIPT_FILE_FIELDS = Object.freeze(["path", "sha256", "bytes"]);
const GAME_TARGET_FIELDS = Object.freeze([
  "repository", "technicalId", "contractId", "imagePath", "activationReady", "activationBlockers",
]);
const BUILD_AUTHORITY_FIELDS = Object.freeze([
  "sourceRead", "workspaceExportWrite", "sourceMutation", "candidateApproval", "candidatePromotion",
  "targetRepositoryMutation", "gitMutation", "deployment", "publication", "forcePush",
  "namedHumanApprovalRequired",
]);
const HUMAN_AUTHORIZATION_FIELDS = Object.freeze([
  "actorId", "occurredAt", "decision", "rationale", "evidenceSha256", "attestations",
]);
const HUMAN_ATTESTATION_FIELDS = Object.freeze([
  "exactGameValidationAdmissionReviewed",
  "allFourAtlasBuildVerificationsReviewed",
  "exactBuildReceiptLineageAccepted",
  "canonicalTargetPathsAccepted",
  "deliveryAuthorizationOnly",
  "noRepositoryMutationOrRuntimeActivationPerformed",
]);
const AUTHORIZATION_FIELDS = Object.freeze([
  "schema", "protocolVersion", "projectId", "publicTitle", "gameRepository", "gameHead",
  "gameValidationAdmissionSha256", "atlasBuilds", "humanAuthorization", "checks", "authority",
  "authorizationSha256",
]);
const AUTHORIZED_BUILD_FIELDS = Object.freeze([
  "frameId", "planSha256", "buildReceiptSha256", "buildVerificationSha256", "imageSha256",
  "targetImagePath", "styleProofExecutionSha256",
]);
const AUTHORIZATION_HUMAN_FIELDS = Object.freeze([
  "actorClass", "actorId", "occurredAt", "decision", "rationale", "evidenceSha256",
]);
const CHECK_FIELDS = Object.freeze([
  "exactGameValidationAdmission",
  "exactValidatedGameHead",
  "allFourFrameBuildsPresent",
  "allFourExactPixelVerificationsPassed",
  "allBuildReceiptSelfHashesValid",
  "allBuildEvidenceCrossBound",
  "canonicalGameTargetPaths",
  "namedHumanDeliveryAuthorization",
  "authorizationAfterReviewedEvidence",
  "runtimeActivationRemainsSeparate",
]);
const AUTHORITY_FIELDS = Object.freeze([
  "evidenceAdmission", "callerSuppliedAtlasByteRead", "callerSuppliedSourceByteRead",
  "imageInspection", "namedHumanDeliveryAuthorization", "gameRepositoryRead",
  "gameRepositoryMutation", "runtimeActivation", "gitMutation", "deployment", "publication",
  "forcePush",
]);

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_ATLAS_V3_DELIVERY_AUTHORIZATION_INVALID: ${message}`);
}

function inspectOrdinaryInput(input, expectedFields, label) {
  assert(input && typeof input === "object" && !Array.isArray(input), `${label} must be an object.`);
  if (utilTypes.isProxy(input)) fail(`${label} may not be a Proxy.`);
  let prototype;
  let keys;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(input);
    keys = Reflect.ownKeys(input);
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch (error) {
    fail(`${label} could not be inspected safely: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(prototype === Object.prototype, `${label} must use the ordinary Object prototype.`);
  assert(keys.every((key) => typeof key === "string"), `${label} may not contain symbolic properties.`);
  const actual = keys.map(String).sort();
  const expected = [...expectedFields].sort();
  assert(
    actual.length === expected.length && actual.every((key, index) => key === expected[index]),
    `${label} fields must be exactly: ${expected.join(", ")}.`,
  );
  for (const key of actual) {
    const descriptor = descriptors[key];
    assert(descriptor && "value" in descriptor, `${label}.${key} may not be an accessor.`);
    assert(descriptor.enumerable === true, `${label}.${key} must be enumerable data.`);
  }
  return descriptors;
}

function copyByteView(source, label, maximumBytes) {
  if (source && typeof source === "object" && utilTypes.isProxy(source)) {
    fail(`${label} may not be a Proxy.`);
  }
  assert(Buffer.isBuffer(source) || source instanceof Uint8Array, `${label} must be a Buffer or Uint8Array.`);
  if (typeof SharedArrayBuffer !== "undefined") {
    assert(!(source.buffer instanceof SharedArrayBuffer), `${label} may not use shared memory.`);
  }
  assert(source.byteLength >= 1 && source.byteLength <= maximumBytes, `${label} exceeds the admitted byte bounds.`);
  return Buffer.from(source);
}

function copySourceByteArray(source, label) {
  assert(Array.isArray(source), `${label} must be an array.`);
  if (utilTypes.isProxy(source)) fail(`${label} may not be a Proxy.`);
  let descriptors;
  let keys;
  try {
    descriptors = Object.getOwnPropertyDescriptors(source);
    keys = Reflect.ownKeys(source);
  } catch (error) {
    fail(`${label} could not be inspected safely: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(Object.getPrototypeOf(source) === Array.prototype, `${label} must use the ordinary Array prototype.`);
  assert(source.length === AUTHORED_SOURCES, `${label} must contain exactly ${AUTHORED_SOURCES} PNG byte payloads.`);
  const expectedKeys = new Set(["length", ...Array.from({ length: AUTHORED_SOURCES }, (_, index) => String(index))]);
  assert(keys.every((key) => typeof key === "string" && expectedKeys.has(key)), `${label} contains unexpected properties.`);
  assert(keys.length === expectedKeys.size, `${label} must define every source byte payload exactly once.`);
  const copied = [];
  let totalBytes = 0;
  for (let index = 0; index < AUTHORED_SOURCES; index += 1) {
    const descriptor = descriptors[String(index)];
    assert(descriptor && "value" in descriptor, `${label}[${index}] may not be an accessor.`);
    const bytes = copyByteView(descriptor.value, `${label}[${index}]`, MAX_SOURCE_PNG_BYTES);
    totalBytes += bytes.length;
    assert(totalBytes <= MAX_FRAME_BINARY_BYTES, `${label} exceeds the per-frame aggregate byte bound.`);
    copied.push(bytes);
  }
  return freeze(copied);
}

function captureAtlasBuildEvidence(source) {
  assert(Array.isArray(source), "atlasBuildEvidence must be an array.");
  if (utilTypes.isProxy(source)) fail("atlasBuildEvidence may not be a Proxy.");
  assert(Object.getPrototypeOf(source) === Array.prototype, "atlasBuildEvidence must use the ordinary Array prototype.");
  assert(source.length === FRAMES.length, "atlasBuildEvidence must contain exactly four Frame entries.");
  const descriptors = Object.getOwnPropertyDescriptors(source);
  const captured = [];
  for (let index = 0; index < FRAMES.length; index += 1) {
    const itemDescriptor = descriptors[String(index)];
    assert(itemDescriptor && "value" in itemDescriptor, `atlasBuildEvidence[${index}] may not be an accessor.`);
    const entry = itemDescriptor.value;
    const fields = inspectOrdinaryInput(entry, BUILD_EVIDENCE_FIELDS, `atlasBuildEvidence[${index}]`);
    const frameId = fields.frameId.value;
    assert(frameId === FRAMES[index], `atlasBuildEvidence[${index}] must be ${FRAMES[index]}.`);
    const atlasPngBytes = copyByteView(
      fields.atlasPngBytes.value,
      `atlasBuildEvidence[${index}].atlasPngBytes`,
      MAX_ATLAS_PNG_BYTES,
    );
    const sourcePngBytes = copySourceByteArray(
      fields.sourcePngBytes.value,
      `atlasBuildEvidence[${index}].sourcePngBytes`,
    );
    assert(
      atlasPngBytes.length + sourcePngBytes.reduce((sum, bytes) => sum + bytes.length, 0)
        <= MAX_FRAME_BINARY_BYTES,
      `atlasBuildEvidence[${index}] exceeds the per-frame aggregate byte bound.`,
    );
    captured.push(freeze({
      frameId,
      plan: snapshotApprovalJson(fields.plan.value, `atlasBuildEvidence[${index}].plan`, {
        maximumDepth: 20,
        maximumNodes: 32768,
        maximumBytes: 4 * 1024 * 1024,
      }),
      receipt: snapshotApprovalJson(fields.receipt.value, `atlasBuildEvidence[${index}].receipt`, {
        maximumDepth: 16,
        maximumNodes: 4096,
        maximumBytes: 1024 * 1024,
      }),
      atlasPngBytes,
      sourcePngBytes,
    }));
  }
  return freeze(captured);
}

function copyReceiptBytes(source) {
  return copyByteView(
    source,
    "gameValidationReceiptBytes",
    HMF_ATLAS_V3_GAME_VALIDATION_MAXIMUM_RECEIPT_BYTES,
  );
}

function captureInput(input, includeAuthorization = false) {
  const descriptors = inspectOrdinaryInput(
    input,
    includeAuthorization ? VERIFY_INPUT_FIELDS : INPUT_FIELDS,
    includeAuthorization ? "delivery authorization verifier input" : "delivery authorization compiler input",
  );
  const expectedGameHead = descriptors.expectedGameHead.value;
  assert(
    typeof expectedGameHead === "string" && GIT_SHA.test(expectedGameHead),
    "expectedGameHead must be a 40-character lowercase Git commit SHA.",
  );
  const captured = {
    gameValidationAdmission: snapshotApprovalJson(
      descriptors.gameValidationAdmission.value,
      "gameValidationAdmission",
      { maximumDepth: 16, maximumNodes: 4096, maximumBytes: 1024 * 1024 },
    ),
    gameValidationReceiptBytes: copyReceiptBytes(descriptors.gameValidationReceiptBytes.value),
    expectedGameHead,
    atlasBuildEvidence: captureAtlasBuildEvidence(descriptors.atlasBuildEvidence.value),
    humanAuthorization: snapshotApprovalJson(
      descriptors.humanAuthorization.value,
      "humanAuthorization",
      { maximumDepth: 8, maximumNodes: 128, maximumBytes: 32 * 1024 },
    ),
  };
  if (includeAuthorization) {
    captured.authorization = snapshotApprovalJson(
      descriptors.authorization.value,
      "submitted HMF atlas-v3 game delivery authorization",
      { maximumDepth: 16, maximumNodes: 4096, maximumBytes: 1024 * 1024 },
    );
  }
  return Object.freeze(captured);
}

function timestampMilliseconds(value, label) {
  assert(typeof value === "string", `${label} must be a UTC timestamp.`);
  const match = UTC_TIMESTAMP.exec(value);
  assert(match, `${label} must be a UTC timestamp.`);
  const milliseconds = (match[2] ?? "0").padEnd(3, "0").slice(0, 3);
  const instant = Date.parse(`${match[1]}.${milliseconds}Z`);
  assert(Number.isFinite(instant), `${label} must be a valid UTC timestamp.`);
  return instant;
}

function normalizePath(value) {
  return String(value).replaceAll("\\", "/").replace(/\/+$/u, "");
}

function safePlanRelativePath(value, label) {
  assert(typeof value === "string" && value.length > 0 && !value.startsWith("/"), `${label} must be relative.`);
  const segments = value.replaceAll("\\", "/").split("/");
  assert(segments.every((segment) => segment && segment !== "." && segment !== ".."), `${label} contains an unsafe segment.`);
  return segments.join("/");
}

function expectedGameTarget(frameId) {
  return {
    repository: GAME_REPOSITORY,
    technicalId: "steel-dominion",
    contractId: "production_master_v3",
    imagePath: `res://assets/fighters/final-v3/${frameId}.png`,
    activationReady: false,
    activationBlockers: [...BLOCKERS],
  };
}

function validateStyleProofApproval(value, label) {
  assertExactApprovalKeys(value, STYLE_PROOF_FIELDS, label);
  assert(value.id === "style-proof-approved" && value.actorClass === "human", `${label} is not a named-human approval.`);
  safeActorId(value.actorId, `${label}.actorId`);
  timestampMilliseconds(value.occurredAt, `${label}.occurredAt`);
  assert(SHA256.test(value.evidenceSha256), `${label}.evidenceSha256 must be a SHA-256.`);
  return value.occurredAt;
}

function validateBuildAuthority(value, label) {
  assertExactApprovalKeys(value, BUILD_AUTHORITY_FIELDS, label);
  assert(
    value.sourceRead === true
      && value.workspaceExportWrite === true
      && value.namedHumanApprovalRequired === true,
    `${label} lost bounded source/workspace/human authority.`,
  );
  for (const key of BUILD_AUTHORITY_FIELDS) {
    if (["sourceRead", "workspaceExportWrite", "namedHumanApprovalRequired"].includes(key)) continue;
    assert(value[key] === false, `${label} gained forbidden authority: ${key}.`);
  }
}

function validatePlan(plan, frameId) {
  assertExactApprovalKeys(plan, PLAN_FIELDS, `atlas build plan ${frameId}`);
  selfHashed(plan, "planSha256", `atlas build plan ${frameId}`);
  assert(plan.schema === PLAN_SCHEMA, `atlas build plan ${frameId} schema drifted.`);
  assert(plan.protocolVersion === PLAN_PROTOCOL_VERSION, `atlas build plan ${frameId} protocol drifted.`);
  assert(
    plan.projectId === "heavy-metal-fighting"
      && plan.publicTitle === "HEAVY METAL FIGHTING"
      && plan.frameId === frameId,
    `atlas build plan ${frameId} identity drifted.`,
  );
  timestampMilliseconds(plan.compiledAt, `atlas build plan ${frameId}.compiledAt`);
  for (const key of [
    "registrySha256", "layoutSha256", "deliveryContractSha256", "styleProofExecutionSha256",
  ]) {
    assert(SHA256.test(plan[key]), `atlas build plan ${frameId}.${key} must be a SHA-256.`);
  }
  validateStyleProofApproval(plan.styleProofApproval, `atlas build plan ${frameId}.styleProofApproval`);
  assertExactApprovalKeys(plan.productionMaster, PLAN_MASTER_FIELDS, `atlas build plan ${frameId}.productionMaster`);
  const expectedMaster = {
    contractId: "production_master_v3",
    cell: { width: 160, height: 160 },
    authoringCell: { width: 640, height: 640 },
    pivot: { x: 80, y: 152 },
    columns: 16,
    rows: 16,
    atlas: { width: 2560, height: 2560 },
    slotsPerFrame: 256,
    authoredSlotsPerFrame: 224,
    reservedSlots: {
      start: 224,
      end: 255,
      count: 32,
      requiredAlpha: "fully-transparent",
    },
    canonicalFormat: "png",
    resampling: "none",
    runtimeFiltering: "nearest-neighbour",
  };
  assert(hashValue(plan.productionMaster) === hashValue(expectedMaster), `atlas build plan ${frameId} production master drifted.`);
  const workspaceRoot = normalizePath(plan.workspaceRoot);
  const allowedSourceRoot = normalizePath(plan.allowedSourceRoot);
  assert(workspaceRoot.length > 0, `atlas build plan ${frameId}.workspaceRoot is invalid.`);
  assert(
    allowedSourceRoot === `${workspaceRoot}/masters/frames/${frameId}/sprites`,
    `atlas build plan ${frameId}.allowedSourceRoot drifted.`,
  );
  assert(Array.isArray(plan.sources) && plan.sources.length === AUTHORED_SOURCES, `atlas build plan ${frameId} requires 224 sources.`);
  const units = new Map();
  for (let slot = 0; slot < AUTHORED_SOURCES; slot += 1) {
    const source = plan.sources[slot];
    assertExactApprovalKeys(source, PLAN_SOURCE_FIELDS, `atlas build plan ${frameId}.sources[${slot}]`);
    assert(
      source.slot === slot
        && source.row === Math.floor(slot / 16)
        && source.column === slot % 16
        && source.x === (slot % 16) * SOURCE_WIDTH
        && source.y === Math.floor(slot / 16) * SOURCE_HEIGHT
        && source.width === SOURCE_WIDTH
        && source.height === SOURCE_HEIGHT,
      `atlas build plan ${frameId}.sources[${slot}] geometry drifted.`,
    );
    for (const key of ["workOrderSha256", "headReceiptSha256", "sourceSha256"]) {
      assert(SHA256.test(source[key]), `atlas build plan ${frameId}.sources[${slot}].${key} must be a SHA-256.`);
    }
    assert(
      Number.isSafeInteger(source.sourceBytes)
        && source.sourceBytes >= 1
        && source.sourceBytes <= MAX_SOURCE_PNG_BYTES,
      `atlas build plan ${frameId}.sources[${slot}].sourceBytes is invalid.`,
    );
    assert(typeof source.unitId === "string" && source.unitId.length > 0, `atlas build plan ${frameId}.sources[${slot}].unitId is invalid.`);
    assert(!units.has(source.unitId), `atlas build plan ${frameId} contains duplicate source units.`);
    const relative = safePlanRelativePath(source.masterRelativePath, `atlas build plan ${frameId}.sources[${slot}].masterRelativePath`);
    assert(
      normalizePath(source.sourcePath) === `${workspaceRoot}/${relative}`,
      `atlas build plan ${frameId}.sources[${slot}] path substitution detected.`,
    );
    units.set(source.unitId, source);
  }
  assert(
    Array.isArray(plan.reservedSlots)
      && hashValue(plan.reservedSlots) === hashValue(RESERVED_SLOTS),
    `atlas build plan ${frameId} reserved slots drifted.`,
  );
  assert(Array.isArray(plan.batchEvidence) && plan.batchEvidence.length === 26, `atlas build plan ${frameId} requires 26 batch records.`);
  const batchUnits = new Map();
  for (let index = 0; index < plan.batchEvidence.length; index += 1) {
    const batch = plan.batchEvidence[index];
    assertExactApprovalKeys(batch, PLAN_BATCH_FIELDS, `atlas build plan ${frameId}.batchEvidence[${index}]`);
    assert(typeof batch.batchId === "string" && batch.batchId.length > 0, `atlas build plan ${frameId}.batchEvidence[${index}].batchId is invalid.`);
    assert(SHA256.test(batch.workOrderBatchSha256), `atlas build plan ${frameId}.batchEvidence[${index}].workOrderBatchSha256 is invalid.`);
    assert(Array.isArray(batch.unitReceiptHeads) && batch.unitReceiptHeads.length > 0, `atlas build plan ${frameId}.batchEvidence[${index}] is empty.`);
    assert(batch.completedUnits === batch.unitReceiptHeads.length, `atlas build plan ${frameId}.batchEvidence[${index}] completedUnits drifted.`);
    for (const head of batch.unitReceiptHeads) {
      assertExactApprovalKeys(head, PLAN_BATCH_HEAD_FIELDS, `atlas build plan ${frameId}.batchEvidence[${index}].unitReceiptHeads`);
      assert(SHA256.test(head.headReceiptSha256), `atlas build plan ${frameId} batch head SHA is invalid.`);
      assert(!batchUnits.has(head.unitId), `atlas build plan ${frameId} repeats a batch source unit.`);
      batchUnits.set(head.unitId, { batchId: batch.batchId, headReceiptSha256: head.headReceiptSha256 });
    }
  }
  assert(batchUnits.size === units.size, `atlas build plan ${frameId} batch evidence does not cover every source.`);
  for (const [unitId, source] of units) {
    const batch = batchUnits.get(unitId);
    assert(
      batch
        && batch.batchId === source.batchId
        && batch.headReceiptSha256 === source.headReceiptSha256,
      `atlas build plan ${frameId} source receipt evidence disagrees.`,
    );
  }
  assertExactApprovalKeys(plan.outputs, PLAN_OUTPUT_FIELDS, `atlas build plan ${frameId}.outputs`);
  assert(
    hashValue(plan.outputs) === hashValue({
      image: `${frameId}.png`,
      manifest: `${frameId}.atlas-v3.json`,
      receipt: `${frameId}.atlas-v3.receipt.json`,
      recommendedWorkspaceParent: `exports/runtime/frames/${frameId}`,
    }),
    `atlas build plan ${frameId} outputs drifted.`,
  );
  assertExactApprovalKeys(plan.gameTarget, GAME_TARGET_FIELDS, `atlas build plan ${frameId}.gameTarget`);
  assert(hashValue(plan.gameTarget) === hashValue(expectedGameTarget(frameId)), `atlas build plan ${frameId} game target drifted.`);
  validateBuildAuthority(plan.authority, `atlas build plan ${frameId}.authority`);
  assert(plan.createOnlyOutput === true && plan.atomicWorkspacePublication === true, `atlas build plan ${frameId} publication contract drifted.`);
  return freeze(plan);
}

function validateHumanAuthorization(value) {
  assertExactApprovalKeys(value, HUMAN_AUTHORIZATION_FIELDS, "humanAuthorization");
  assertExactApprovalKeys(value.attestations, HUMAN_ATTESTATION_FIELDS, "humanAuthorization.attestations");
  const actorId = safeActorId(value.actorId, "humanAuthorization.actorId");
  const occurredAt = canonicalTimestamp(value.occurredAt, "humanAuthorization.occurredAt");
  assert(value.decision === "authorized", "humanAuthorization.decision must be authorized.");
  const rationale = boundedString(value.rationale, "humanAuthorization.rationale", 12, 2000);
  assert(SHA256.test(value.evidenceSha256), "humanAuthorization.evidenceSha256 must be a SHA-256.");
  for (const key of HUMAN_ATTESTATION_FIELDS) {
    assert(value.attestations[key] === true, `humanAuthorization.attestations.${key} must be true.`);
  }
  return freeze({
    actorClass: "human",
    actorId,
    occurredAt,
    decision: "authorized",
    rationale,
    evidenceSha256: value.evidenceSha256,
  });
}

function validateReceiptFile(value, expectedPath, label) {
  assertExactApprovalKeys(value, RECEIPT_FILE_FIELDS, label);
  assert(value.path === expectedPath, `${label}.path drifted.`);
  assert(SHA256.test(value.sha256), `${label}.sha256 must be a SHA-256.`);
  assert(Number.isSafeInteger(value.bytes) && value.bytes > 0, `${label}.bytes must be a positive safe integer.`);
}

function validateBuildReceipt(receipt, plan, frameId) {
  assertExactApprovalKeys(receipt, BUILD_RECEIPT_FIELDS, `atlas build receipt ${frameId}`);
  selfHashed(receipt, "receiptSha256", `atlas build receipt ${frameId}`);
  assert(receipt.schema === BUILD_RECEIPT_SCHEMA, `atlas build receipt ${frameId} schema drifted.`);
  assert(receipt.projectId === "heavy-metal-fighting", `atlas build receipt ${frameId} project drifted.`);
  assert(receipt.frameId === frameId, `atlas build receipt ${frameId} frame drifted.`);
  assert(receipt.contractId === "production_master_v3", `atlas build receipt ${frameId} contract drifted.`);
  assert(receipt.planSha256 === plan.planSha256, `atlas build receipt ${frameId} plan hash disagrees.`);
  assert(
    receipt.styleProofExecutionSha256 === plan.styleProofExecutionSha256,
    `atlas build receipt ${frameId} style-proof execution disagrees with the plan.`,
  );
  const styleProofOccurredAt = validateStyleProofApproval(
    receipt.styleProofApproval,
    `atlas build receipt ${frameId}.styleProofApproval`,
  );
  assert(
    hashValue(receipt.styleProofApproval) === hashValue(plan.styleProofApproval),
    `atlas build receipt ${frameId} style-proof approval disagrees with the plan.`,
  );
  assert(receipt.sourceCount === 224 && receipt.reservedSlotCount === 32, `atlas build receipt ${frameId} source counts drifted.`);
  assertExactApprovalKeys(receipt.outputs, RECEIPT_OUTPUT_FIELDS, `atlas build receipt ${frameId}.outputs`);
  validateReceiptFile(receipt.outputs.image, `${frameId}.png`, `atlas build receipt ${frameId}.outputs.image`);
  validateReceiptFile(receipt.outputs.manifest, `${frameId}.atlas-v3.json`, `atlas build receipt ${frameId}.outputs.manifest`);
  assertExactApprovalKeys(receipt.gameTarget, GAME_TARGET_FIELDS, `atlas build receipt ${frameId}.gameTarget`);
  assert(hashValue(receipt.gameTarget) === hashValue(expectedGameTarget(frameId)), `atlas build receipt ${frameId} game target drifted.`);
  assert(receipt.gameActivationReady === false, `atlas build receipt ${frameId} may not claim game activation.`);
  assert(hashValue(receipt.gameActivationBlockers) === hashValue(BLOCKERS), `atlas build receipt ${frameId} activation blockers drifted.`);
  validateBuildAuthority(receipt.authority, `atlas build receipt ${frameId}.authority`);
  for (const key of ["gameActivationReady", "sourceMutation", "targetRepositoryMutation", "gitMutation", "publication"]) {
    assert(receipt[key] === false, `atlas build receipt ${frameId}.${key} must remain false.`);
  }
  assert(receipt.createOnlyOutput === true && receipt.atomicWorkspacePublication === true, `atlas build receipt ${frameId} publication contract drifted.`);
  return freeze({ receipt, styleProofOccurredAt });
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}

function decodeRgbaPng(bytes, expectedWidth, expectedHeight, label) {
  assert(Buffer.isBuffer(bytes) && bytes.length >= 45, `${label} is not a complete PNG.`);
  assert(bytes.subarray(0, 8).equals(PNG_SIGNATURE), `${label} lacks the PNG signature.`);
  let offset = 8;
  let ihdr = null;
  const idat = [];
  let sawIdat = false;
  let idatClosed = false;
  let sawIend = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    assert(/^[A-Za-z]{4}$/u.test(type), `${label} contains an invalid PNG chunk type.`);
    assert(Number.isSafeInteger(dataEnd) && dataEnd + 4 <= bytes.length, `${label} PNG chunk ${type} is truncated.`);
    const data = bytes.subarray(dataStart, dataEnd);
    assert(
      crc32(Buffer.concat([typeBytes, data])) === bytes.readUInt32BE(dataEnd),
      `${label} PNG chunk ${type} failed CRC validation.`,
    );
    if (type === "IHDR") {
      assert(ihdr === null && offset === 8 && length === 13, `${label} must begin with one valid IHDR chunk.`);
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
      assert(
        ihdr.width === expectedWidth
          && ihdr.height === expectedHeight
          && ihdr.bitDepth === 8
          && ihdr.colorType === 6
          && ihdr.compression === 0
          && ihdr.filter === 0
          && ihdr.interlace === 0,
        `${label} must be an exact ${expectedWidth}x${expectedHeight} 8-bit non-interlaced RGBA PNG.`,
      );
    } else if (type === "IDAT") {
      assert(ihdr !== null && !idatClosed, `${label} PNG IDAT chunks must follow IHDR and remain contiguous.`);
      sawIdat = true;
      idat.push(data);
    } else if (type === "IEND") {
      assert(length === 0 && sawIdat, `${label} PNG IEND is malformed or precedes image data.`);
      sawIend = true;
      offset = dataEnd + 4;
      break;
    } else {
      if (sawIdat) idatClosed = true;
      assert(!["acTL", "fcTL", "fdAT"].includes(type), `${label} may not be an animated PNG.`);
      const critical = type.charCodeAt(0) >= 65 && type.charCodeAt(0) <= 90;
      assert(!critical, `${label} contains unsupported critical PNG chunk ${type}.`);
    }
    offset = dataEnd + 4;
  }
  assert(ihdr && sawIend && idat.length >= 1, `${label} is missing IHDR, IDAT, or IEND data.`);
  assert(offset === bytes.length, `${label} contains trailing bytes after IEND.`);
  const rowBytes = expectedWidth * 4;
  const expectedInflatedBytes = (rowBytes + 1) * expectedHeight;
  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(idat), { maxOutputLength: expectedInflatedBytes });
  } catch (error) {
    fail(`${label} image data cannot be inflated within its exact bound: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(inflated.length === expectedInflatedBytes, `${label} decoded byte length is invalid.`);
  const pixels = Buffer.alloc(rowBytes * expectedHeight);
  for (let y = 0; y < expectedHeight; y += 1) {
    const scanline = y * (rowBytes + 1);
    const filterType = inflated[scanline];
    assert(filterType >= 0 && filterType <= 4, `${label} row ${y} uses unsupported filter ${filterType}.`);
    const encoded = inflated.subarray(scanline + 1, scanline + 1 + rowBytes);
    const decodedOffset = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= 4 ? pixels[decodedOffset + x - 4] : 0;
      const up = y > 0 ? pixels[decodedOffset - rowBytes + x] : 0;
      const upLeft = y > 0 && x >= 4 ? pixels[decodedOffset - rowBytes + x - 4] : 0;
      let value = encoded[x];
      if (filterType === 1) value = (value + left) & 0xff;
      else if (filterType === 2) value = (value + up) & 0xff;
      else if (filterType === 3) value = (value + Math.floor((left + up) / 2)) & 0xff;
      else if (filterType === 4) value = (value + paeth(left, up, upLeft)) & 0xff;
      pixels[decodedOffset + x] = value;
    }
  }
  return pixels;
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function verifyExactPixels(entry, plan, receipt, frameId) {
  assert(entry.atlasPngBytes.length === receipt.outputs.image.bytes, `atlas build ${frameId} image byte count disagrees with receipt.`);
  const imageSha256 = sha256Bytes(entry.atlasPngBytes);
  assert(imageSha256 === receipt.outputs.image.sha256, `atlas build ${frameId} image SHA-256 disagrees with receipt.`);
  const atlasPixels = decodeRgbaPng(entry.atlasPngBytes, ATLAS_WIDTH, ATLAS_HEIGHT, `atlas build ${frameId} image`);
  const decodedBySha = new Map();
  for (let slot = 0; slot < AUTHORED_SOURCES; slot += 1) {
    const source = plan.sources[slot];
    const bytes = entry.sourcePngBytes[slot];
    assert(bytes.length === source.sourceBytes, `atlas build ${frameId} source ${slot} byte count drifted.`);
    assert(sha256Bytes(bytes) === source.sourceSha256, `atlas build ${frameId} source ${slot} SHA-256 drifted.`);
    let sourcePixels = decodedBySha.get(source.sourceSha256);
    if (!sourcePixels) {
      sourcePixels = decodeRgbaPng(bytes, SOURCE_WIDTH, SOURCE_HEIGHT, `atlas build ${frameId} source ${slot}`);
      decodedBySha.set(source.sourceSha256, sourcePixels);
    }
    for (let y = 0; y < SOURCE_HEIGHT; y += 1) {
      const sourceStart = y * SOURCE_WIDTH * 4;
      const atlasStart = ((source.y + y) * ATLAS_WIDTH + source.x) * 4;
      assert(
        sourcePixels.subarray(sourceStart, sourceStart + SOURCE_WIDTH * 4)
          .equals(atlasPixels.subarray(atlasStart, atlasStart + SOURCE_WIDTH * 4)),
        `atlas build ${frameId} cell ${slot} differs from the exact admitted source pixels.`,
      );
    }
  }
  for (let y = 14 * SOURCE_HEIGHT; y < ATLAS_HEIGHT; y += 1) {
    for (let x = 0; x < ATLAS_WIDTH; x += 1) {
      assert(atlasPixels[(y * ATLAS_WIDTH + x) * 4 + 3] === 0, `atlas build ${frameId} reserved slots are not fully transparent.`);
    }
  }
  return freeze({
    schema: BUILD_VERIFICATION_SCHEMA,
    status: "passed",
    frameId,
    planSha256: plan.planSha256,
    receiptSha256: receipt.receiptSha256,
    imageSha256,
    exactSourcePixelsVerified: true,
    targetRepositoryMutation: false,
    gameActivationReady: false,
  });
}

function validateBuildEvidence(value) {
  let latestStyleProofMilliseconds = Number.NEGATIVE_INFINITY;
  const atlasBuilds = value.map((entry, index) => {
    const frameId = FRAMES[index];
    const plan = validatePlan(entry.plan, frameId);
    const admittedReceipt = validateBuildReceipt(entry.receipt, plan, frameId);
    const receipt = admittedReceipt.receipt;
    const verification = verifyExactPixels(entry, plan, receipt, frameId);
    latestStyleProofMilliseconds = Math.max(
      latestStyleProofMilliseconds,
      timestampMilliseconds(admittedReceipt.styleProofOccurredAt, `atlas build receipt ${frameId}.styleProofApproval.occurredAt`),
    );
    return freeze({
      frameId,
      planSha256: plan.planSha256,
      buildReceiptSha256: receipt.receiptSha256,
      buildVerificationSha256: hashValue(verification),
      imageSha256: receipt.outputs.image.sha256,
      targetImagePath: receipt.gameTarget.imagePath,
      styleProofExecutionSha256: receipt.styleProofExecutionSha256,
    });
  });
  return freeze({ atlasBuilds: freeze(atlasBuilds), latestStyleProofMilliseconds });
}

function authorizationAuthority() {
  return freeze({
    evidenceAdmission: true,
    callerSuppliedAtlasByteRead: true,
    callerSuppliedSourceByteRead: true,
    imageInspection: true,
    namedHumanDeliveryAuthorization: true,
    gameRepositoryRead: false,
    gameRepositoryMutation: false,
    runtimeActivation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    forcePush: false,
  });
}

function validateAuthorizationShape(value, expectedGameHead = undefined) {
  const authorization = snapshotApprovalJson(
    value,
    "HMF atlas-v3 game delivery authorization",
    { maximumDepth: 16, maximumNodes: 4096, maximumBytes: 1024 * 1024 },
  );
  assertExactApprovalKeys(authorization, AUTHORIZATION_FIELDS, "HMF atlas-v3 game delivery authorization");
  selfHashed(authorization, "authorizationSha256", "HMF atlas-v3 game delivery authorization");
  assert(authorization.schema === HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_SCHEMA, "delivery authorization schema drifted.");
  assert(authorization.protocolVersion === HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_PROTOCOL_VERSION, "delivery authorization protocol drifted.");
  assert(
    authorization.projectId === "heavy-metal-fighting" && authorization.publicTitle === "HEAVY METAL FIGHTING",
    "delivery authorization project identity drifted.",
  );
  assert(authorization.gameRepository === GAME_REPOSITORY, "delivery authorization repository drifted.");
  assert(GIT_SHA.test(authorization.gameHead), "delivery authorization gameHead must be a Git SHA.");
  if (expectedGameHead !== undefined) {
    assert(authorization.gameHead === expectedGameHead, "delivery authorization gameHead drifted from expected game head.");
  }
  assert(SHA256.test(authorization.gameValidationAdmissionSha256), "delivery authorization game validation hash is invalid.");
  assert(Array.isArray(authorization.atlasBuilds) && authorization.atlasBuilds.length === 4, "delivery authorization must retain four atlas builds.");
  authorization.atlasBuilds.forEach((entry, index) => {
    assertExactApprovalKeys(entry, AUTHORIZED_BUILD_FIELDS, `delivery authorization atlasBuilds[${index}]`);
    assert(entry.frameId === FRAMES[index], `delivery authorization atlasBuilds[${index}] frame drifted.`);
    for (const key of [
      "planSha256", "buildReceiptSha256", "buildVerificationSha256", "imageSha256", "styleProofExecutionSha256",
    ]) {
      assert(SHA256.test(entry[key]), `delivery authorization atlasBuilds[${index}].${key} must be a SHA-256.`);
    }
    assert(entry.targetImagePath === `res://assets/fighters/final-v3/${entry.frameId}.png`, `delivery authorization atlasBuilds[${index}] target path drifted.`);
  });
  assertExactApprovalKeys(authorization.humanAuthorization, AUTHORIZATION_HUMAN_FIELDS, "delivery authorization humanAuthorization");
  assert(authorization.humanAuthorization.actorClass === "human", "delivery authorization must retain a human authorizer.");
  safeActorId(authorization.humanAuthorization.actorId, "delivery authorization humanAuthorization.actorId");
  canonicalTimestamp(authorization.humanAuthorization.occurredAt, "delivery authorization humanAuthorization.occurredAt");
  assert(authorization.humanAuthorization.decision === "authorized", "delivery authorization decision drifted.");
  boundedString(authorization.humanAuthorization.rationale, "delivery authorization humanAuthorization.rationale", 12, 2000);
  assert(SHA256.test(authorization.humanAuthorization.evidenceSha256), "delivery authorization human evidence hash is invalid.");
  assertExactApprovalKeys(authorization.checks, CHECK_FIELDS, "delivery authorization checks");
  for (const key of CHECK_FIELDS) assert(authorization.checks[key] === true, `delivery authorization check ${key} must remain true.`);
  assertExactApprovalKeys(authorization.authority, AUTHORITY_FIELDS, "delivery authorization authority");
  for (const key of [
    "evidenceAdmission", "callerSuppliedAtlasByteRead", "callerSuppliedSourceByteRead",
    "imageInspection", "namedHumanDeliveryAuthorization",
  ]) {
    assert(authorization.authority[key] === true, `delivery authorization lost bounded authority: ${key}.`);
  }
  for (const key of AUTHORITY_FIELDS.slice(5)) {
    assert(authorization.authority[key] === false, `delivery authorization gained forbidden authority: ${key}.`);
  }
  return freeze(authorization);
}

export function compileHmfAtlasV3GameDeliveryAuthorization(input) {
  const captured = captureInput(input);
  const gameValidationAdmission = verifyHmfAtlasV3GameValidationAdmission({
    admission: captured.gameValidationAdmission,
    receiptBytes: captured.gameValidationReceiptBytes,
    expectedGameHead: captured.expectedGameHead,
  });
  const humanAuthorization = validateHumanAuthorization(captured.humanAuthorization);
  const validatedBuildEvidence = validateBuildEvidence(captured.atlasBuildEvidence);
  const evidenceCompletedAt = Math.max(
    timestampMilliseconds(
      gameValidationAdmission.validationWindow.completedAtUtc,
      "game validation admission validationWindow.completedAtUtc",
    ),
    validatedBuildEvidence.latestStyleProofMilliseconds,
  );
  assert(
    timestampMilliseconds(humanAuthorization.occurredAt, "humanAuthorization.occurredAt") >= evidenceCompletedAt,
    "humanAuthorization.occurredAt must be at or after the reviewed game-validation and style-proof evidence.",
  );
  const body = {
    schema: HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_SCHEMA,
    protocolVersion: HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_PROTOCOL_VERSION,
    projectId: "heavy-metal-fighting",
    publicTitle: "HEAVY METAL FIGHTING",
    gameRepository: GAME_REPOSITORY,
    gameHead: captured.expectedGameHead,
    gameValidationAdmissionSha256: gameValidationAdmission.admissionSha256,
    atlasBuilds: validatedBuildEvidence.atlasBuilds,
    humanAuthorization,
    checks: {
      exactGameValidationAdmission: true,
      exactValidatedGameHead: true,
      allFourFrameBuildsPresent: true,
      allFourExactPixelVerificationsPassed: true,
      allBuildReceiptSelfHashesValid: true,
      allBuildEvidenceCrossBound: true,
      canonicalGameTargetPaths: true,
      namedHumanDeliveryAuthorization: true,
      authorizationAfterReviewedEvidence: true,
      runtimeActivationRemainsSeparate: true,
    },
    authority: authorizationAuthority(),
  };
  return validateAuthorizationShape(
    freeze({ ...body, authorizationSha256: hashValue(body) }),
    captured.expectedGameHead,
  );
}

export function verifyHmfAtlasV3GameDeliveryAuthorization(input) {
  const captured = captureInput(input, true);
  const submitted = validateAuthorizationShape(captured.authorization, captured.expectedGameHead);
  const expected = compileHmfAtlasV3GameDeliveryAuthorization({
    gameValidationAdmission: captured.gameValidationAdmission,
    gameValidationReceiptBytes: captured.gameValidationReceiptBytes,
    expectedGameHead: captured.expectedGameHead,
    atlasBuildEvidence: captured.atlasBuildEvidence,
    humanAuthorization: captured.humanAuthorization,
  });
  assert(
    hashValue(submitted) === hashValue(expected),
    "submitted delivery authorization does not match the exact game validation, atlas build bytes and human authorization inputs.",
  );
  return submitted;
}
