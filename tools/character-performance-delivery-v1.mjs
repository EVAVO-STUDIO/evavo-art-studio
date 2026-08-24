import {
  compileStudioHandoff,
  digestStudioValue,
  verifyStudioHandoff,
} from "./studio-handoff-v2.mjs";
import {
  verifyCharacterPerformanceApproval,
  verifyCharacterPerformanceBank,
  verifyCharacterPerformanceReview,
} from "./character-performance-bank-v1.mjs";

export const CHARACTER_PERFORMANCE_DELIVERY_SCHEMA =
  "evavo_character_performance_delivery_v1";

const ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SHA = /^[0-9a-f]{64}$/;

function plain(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function exact(value, label, required, optional = []) {
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new Error(`${label} is missing ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported field: ${key}`);
  }
}

function identifier(value, label) {
  if (typeof value !== "string" || value.length > 160 || !ID.test(value)) {
    throw new Error(`${label} must be a stable lowercase identifier`);
  }
  return value;
}

function instant(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw new Error(`${label} must be a canonical UTC instant`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a real canonical UTC instant`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function uniqueAssets(bank) {
  const byAsset = new Map();
  for (const slot of bank.slots) {
    if (!byAsset.has(slot.assetId)) {
      byAsset.set(slot.assetId, {
        assetId: slot.assetId,
        kind: "character-performance-drawing",
        relativePath: slot.relativePath,
        sha256: slot.sha256,
        bytes: slot.bytes,
        mediaType: slot.mediaType,
        metadata: {
          characterId: bank.characterId,
          slotIds: [],
          roles: [],
          mouthShapes: [],
          width: slot.width,
          height: slot.height,
        },
      });
    }
    const asset = byAsset.get(slot.assetId);
    asset.metadata.slotIds.push(slot.slotId);
    asset.metadata.roles.push(slot.role);
    if (slot.mouthShape) asset.metadata.mouthShapes.push(slot.mouthShape);
  }
  return [...byAsset.values()].map((asset) => ({
    ...asset,
    metadata: {
      ...asset.metadata,
      slotIds: [...new Set(asset.metadata.slotIds)].sort(),
      roles: [...new Set(asset.metadata.roles)].sort(),
      mouthShapes: [...new Set(asset.metadata.mouthShapes)].sort(),
    },
  }));
}

function handoff({
  bank,
  review,
  approval,
  producerCommit,
  createdAt,
  consumer,
  type,
  extraEvidence = [],
}) {
  return compileStudioHandoff({
    schema: "evavo_studio_handoff_request_v2",
    handoffType: type,
    productionId: bank.productionId,
    producer: { studio: "art-studio", commit: producerCommit },
    consumer: { studio: consumer },
    creativeIntentSha256: bank.creativeIntentSha256,
    continuitySha256: bank.continuitySha256,
    createdAt,
    assets: uniqueAssets(bank),
    evidence: [
      {
        evidenceId: "art-direction",
        kind: "art-direction",
        sha256: bank.artDirectionSha256,
        metadata: { characterId: bank.characterId },
      },
      {
        evidenceId: "character-bank",
        kind: "character-performance-bank",
        sha256: bank.bankSha256,
        metadata: { bankId: bank.bankId },
      },
      {
        evidenceId: "character-review",
        kind: "character-performance-review",
        sha256: review.reviewSha256,
        metadata: { reviewId: review.reviewId },
      },
      {
        evidenceId: "character-approval",
        kind: "named-character-performance-approval",
        sha256: approval.approvalSha256,
        metadata: {
          decisionId: approval.decisionId,
          actorId: approval.actorId,
        },
      },
      ...extraEvidence,
    ],
    authority: {
      candidateOnly: false,
      creativeApprovalIncluded: true,
      releaseApprovalIncluded: false,
      publicationAuthority: false,
      deploymentAuthority: false,
    },
    metadata: {
      characterId: bank.characterId,
      bankId: bank.bankId,
      slotCount: bank.slots.length,
      canvasWidth: bank.canvas.width,
      canvasHeight: bank.canvas.height,
    },
  });
}

export function compileCharacterPerformanceDelivery(input) {
  const request = plain(input, "character performance delivery request");
  exact(
    request,
    "character performance delivery request",
    ["bank", "review", "approval", "producerCommit", "createdAt"],
    ["celConsumer", "videoConsumer"],
  );
  verifyCharacterPerformanceBank(request.bank);
  verifyCharacterPerformanceReview(request.review, request.bank);
  verifyCharacterPerformanceApproval(
    request.approval,
    request.bank,
    request.review,
  );
  if (request.review.status !== "clean") {
    throw new Error("delivery requires a clean review");
  }
  if (
    typeof request.producerCommit !== "string" ||
    !/^[0-9a-f]{40}$/.test(request.producerCommit)
  ) {
    throw new Error("producerCommit must be a 40-character Git commit");
  }
  const createdAt = instant(request.createdAt, "createdAt");
  const artToCel = handoff({
    bank: request.bank,
    review: request.review,
    approval: request.approval,
    producerCommit: request.producerCommit,
    createdAt,
    consumer: request.celConsumer
      ? identifier(request.celConsumer, "celConsumer")
      : "cel-animation-studio",
    type: "art-to-cel",
  });
  const artToVideo = handoff({
    bank: request.bank,
    review: request.review,
    approval: request.approval,
    producerCommit: request.producerCommit,
    createdAt,
    consumer: request.videoConsumer
      ? identifier(request.videoConsumer, "videoConsumer")
      : "video-studio",
    type: "art-to-video",
    extraEvidence: [
      {
        evidenceId: "art-to-cel-source-handoff",
        kind: "art-to-cel-source-handoff",
        sha256: artToCel.handoffSha256,
        metadata: { handoffId: artToCel.handoffId },
      },
    ],
  });
  const body = {
    schema: CHARACTER_PERFORMANCE_DELIVERY_SCHEMA,
    bankId: request.bank.bankId,
    bankSha256: request.bank.bankSha256,
    reviewSha256: request.review.reviewSha256,
    approvalSha256: request.approval.approvalSha256,
    artToCel,
    artToVideo,
    authority: {
      creativeApprovalIncluded: true,
      releaseApprovalIncluded: false,
      publicationAuthority: false,
      deploymentAuthority: false,
    },
  };
  return deepFreeze({ ...body, deliverySha256: digestStudioValue(body) });
}

export function verifyCharacterPerformanceDelivery(input) {
  const value = plain(input, "character performance delivery");
  if (
    value.schema !== CHARACTER_PERFORMANCE_DELIVERY_SCHEMA ||
    typeof value.deliverySha256 !== "string" ||
    !SHA.test(value.deliverySha256)
  ) {
    throw new Error("character performance delivery schema or digest is invalid");
  }
  verifyStudioHandoff(value.artToCel);
  verifyStudioHandoff(value.artToVideo);
  const body = { ...value };
  delete body.deliverySha256;
  if (value.deliverySha256 !== digestStudioValue(body)) {
    throw new Error("character performance delivery digest mismatch");
  }
  if (
    value.artToCel.handoffType !== "art-to-cel" ||
    value.artToVideo.handoffType !== "art-to-video"
  ) {
    throw new Error("character performance delivery contains the wrong handoff types");
  }
  const sourceBindings = value.artToVideo.evidence.filter(
    (row) => row.kind === "art-to-cel-source-handoff",
  );
  if (
    sourceBindings.length !== 1 ||
    sourceBindings[0].sha256 !== value.artToCel.handoffSha256 ||
    sourceBindings[0].metadata?.handoffId !== value.artToCel.handoffId
  ) {
    throw new Error("Art-to-Video handoff is not bound to the exact Art-to-Cel source handoff");
  }
  if (
    value.authority.publicationAuthority ||
    value.authority.deploymentAuthority ||
    value.authority.releaseApprovalIncluded
  ) {
    throw new Error("character performance delivery crossed its authority boundary");
  }
  return value.deliverySha256;
}
