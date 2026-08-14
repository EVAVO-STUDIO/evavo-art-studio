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
  "2026-08-15.1";

const FRAMES = Object.freeze(["bastion", "viper", "citadel", "mirage"]);
const BUILD_RECEIPT_SCHEMA =
  "evavo.heavy-metal-fighting-frame-atlas-v3-build-receipt.v1";
const BUILD_VERIFICATION_SCHEMA =
  "evavo.heavy-metal-fighting-frame-atlas-v3-build-verification.v1";
const GAME_REPOSITORY = "EVAVO-STUDIO/steel-dominion";
const GIT_SHA = /^[0-9a-f]{40}$/u;
const UTC_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?Z$/u;
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
const BUILD_EVIDENCE_FIELDS = Object.freeze(["frameId", "verification", "receipt"]);
const VERIFICATION_FIELDS = Object.freeze([
  "schema", "status", "frameId", "planSha256", "receiptSha256", "imageSha256",
  "exactSourcePixelsVerified", "targetRepositoryMutation", "gameActivationReady",
]);
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
  "evidenceAdmission", "namedHumanDeliveryAuthorization", "gameRepositoryRead",
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

function copyReceiptBytes(source) {
  if (source && typeof source === "object" && utilTypes.isProxy(source)) {
    fail("gameValidationReceiptBytes may not be a Proxy.");
  }
  assert(
    Buffer.isBuffer(source) || source instanceof Uint8Array,
    "gameValidationReceiptBytes must be a Buffer or Uint8Array.",
  );
  if (typeof SharedArrayBuffer !== "undefined") {
    assert(!(source.buffer instanceof SharedArrayBuffer), "gameValidationReceiptBytes may not use shared memory.");
  }
  assert(
    source.byteLength >= 1 &&
      source.byteLength <= HMF_ATLAS_V3_GAME_VALIDATION_MAXIMUM_RECEIPT_BYTES,
    "gameValidationReceiptBytes exceeds the admitted byte bounds.",
  );
  return Buffer.from(source);
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
    atlasBuildEvidence: snapshotApprovalJson(
      descriptors.atlasBuildEvidence.value,
      "atlasBuildEvidence",
      { maximumDepth: 16, maximumNodes: 4096, maximumBytes: 1024 * 1024 },
    ),
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
  const normalized = `${match[1]}.${milliseconds}Z`;
  const instant = Date.parse(normalized);
  assert(Number.isFinite(instant), `${label} must be a valid UTC timestamp.`);
  return instant;
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

function validateBuildReceipt(receipt, frameId) {
  assertExactApprovalKeys(receipt, BUILD_RECEIPT_FIELDS, `atlas build receipt ${frameId}`);
  selfHashed(receipt, "receiptSha256", `atlas build receipt ${frameId}`);
  assert(receipt.schema === BUILD_RECEIPT_SCHEMA, `atlas build receipt ${frameId} schema drifted.`);
  assert(receipt.projectId === "heavy-metal-fighting", `atlas build receipt ${frameId} project drifted.`);
  assert(receipt.frameId === frameId, `atlas build receipt ${frameId} frame drifted.`);
  assert(receipt.contractId === "production_master_v3", `atlas build receipt ${frameId} contract drifted.`);
  assert(SHA256.test(receipt.planSha256), `atlas build receipt ${frameId} planSha256 is invalid.`);
  assert(SHA256.test(receipt.styleProofExecutionSha256), `atlas build receipt ${frameId} styleProofExecutionSha256 is invalid.`);
  assertExactApprovalKeys(receipt.styleProofApproval, STYLE_PROOF_FIELDS, `atlas build receipt ${frameId} styleProofApproval`);
  assert(
    receipt.styleProofApproval.id === "style-proof-approved" &&
      receipt.styleProofApproval.actorClass === "human" &&
      SHA256.test(receipt.styleProofApproval.evidenceSha256),
    `atlas build receipt ${frameId} style proof approval drifted.`,
  );
  const styleProofOccurredAt = receipt.styleProofApproval.occurredAt;
  timestampMilliseconds(styleProofOccurredAt, `atlas build receipt ${frameId} styleProofApproval.occurredAt`);
  assert(receipt.sourceCount === 224 && receipt.reservedSlotCount === 32, `atlas build receipt ${frameId} source counts drifted.`);
  assertExactApprovalKeys(receipt.outputs, RECEIPT_OUTPUT_FIELDS, `atlas build receipt ${frameId} outputs`);
  validateReceiptFile(receipt.outputs.image, `${frameId}.png`, `atlas build receipt ${frameId} outputs.image`);
  validateReceiptFile(receipt.outputs.manifest, `${frameId}.atlas-v3.json`, `atlas build receipt ${frameId} outputs.manifest`);
  assertExactApprovalKeys(receipt.gameTarget, GAME_TARGET_FIELDS, `atlas build receipt ${frameId} gameTarget`);
  assert(
    hashValue(receipt.gameTarget) === hashValue(expectedGameTarget(frameId)),
    `atlas build receipt ${frameId} game target drifted.`,
  );
  assert(receipt.gameActivationReady === false, `atlas build receipt ${frameId} may not claim game activation.`);
  assert(
    hashValue(receipt.gameActivationBlockers) === hashValue(BLOCKERS),
    `atlas build receipt ${frameId} activation blockers drifted.`,
  );
  assertExactApprovalKeys(receipt.authority, BUILD_AUTHORITY_FIELDS, `atlas build receipt ${frameId} authority`);
  assert(
    receipt.authority.sourceRead === true &&
      receipt.authority.workspaceExportWrite === true &&
      receipt.authority.namedHumanApprovalRequired === true,
    `atlas build receipt ${frameId} lost bounded source/workspace/human authority.`,
  );
  for (const key of BUILD_AUTHORITY_FIELDS) {
    if (["sourceRead", "workspaceExportWrite", "namedHumanApprovalRequired"].includes(key)) continue;
    assert(receipt.authority[key] === false, `atlas build receipt ${frameId} gained forbidden authority: ${key}.`);
  }
  for (const key of [
    "gameActivationReady", "sourceMutation", "targetRepositoryMutation", "gitMutation", "publication",
  ]) {
    assert(receipt[key] === false, `atlas build receipt ${frameId}.${key} must remain false.`);
  }
  assert(
    receipt.createOnlyOutput === true && receipt.atomicWorkspacePublication === true,
    `atlas build receipt ${frameId} publication contract drifted.`,
  );
  return freeze({ receipt, styleProofOccurredAt });
}

function validateBuildVerification(verification, receipt, frameId) {
  assertExactApprovalKeys(verification, VERIFICATION_FIELDS, `atlas build verification ${frameId}`);
  assert(verification.schema === BUILD_VERIFICATION_SCHEMA, `atlas build verification ${frameId} schema drifted.`);
  assert(verification.status === "passed", `atlas build verification ${frameId} must be passed.`);
  assert(verification.frameId === frameId, `atlas build verification ${frameId} frame drifted.`);
  assert(verification.planSha256 === receipt.planSha256, `atlas build verification ${frameId} plan disagrees with receipt.`);
  assert(verification.receiptSha256 === receipt.receiptSha256, `atlas build verification ${frameId} receipt hash disagrees.`);
  assert(verification.imageSha256 === receipt.outputs.image.sha256, `atlas build verification ${frameId} image hash disagrees.`);
  assert(verification.exactSourcePixelsVerified === true, `atlas build verification ${frameId} must prove exact source pixels.`);
  assert(verification.targetRepositoryMutation === false, `atlas build verification ${frameId} may not claim target mutation.`);
  assert(verification.gameActivationReady === false, `atlas build verification ${frameId} may not claim activation.`);
  return verification;
}

function validateBuildEvidence(value) {
  assert(Array.isArray(value) && value.length === FRAMES.length, "atlasBuildEvidence must contain exactly four Frame entries.");
  let latestStyleProofMilliseconds = Number.NEGATIVE_INFINITY;
  const atlasBuilds = value.map((entry, index) => {
    const frameId = FRAMES[index];
    assertExactApprovalKeys(entry, BUILD_EVIDENCE_FIELDS, `atlasBuildEvidence[${index}]`);
    assert(entry.frameId === frameId, `atlasBuildEvidence[${index}] must be ${frameId}.`);
    const admittedReceipt = validateBuildReceipt(entry.receipt, frameId);
    const receipt = admittedReceipt.receipt;
    const verification = validateBuildVerification(entry.verification, receipt, frameId);
    latestStyleProofMilliseconds = Math.max(
      latestStyleProofMilliseconds,
      timestampMilliseconds(
        admittedReceipt.styleProofOccurredAt,
        `atlas build receipt ${frameId} styleProofApproval.occurredAt`,
      ),
    );
    return freeze({
      frameId,
      planSha256: receipt.planSha256,
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
    assert(
      entry.targetImagePath === `res://assets/fighters/final-v3/${entry.frameId}.png`,
      `delivery authorization atlasBuilds[${index}] target path drifted.`,
    );
  });
  assertExactApprovalKeys(authorization.humanAuthorization, AUTHORIZATION_HUMAN_FIELDS, "delivery authorization humanAuthorization");
  assert(authorization.humanAuthorization.actorClass === "human", "delivery authorization must retain a human authorizer.");
  safeActorId(authorization.humanAuthorization.actorId, "delivery authorization humanAuthorization.actorId");
  canonicalTimestamp(authorization.humanAuthorization.occurredAt, "delivery authorization humanAuthorization.occurredAt");
  assert(authorization.humanAuthorization.decision === "authorized", "delivery authorization decision drifted.");
  boundedString(authorization.humanAuthorization.rationale, "delivery authorization humanAuthorization.rationale", 12, 2000);
  assert(SHA256.test(authorization.humanAuthorization.evidenceSha256), "delivery authorization human evidence hash is invalid.");
  assertExactApprovalKeys(authorization.checks, CHECK_FIELDS, "delivery authorization checks");
  for (const key of CHECK_FIELDS) {
    assert(authorization.checks[key] === true, `delivery authorization check ${key} must remain true.`);
  }
  assertExactApprovalKeys(authorization.authority, AUTHORITY_FIELDS, "delivery authorization authority");
  assert(
    authorization.authority.evidenceAdmission === true &&
      authorization.authority.namedHumanDeliveryAuthorization === true,
    "delivery authorization lost its bounded evidence or human authorization authority.",
  );
  for (const key of AUTHORITY_FIELDS.slice(2)) {
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
  const validatedBuildEvidence = validateBuildEvidence(captured.atlasBuildEvidence);
  const humanAuthorization = validateHumanAuthorization(captured.humanAuthorization);
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
    "submitted delivery authorization does not match the exact game validation, atlas build evidence and human authorization inputs.",
  );
  return submitted;
}
