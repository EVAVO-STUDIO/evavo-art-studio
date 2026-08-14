import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { deflateSync } from "node:zlib";

import {
  admitHmfAtlasV3GameValidationReceipt,
  REQUIRED_GAME_VALIDATION_SUITES,
} from "./frame-atlas-v3-game-validation-admission.mjs";
import {
  compileHmfAtlasV3GameDeliveryAuthorization,
  HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_SCHEMA,
  HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_PROTOCOL_VERSION,
  verifyHmfAtlasV3GameDeliveryAuthorization,
} from "./frame-atlas-v3-game-delivery-authorization.mjs";
import { hashValue } from "./frame-body-named-human-approval-common.mjs";

const HEAD = "319989713c671670b1ae997ffb4e8386bdeb7c7e";
const OTHER_HEAD = "723b6b6954e67c08ed337fad62c5ef2e10536234";
const FRAMES = ["bastion", "viper", "citadel", "mirage"];
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const BLOCKERS = [
  "focused-godot-atlas-v3-validation",
  "runtime-cutover-validation",
  "explicit-game-repository-delivery-authorization",
];
const fixtureCache = new Map();

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBytes.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return result;
}

function encodeRgbaPng(width, height, pixels) {
  assert.equal(pixels.length, width * height * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const target = y * (width * 4 + 1);
    raw[target] = 0;
    pixels.copy(raw, target + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function sourcePixels(frameIndex, variant = 0) {
  const pixels = Buffer.alloc(160 * 160 * 4);
  const colour = [
    [196, 48, 48],
    [60, 154, 92],
    [66, 104, 190],
    [196, 146, 42],
  ][frameIndex];
  for (let y = 30; y < 132; y += 1) {
    for (let x = 46; x < 114; x += 1) {
      const offset = (y * 160 + x) * 4;
      pixels[offset] = (colour[0] + variant * 7) & 0xff;
      pixels[offset + 1] = colour[1];
      pixels[offset + 2] = colour[2];
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function atlasPixels(source) {
  const atlas = Buffer.alloc(2560 * 2560 * 4);
  for (let slot = 0; slot < 224; slot += 1) {
    const cellX = (slot % 16) * 160;
    const cellY = Math.floor(slot / 16) * 160;
    for (let y = 0; y < 160; y += 1) {
      const sourceStart = y * 160 * 4;
      const atlasStart = ((cellY + y) * 2560 + cellX) * 4;
      source.copy(atlas, atlasStart, sourceStart, sourceStart + 160 * 4);
    }
  }
  return atlas;
}

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

function gameTarget(frameId) {
  return {
    repository: "EVAVO-STUDIO/steel-dominion",
    technicalId: "steel-dominion",
    contractId: "production_master_v3",
    imagePath: `res://assets/fighters/final-v3/${frameId}.png`,
    activationReady: false,
    activationBlockers: BLOCKERS,
  };
}

function styleProofApproval(frameId) {
  return {
    id: "style-proof-approved",
    actorClass: "human",
    actorId: "greg-parker",
    occurredAt: "2026-08-15T00:20:00.000Z",
    evidenceSha256: hashValue(`style-proof-evidence-${frameId}`),
  };
}

function productionMaster() {
  return {
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
}

function frameFixture(frameId) {
  if (fixtureCache.has(frameId)) return fixtureCache.get(frameId);
  const frameIndex = FRAMES.indexOf(frameId);
  const sourcePixelBytes = sourcePixels(frameIndex);
  const sourcePng = encodeRgbaPng(160, 160, sourcePixelBytes);
  const atlasPng = encodeRgbaPng(2560, 2560, atlasPixels(sourcePixelBytes));
  const sourceSha256 = sha256Bytes(sourcePng);
  const workspaceRoot = `/tmp/hmf-atlas-v3-${frameId}`;
  const batches = Array.from({ length: 26 }, (_, index) => ({
    batchId: `hmf-b${String(index + 1).padStart(4, "0")}`,
    workOrderBatchSha256: hashValue(`batch-${frameId}-${index}`),
    completedUnits: 0,
    unitReceiptHeads: [],
  }));
  const sources = Array.from({ length: 224 }, (_, slot) => {
    const batch = batches[slot % batches.length];
    const unitId = `hmf.frame-animation.${frameId}.slot-${String(slot).padStart(3, "0")}`;
    const headReceiptSha256 = hashValue(`receipt-head-${frameId}-${slot}`);
    batch.unitReceiptHeads.push({ unitId, headReceiptSha256 });
    batch.completedUnits += 1;
    const relative = `masters/frames/${frameId}/sprites/source-${String(slot).padStart(3, "0")}.png`;
    return {
      slot,
      row: Math.floor(slot / 16),
      column: slot % 16,
      x: (slot % 16) * 160,
      y: Math.floor(slot / 16) * 160,
      width: 160,
      height: 160,
      bankId: `bank-${String(Math.floor(slot / 16)).padStart(2, "0")}`,
      productionGroup: "frame-animation",
      unitId,
      batchId: batch.batchId,
      workOrderSha256: hashValue(`work-order-${frameId}-${slot}`),
      headReceiptSha256,
      masterRelativePath: relative,
      sourcePath: `${workspaceRoot}/${relative}`,
      sourceBytes: sourcePng.length,
      sourceSha256,
    };
  });
  const planBody = {
    schema: "evavo.heavy-metal-fighting-frame-atlas-v3-plan.v1",
    protocolVersion: "2026-08-12.1",
    projectId: "heavy-metal-fighting",
    publicTitle: "HEAVY METAL FIGHTING",
    frameId,
    compiledAt: "2026-08-15T00:21:00.000Z",
    registrySha256: hashValue(`registry-${frameId}`),
    layoutSha256: hashValue(`layout-${frameId}`),
    deliveryContractSha256: hashValue(`delivery-${frameId}`),
    styleProofExecutionSha256: hashValue(`style-proof-${frameId}`),
    styleProofApproval: styleProofApproval(frameId),
    workspaceRoot,
    allowedSourceRoot: `${workspaceRoot}/masters/frames/${frameId}/sprites`,
    productionMaster: productionMaster(),
    sources,
    reservedSlots: Array.from({ length: 32 }, (_, index) => 224 + index),
    batchEvidence: batches,
    outputs: {
      image: `${frameId}.png`,
      manifest: `${frameId}.atlas-v3.json`,
      receipt: `${frameId}.atlas-v3.receipt.json`,
      recommendedWorkspaceParent: `exports/runtime/frames/${frameId}`,
    },
    gameTarget: gameTarget(frameId),
    authority: buildAuthority(),
    createOnlyOutput: true,
    atomicWorkspacePublication: true,
  };
  const plan = { ...planBody, planSha256: hashValue(planBody) };
  const receiptBody = {
    schema: "evavo.heavy-metal-fighting-frame-atlas-v3-build-receipt.v1",
    projectId: "heavy-metal-fighting",
    frameId,
    contractId: "production_master_v3",
    planSha256: plan.planSha256,
    styleProofExecutionSha256: plan.styleProofExecutionSha256,
    styleProofApproval: plan.styleProofApproval,
    sourceCount: 224,
    reservedSlotCount: 32,
    outputs: {
      image: {
        path: `${frameId}.png`,
        sha256: sha256Bytes(atlasPng),
        bytes: atlasPng.length,
      },
      manifest: {
        path: `${frameId}.atlas-v3.json`,
        sha256: hashValue(`manifest-${frameId}`),
        bytes: 8192 + frameIndex,
      },
    },
    gameTarget: gameTarget(frameId),
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
  const receipt = { ...receiptBody, receiptSha256: hashValue(receiptBody) };
  const fixture = {
    frameId,
    plan,
    receipt,
    atlasPngBytes: atlasPng,
    sourcePngBytes: Array.from({ length: 224 }, () => sourcePng),
  };
  fixtureCache.set(frameId, fixture);
  return fixture;
}

function buildEvidence(frameId) {
  const fixture = frameFixture(frameId);
  return {
    frameId: fixture.frameId,
    plan: structuredClone(fixture.plan),
    receipt: structuredClone(fixture.receipt),
    atlasPngBytes: Buffer.from(fixture.atlasPngBytes),
    sourcePngBytes: fixture.sourcePngBytes.map((bytes) => Buffer.from(bytes)),
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

function rehashPlan(value) {
  const body = structuredClone(value);
  delete body.planSha256;
  return { ...body, planSha256: hashValue(body) };
}

test("exact four-atlas bytes and exact game validation compile one read-only named-human delivery authorization", () => {
  const source = inputs();
  const authorization = compileHmfAtlasV3GameDeliveryAuthorization(source);
  assert.equal(authorization.schema, HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_SCHEMA);
  assert.equal(
    authorization.protocolVersion,
    HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_PROTOCOL_VERSION,
  );
  assert.equal(authorization.gameHead, HEAD);
  assert.deepEqual(authorization.atlasBuilds.map((entry) => entry.frameId), FRAMES);
  assert.ok(authorization.atlasBuilds.every((entry) => /^[0-9a-f]{64}$/u.test(entry.buildVerificationSha256)));
  assert.equal(authorization.humanAuthorization.actorClass, "human");
  assert.equal(authorization.authority.callerSuppliedAtlasByteRead, true);
  assert.equal(authorization.authority.callerSuppliedSourceByteRead, true);
  assert.equal(authorization.authority.imageInspection, true);
  assert.equal(authorization.authority.gameRepositoryMutation, false);
  assert.equal(authorization.authority.runtimeActivation, false);
  assert.deepEqual(
    verifyHmfAtlasV3GameDeliveryAuthorization({ ...source, authorization }),
    authorization,
  );
});

test("all four canonical Frames must be present once and in canonical order", () => {
  const missing = inputs();
  missing.atlasBuildEvidence.pop();
  assert.throws(() => compileHmfAtlasV3GameDeliveryAuthorization(missing), /exactly four Frame entries/);

  const reordered = inputs();
  [reordered.atlasBuildEvidence[0], reordered.atlasBuildEvidence[1]] = [
    reordered.atlasBuildEvidence[1],
    reordered.atlasBuildEvidence[0],
  ];
  assert.throws(() => compileHmfAtlasV3GameDeliveryAuthorization(reordered), /must be bastion/);
});

test("a caller-provided verification summary is rejected rather than trusted", () => {
  const source = inputs();
  source.atlasBuildEvidence[0].verification = {
    schema: "evavo.heavy-metal-fighting-frame-atlas-v3-build-verification.v1",
    status: "passed",
    exactSourcePixelsVerified: true,
  };
  assert.throws(() => compileHmfAtlasV3GameDeliveryAuthorization(source), /fields must be exactly/);
});

test("attacker-rehashed source metadata cannot hide source pixels that differ from the atlas", () => {
  const source = inputs();
  const alteredSource = encodeRgbaPng(160, 160, sourcePixels(0, 1));
  const evidence = source.atlasBuildEvidence[0];
  evidence.sourcePngBytes[0] = alteredSource;
  evidence.plan.sources[0].sourceBytes = alteredSource.length;
  evidence.plan.sources[0].sourceSha256 = sha256Bytes(alteredSource);
  evidence.plan = rehashPlan(evidence.plan);
  evidence.receipt.planSha256 = evidence.plan.planSha256;
  evidence.receipt = rehashReceipt(evidence.receipt);
  assert.throws(
    () => compileHmfAtlasV3GameDeliveryAuthorization(source),
    /cell 0 differs from the exact admitted source pixels/,
  );
});

test("attacker-rehashed image metadata cannot admit changed atlas bytes", () => {
  const source = inputs();
  const evidence = source.atlasBuildEvidence[0];
  const changed = Buffer.from(evidence.atlasPngBytes);
  changed[changed.length - 20] ^= 1;
  evidence.atlasPngBytes = changed;
  evidence.receipt.outputs.image.bytes = changed.length;
  evidence.receipt.outputs.image.sha256 = sha256Bytes(changed);
  evidence.receipt = rehashReceipt(evidence.receipt);
  assert.throws(
    () => compileHmfAtlasV3GameDeliveryAuthorization(source),
    /CRC validation|cannot be inflated|differs from the exact admitted source pixels/,
  );
});

test("correctly rehashed build receipts cannot escalate target-repository or activation authority", () => {
  const source = inputs();
  const altered = structuredClone(source.atlasBuildEvidence[0].receipt);
  altered.authority.targetRepositoryMutation = true;
  altered.targetRepositoryMutation = true;
  source.atlasBuildEvidence[0].receipt = rehashReceipt(altered);
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
  assert.throws(() => compileHmfAtlasV3GameDeliveryAuthorization(rejected), /decision must be authorized/);

  const incomplete = inputs();
  incomplete.humanAuthorization.attestations.runtimeActivationRemainsSeparate = true;
  assert.throws(() => compileHmfAtlasV3GameDeliveryAuthorization(incomplete), /fields must be exactly/);
});

test("delivery authorization cannot predate the evidence it claims to review", () => {
  const source = inputs();
  source.humanAuthorization.occurredAt = "2026-08-15T00:10:00.000Z";
  assert.throws(
    () => compileHmfAtlasV3GameDeliveryAuthorization(source),
    /must be at or after the reviewed game-validation and style-proof evidence/,
  );
});

test("compiler input rejects accessors, proxies and shared byte memory without invoking getters", () => {
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
  assert.throws(() => compileHmfAtlasV3GameDeliveryAuthorization(accessor), /may not be an accessor/);
  assert.equal(invoked, false);
  assert.throws(
    () => compileHmfAtlasV3GameDeliveryAuthorization(new Proxy(source, {})),
    /may not be a Proxy/,
  );

  const sourceAccessor = inputs();
  let sourceInvoked = false;
  Object.defineProperty(sourceAccessor.atlasBuildEvidence[0].sourcePngBytes, "0", {
    enumerable: true,
    configurable: true,
    get() {
      sourceInvoked = true;
      return frameFixture("bastion").sourcePngBytes[0];
    },
  });
  assert.throws(
    () => compileHmfAtlasV3GameDeliveryAuthorization(sourceAccessor),
    /sourcePngBytes\[0\] may not be an accessor/,
  );
  assert.equal(sourceInvoked, false);

  if (typeof SharedArrayBuffer !== "undefined") {
    const shared = inputs();
    shared.atlasBuildEvidence[0].atlasPngBytes = new Uint8Array(new SharedArrayBuffer(64));
    assert.throws(
      () => compileHmfAtlasV3GameDeliveryAuthorization(shared),
      /may not use shared memory/,
    );
  }
});

test("submitted authorization cannot gain runtime activation even when rehashed", () => {
  const source = inputs();
  const authorization = compileHmfAtlasV3GameDeliveryAuthorization(source);
  const altered = structuredClone(authorization);
  altered.authority.runtimeActivation = true;
  assert.throws(
    () => verifyHmfAtlasV3GameDeliveryAuthorization({
      ...source,
      authorization: rehashAuthorization(altered),
    }),
    /gained forbidden authority: runtimeActivation/,
  );
});

test("a correctly rehashed authorization cannot be replayed with altered human evidence", () => {
  const source = inputs();
  const authorization = compileHmfAtlasV3GameDeliveryAuthorization(source);
  const altered = structuredClone(authorization);
  altered.humanAuthorization.actorId = "other-reviewer";
  assert.throws(
    () => verifyHmfAtlasV3GameDeliveryAuthorization({
      ...source,
      authorization: rehashAuthorization(altered),
    }),
    /does not match the exact game validation, atlas build bytes and human authorization inputs/,
  );
});
