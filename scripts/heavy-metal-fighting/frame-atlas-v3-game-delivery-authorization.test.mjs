import assert from "node:assert/strict";
import test from "node:test";

import {
  admitHmfAtlasV3GameValidationReceipt,
  REQUIRED_GAME_VALIDATION_SUITES,
} from "./frame-atlas-v3-game-validation-admission.mjs";
import {
  compileHmfAtlasV3GameDeliveryAuthorization,
  HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_SCHEMA,
  verifyHmfAtlasV3GameDeliveryAuthorization,
} from "./frame-atlas-v3-game-delivery-authorization.mjs";
import { hashValue } from "./frame-body-named-human-approval-common.mjs";

const HEAD = "319989713c671670b1ae997ffb4e8386bdeb7c7e";
const OTHER_HEAD = "723b6b6954e67c08ed337fad62c5ef2e10536234";
const FRAMES = ["bastion", "viper", "citadel", "mirage"];
const BLOCKERS = [
  "focused-godot-atlas-v3-validation",
  "runtime-cutover-validation",
  "explicit-game-repository-delivery-authorization",
];

function timestamp(second) {
  return `2026-08-15T00:00:${String(second).padStart(2, "0")}.0000000Z`;
}

function gameValidationReceipt(head = HEAD) {
  return {
    schema: "steel-dominion.hmf-atlas-v3-local-validation.v1",
    status: "passed",
    repository: "EVAVO-STUDIO/steel-dominion",
    public_title: "HEAVY METAL FIGHTING",
    branch: "codex/hmf-atlas-v3-runtime-cutover-20260812",
    head,
    godot_exe: "C:\\Godot_v4.6.2-stable_win64\\Godot_v4.6.2-stable_win64.exe",
    godot_version: "4.6.2.stable.official.abcdef",
    started_at_utc: timestamp(0),
    completed_at_utc: timestamp(12),
    duration_seconds: 12,
    suite_count: 6,
    completed_suite_count: 6,
    suites: REQUIRED_GAME_VALIDATION_SUITES.map((suite, index) => ({
      id: suite.id,
      runner: suite.runner,
      status: "passed",
      started_at_utc: timestamp(index * 2),
      completed_at_utc: timestamp(index * 2 + 1),
      duration_seconds: 1,
      error: null,
    })),
    source_tree_clean_before: true,
    source_tree_clean_after: true,
    github_actions_required: false,
    image_generation: false,
    error: null,
  };
}

function gameValidationBytes(head = HEAD) {
  return Buffer.from(`${JSON.stringify(gameValidationReceipt(head), null, 2)}\r\n`, "utf8");
}

function buildAuthority() {
  return {
    sourceRead: true,
    workspaceExportWrite: true,
    sourceMutation: false,
    candidateApproval: false,
    candidatePromotion: false,
    targetRepositoryMutation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    forcePush: false,
    namedHumanApprovalRequired: true,
  };
}

function buildReceipt(frameId) {
  const imageSha256 = hashValue(`image-${frameId}`);
  const manifestSha256 = hashValue(`manifest-${frameId}`);
  const body = {
    schema: "evavo.heavy-metal-fighting-frame-atlas-v3-build-receipt.v1",
    projectId: "heavy-metal-fighting",
    frameId,
    contractId: "production_master_v3",
    planSha256: hashValue(`plan-${frameId}`),
    styleProofExecutionSha256: hashValue(`style-proof-${frameId}`),
    styleProofApproval: {
      id: "style-proof-approved",
      actorClass: "human",
      actorId: "greg-parker",
      occurredAt: "2026-08-15T00:20:00.000Z",
      evidenceSha256: hashValue(`style-proof-evidence-${frameId}`),
    },
    sourceCount: 224,
    reservedSlotCount: 32,
    outputs: {
      image: {
        path: `${frameId}.png`,
        sha256: imageSha256,
        bytes: 4096 + FRAMES.indexOf(frameId),
      },
      manifest: {
        path: `${frameId}.atlas-v3.json`,
        sha256: manifestSha256,
        bytes: 8192 + FRAMES.indexOf(frameId),
      },
    },
    gameTarget: {
      repository: "EVAVO-STUDIO/steel-dominion",
      technicalId: "steel-dominion",
      contractId: "production_master_v3",
      imagePath: `res://assets/fighters/final-v3/${frameId}.png`,
      activationReady: false,
      activationBlockers: BLOCKERS,
    },
    gameActivationReady: false,
    gameActivationBlockers: BLOCKERS,
    authority: buildAuthority(),
    createOnlyOutput: true,
    atomicWorkspacePublication: true,
    sourceMutation: false,
    targetRepositoryMutation: false,
    gitMutation: false,
    publication: false,
  };
  return { ...body, receiptSha256: hashValue(body) };
}

function buildEvidence(frameId) {
  const receipt = buildReceipt(frameId);
  return {
    frameId,
    receipt,
    verification: {
      schema: "evavo.heavy-metal-fighting-frame-atlas-v3-build-verification.v1",
      status: "passed",
      frameId,
      planSha256: receipt.planSha256,
      receiptSha256: receipt.receiptSha256,
      imageSha256: receipt.outputs.image.sha256,
      exactSourcePixelsVerified: true,
      targetRepositoryMutation: false,
      gameActivationReady: false,
    },
  };
}

function humanAuthorization() {
  return {
    actorId: "greg-parker",
    occurredAt: "2026-08-15T00:30:00.000Z",
    decision: "authorized",
    rationale: "Authorize exact reviewed Frame atlas-v3 delivery evidence for the validated game commit only.",
    evidenceSha256: hashValue("human-delivery-authorization-evidence"),
    attestations: {
      exactGameValidationAdmissionReviewed: true,
      allFourAtlasBuildVerificationsReviewed: true,
      exactBuildReceiptLineageAccepted: true,
      canonicalTargetPathsAccepted: true,
      deliveryAuthorizationOnly: true,
      noRepositoryMutationOrRuntimeActivationPerformed: true,
    },
  };
}

function inputs(head = HEAD) {
  const receiptBytes = gameValidationBytes(head);
  const gameValidationAdmission = admitHmfAtlasV3GameValidationReceipt({
    receiptBytes,
    expectedGameHead: head,
  });
  return {
    gameValidationAdmission,
    gameValidationReceiptBytes: receiptBytes,
    expectedGameHead: head,
    atlasBuildEvidence: FRAMES.map(buildEvidence),
    humanAuthorization: humanAuthorization(),
  };
}

function rehashAuthorization(value) {
  const body = structuredClone(value);
  delete body.authorizationSha256;
  return { ...body, authorizationSha256: hashValue(body) };
}

function rehashReceipt(value) {
  const body = structuredClone(value);
  delete body.receiptSha256;
  return { ...body, receiptSha256: hashValue(body) };
}

test("exact four-atlas evidence and exact game validation compile one read-only named-human delivery authorization", () => {
  const source = inputs();
  const authorization = compileHmfAtlasV3GameDeliveryAuthorization(source);
  assert.equal(authorization.schema, HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_SCHEMA);
  assert.equal(authorization.gameHead, HEAD);
  assert.deepEqual(authorization.atlasBuilds.map((entry) => entry.frameId), FRAMES);
  assert.ok(authorization.atlasBuilds.every((entry) => /^[0-9a-f]{64}$/u.test(entry.buildVerificationSha256)));
  assert.equal(authorization.humanAuthorization.actorClass, "human");
  assert.equal(authorization.authority.evidenceAdmission, true);
  assert.equal(authorization.authority.namedHumanDeliveryAuthorization, true);
  assert.equal(authorization.authority.gameRepositoryMutation, false);
  assert.equal(authorization.authority.runtimeActivation, false);
  assert.equal(authorization.authority.gitMutation, false);
  assert.equal(authorization.authority.publication, false);
  assert.deepEqual(
    verifyHmfAtlasV3GameDeliveryAuthorization({ ...source, authorization }),
    authorization,
  );
});

test("all four canonical Frames must be present once and in canonical order", () => {
  const missing = inputs();
  missing.atlasBuildEvidence.pop();
  assert.throws(
    () => compileHmfAtlasV3GameDeliveryAuthorization(missing),
    /exactly four Frame entries/,
  );

  const reordered = inputs();
  [reordered.atlasBuildEvidence[0], reordered.atlasBuildEvidence[1]] = [
    reordered.atlasBuildEvidence[1],
    reordered.atlasBuildEvidence[0],
  ];
  assert.throws(
    () => compileHmfAtlasV3GameDeliveryAuthorization(reordered),
    /must be bastion/,
  );
});

test("build verification must cross-bind the exact receipt, plan and image hashes", () => {
  const source = inputs();
  source.atlasBuildEvidence[2].verification.imageSha256 = hashValue("wrong-image");
  assert.throws(
    () => compileHmfAtlasV3GameDeliveryAuthorization(source),
    /image hash disagrees/,
  );

  const pixelClaim = inputs();
  pixelClaim.atlasBuildEvidence[1].verification.exactSourcePixelsVerified = false;
  assert.throws(
    () => compileHmfAtlasV3GameDeliveryAuthorization(pixelClaim),
    /must prove exact source pixels/,
  );
});

test("correctly rehashed build receipts cannot escalate target-repository or activation authority", () => {
  const source = inputs();
  const altered = structuredClone(source.atlasBuildEvidence[0].receipt);
  altered.authority.targetRepositoryMutation = true;
  altered.targetRepositoryMutation = true;
  source.atlasBuildEvidence[0].receipt = rehashReceipt(altered);
  source.atlasBuildEvidence[0].verification.receiptSha256 = source.atlasBuildEvidence[0].receipt.receiptSha256;
  assert.throws(
    () => compileHmfAtlasV3GameDeliveryAuthorization(source),
    /gained forbidden authority|must remain false/,
  );
});

test("game validation admission must still recompile from the exact raw receipt and expected game head", () => {
  const source = inputs();
  source.expectedGameHead = OTHER_HEAD;
  assert.throws(
    () => compileHmfAtlasV3GameDeliveryAuthorization(source),
    /expected game head|head does not match expectedGameHead|game validation admission/,
  );
});

test("delivery authorization requires an explicit named-human authorized decision and all attestations", () => {
  const rejected = inputs();
  rejected.humanAuthorization.decision = "rejected";
  assert.throws(
    () => compileHmfAtlasV3GameDeliveryAuthorization(rejected),
    /decision must be authorized/,
  );

  const incomplete = inputs();
  incomplete.humanAuthorization.attestations.runtimeActivationRemainsSeparate = true;
  assert.throws(
    () => compileHmfAtlasV3GameDeliveryAuthorization(incomplete),
    /fields must be exactly/,
  );
});

test("compiler input rejects accessors and proxies without invoking caller-controlled getters", () => {
  const source = inputs();
  let invoked = false;
  const accessor = {
    gameValidationAdmission: source.gameValidationAdmission,
    gameValidationReceiptBytes: source.gameValidationReceiptBytes,
    expectedGameHead: source.expectedGameHead,
    atlasBuildEvidence: source.atlasBuildEvidence,
  };
  Object.defineProperty(accessor, "humanAuthorization", {
    enumerable: true,
    get() {
      invoked = true;
      return source.humanAuthorization;
    },
  });
  assert.throws(
    () => compileHmfAtlasV3GameDeliveryAuthorization(accessor),
    /may not be an accessor/,
  );
  assert.equal(invoked, false);

  const proxy = new Proxy(source, {});
  assert.throws(
    () => compileHmfAtlasV3GameDeliveryAuthorization(proxy),
    /may not be a Proxy/,
  );
});

test("submitted authorization cannot gain runtime activation even when the attacker recomputes its self-hash", () => {
  const source = inputs();
  const authorization = compileHmfAtlasV3GameDeliveryAuthorization(source);
  const altered = structuredClone(authorization);
  altered.authority.runtimeActivation = true;
  const rehashed = rehashAuthorization(altered);
  assert.throws(
    () => verifyHmfAtlasV3GameDeliveryAuthorization({ ...source, authorization: rehashed }),
    /gained forbidden authority: runtimeActivation/,
  );
});

test("a correctly rehashed authorization cannot be replayed with altered human evidence", () => {
  const source = inputs();
  const authorization = compileHmfAtlasV3GameDeliveryAuthorization(source);
  const altered = structuredClone(authorization);
  altered.humanAuthorization.actorId = "other-reviewer";
  const rehashed = rehashAuthorization(altered);
  assert.throws(
    () => verifyHmfAtlasV3GameDeliveryAuthorization({ ...source, authorization: rehashed }),
    /does not match the exact game validation, atlas build evidence and human authorization inputs/,
  );
});
