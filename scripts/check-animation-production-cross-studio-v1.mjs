#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const names = {
  art: "evavo-art-studio",
  cel: "cel-animation-studio",
  video: "evavo-video-studio",
};

function roots() {
  const current = resolve(process.cwd());
  const parent = resolve(current, "..");
  const result = {
    art: resolve(parent, names.art),
    cel: resolve(parent, names.cel),
    video: resolve(parent, names.video),
  };
  for (const [key, name] of Object.entries(names)) {
    if (basename(current).toLowerCase() === name.toLowerCase()) result[key] = current;
  }
  return result;
}

async function requireFile(path) {
  await access(path);
  return path;
}

async function importFile(path) {
  await requireFile(path);
  return import(pathToFileURL(path).href);
}

async function fileSha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function drawingEvidence(profile, drawing) {
  return {
    drawingId: drawing.id,
    attempt: 1,
    artifactId: `artifact_${drawing.ordinal.toString(16).padStart(64, "0")}`,
    contentDigest: `sha256:${drawing.ordinal.toString(16).padStart(64, "a")}`,
    width: profile.request.delivery.canvas.width,
    height: profile.request.delivery.canvas.height,
    meaningfulAlpha: true,
    unsafeEdgeContactPixels: 0,
    scores: {
      identity: 0.99,
      style: 0.99,
      silhouette: 0.99,
      camera: 0.99,
      anatomy: 0.99,
      motionReadability: 0.99,
      palette: 0.99,
    },
    findings: [],
  };
}

function sequenceEvidence() {
  return {
    normalSpeedReviewed: true,
    frameByFrameReviewed: true,
    timingReadabilityScore: 0.99,
    motionReadabilityScore: 0.99,
    styleContinuityScore: 0.99,
    cameraContinuityScore: 0.99,
    loopSeamScore: 0.99,
    affectedDrawingIds: [],
    findings: [],
  };
}

function artifacts(profile) {
  return profile.drawings.map((drawing) => ({
    drawingId: drawing.id,
    artifactId: `artifact_${(drawing.ordinal + 100).toString(16).padStart(64, "0")}`,
    contentDigest: `sha256:${(drawing.ordinal + 100).toString(16).padStart(64, "b")}`,
    mediaType: "image/png",
    byteLength: 4096 + drawing.ordinal,
    width: profile.request.delivery.canvas.width,
    height: profile.request.delivery.canvas.height,
    meaningfulAlpha: true,
  }));
}

const repo = roots();
const sharedFiles = [
  "tools/animation_sequence_delivery_v1.mjs",
  "tools/animation_sequence_delivery_guard_v1.mjs",
  "tools/animation_sequence_delivery_canonical_v1.mjs",
  "tools/animation_sequence_delivery_canonical_v1_mcp.mjs",
];

for (const relative of sharedFiles) {
  const values = await Promise.all([
    fileSha256(resolve(repo.art, relative)),
    fileSha256(resolve(repo.cel, relative)),
    fileSha256(resolve(repo.video, relative)),
  ]);
  assert.equal(new Set(values).size, 1, `Cross-studio file drift: ${relative}`);
}

const art = await importFile(resolve(repo.art, "tools/animation_production_profile_canonical_v1.mjs"));
const cel = await importFile(resolve(repo.cel, "tools/animation_production_profile_review_canonical_v1.mjs"));
const artDelivery = await importFile(resolve(repo.art, "tools/animation_sequence_delivery_canonical_v1.mjs"));
const celDelivery = await importFile(resolve(repo.cel, "tools/animation_sequence_delivery_canonical_v1.mjs"));
const videoDelivery = await importFile(resolve(repo.video, "tools/animation_sequence_delivery_canonical_v1.mjs"));

const request = JSON.parse(
  await readFile(resolve(repo.art, "examples/animation-production-profile-side-stage-v1.json"), "utf8"),
);
const profile = art.compileAnimationProductionProfile(request, new Date("2026-08-30T00:00:00.000Z"));
cel.assertAnimationProductionProfileIntegrity(profile);

const reviewInput = {
  profile,
  cycle: 1,
  drawingEvidence: profile.drawings.map((drawing) => drawingEvidence(profile, drawing)),
  sequenceEvidence: sequenceEvidence(),
};
const reviewTime = new Date("2026-08-30T01:00:00.000Z");
const artDecision = art.reviewAnimationProductionProfile(reviewInput, reviewTime);
const celDecision = cel.reviewAnimationProductionProfile(reviewInput, reviewTime);
assert.deepEqual(celDecision, artDecision, "Art and Cel canonical accepted decisions drifted");
art.assertAnimationProductionReviewIntegrity(reviewInput, artDecision);
cel.assertAnimationProductionReviewIntegrity(reviewInput, celDecision);

const artClip = art.compileAcceptedRuntimeClip(profile, artDecision);
const celClip = cel.compileAcceptedRuntimeClip(profile, celDecision);
assert.deepEqual(celClip, artClip, "Art and Cel runtime clip timing drifted");

const approvedArtifacts = artifacts(profile);
const approvalBody = {
  protocolVersion: artDelivery.DELIVERY_PROTOCOL_VERSION,
  kind: artDelivery.CREATIVE_APPROVAL_KIND,
  id: "harbour-runner:walk-right:creative-approval:r1",
  profileDigest: profile.contentDigest,
  reviewDecisionDigest: artDecision.decisionDigest,
  scope: "animation-sequence-delivery",
  approverId: "animation-director:cross-studio-fixture",
  approverRole: "animation-director",
  approvedAt: "2026-08-30T02:00:00.000Z",
  rationale: "The exact named drawings and hashes preserve the approved identity, camera, contact and sequence timing.",
  artifacts: approvedArtifacts.map(({ drawingId, artifactId, contentDigest }) => ({ drawingId, artifactId, contentDigest })),
  authority: {
    providerExecution: false,
    artifactPromotion: false,
    runtimeActivation: false,
    repositoryMutation: false,
    publication: false,
  },
};
const creativeApproval = {
  ...approvalBody,
  approvalDigest: artDelivery.animationSequenceSha256(approvalBody),
};
const deliveryInput = {
  profile,
  decision: artDecision,
  artifacts: approvedArtifacts,
  creativeApproval,
};
const deliveryTime = new Date("2026-08-30T03:00:00.000Z");
const deliveries = [
  artDelivery.compileAnimationSequenceDelivery(deliveryInput, deliveryTime),
  celDelivery.compileAnimationSequenceDelivery(deliveryInput, deliveryTime),
  videoDelivery.compileAnimationSequenceDelivery(deliveryInput, deliveryTime),
];
assert.deepEqual(deliveries[1], deliveries[0], "Cel delivery identity drifted from Art");
assert.deepEqual(deliveries[2], deliveries[0], "Video delivery identity drifted from Art");

const intakeTime = new Date("2026-08-30T04:00:00.000Z");
const intakes = [
  artDelivery.compileVideoStudioAnimationIntake(deliveries[0], intakeTime),
  celDelivery.compileVideoStudioAnimationIntake(deliveries[1], intakeTime),
  videoDelivery.compileVideoStudioAnimationIntake(deliveries[2], intakeTime),
];
assert.deepEqual(intakes[1], intakes[0], "Cel video-intake identity drifted from Art");
assert.deepEqual(intakes[2], intakes[0], "Video Studio intake identity drifted from Art");

process.stdout.write(`${JSON.stringify({
  status: "pass",
  profileDigest: profile.contentDigest,
  decisionDigest: artDecision.decisionDigest,
  runtimeClip: {
    framesPerSecond: artClip.framesPerSecond,
    frameDurations: artClip.frameDurations,
  },
  deliveryDigest: deliveries[0].contentDigest,
  videoIntakeDigest: intakes[0].contentDigest,
  sharedFileCount: sharedFiles.length,
}, null, 2)}\n`);
