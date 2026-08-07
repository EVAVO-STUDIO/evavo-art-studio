import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import { SPRITE_FAMILY_PROTOCOL_VERSION } from "@evavo/art-sprite-family";
import sharp from "sharp";

import {
  TargetedRepairError,
  planTargetedRepair,
  targetedRepairProtocolSummary,
  validateTargetedRepairRequest,
} from "../dist/index.js";

async function rgba(width, height, colour, alpha = 255) {
  const data = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    data[offset] = colour[0];
    data[offset + 1] = colour[1];
    data[offset + 2] = colour[2];
    data[offset + 3] = alpha;
  }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

async function mask(width, height) {
  const data = Buffer.alloc(width * height * 4, 255);
  for (let y = 4; y < Math.min(height, 12); y += 1) {
    for (let x = 4; x < Math.min(width, 12); x += 1) {
      data[(y * width + x) * 4 + 3] = 0;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

const passGate = (id) => ({
  id,
  status: "pass",
  blocking: true,
  message: `${id} passed`,
  evidence: {},
});
const failGate = (id) => ({
  id,
  status: "fail",
  blocking: true,
  message: `${id} failed`,
  evidence: { measured: 0.2, required: 0.8 },
});

async function fixture({ shared = false, failure = "canonical-palette-similarity" } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-targeted-repair-"));
  const store = new LocalArtifactStore({ root });
  const putImage = (fileName, bytes, role, extra = {}) =>
    store.put(bytes, {
      mediaType: "image/png",
      storageClass: "source",
      fileName,
      labels: {
        artifactRole: role,
        qualityState: "passed",
        approvalState: "approved",
        ...extra,
      },
    });
  const body = await putImage(
    "body.png",
    await rgba(16, 16, [210, 40, 52]),
    "identity-core-layer",
  );
  const otherBody = shared
    ? body
    : await putImage(
        "body-2.png",
        await rgba(16, 16, [205, 42, 54]),
        "identity-core-layer",
      );
  const shadow = await putImage(
    "shadow.png",
    await rgba(16, 16, [20, 20, 20], 180),
    "shadow-layer",
  );
  const canonical = await putImage(
    "canonical.png",
    await rgba(16, 16, [210, 40, 52]),
    "canonical-identity",
  );
  const compositeA = await putImage(
    "composite-a.png",
    await rgba(16, 16, [210, 40, 52]),
    "layered-frame-composite",
    { approvalState: "unapproved" },
  );
  const compositeB = await putImage(
    "composite-b.png",
    await rgba(16, 16, [205, 42, 54]),
    "layered-frame-composite",
    { approvalState: "unapproved" },
  );
  const repairMask = await putImage(
    "repair-mask.png",
    await mask(16, 16),
    "repair-mask",
  );

  const layerEvidence = (artifact, gates = [passGate("layer-registration")]) => ({
    layerId: "body",
    role: "identity-core",
    artifactId: artifact.artifactId,
    descriptorSha256: artifact.descriptorSha256,
    contentSha256: artifact.contentSha256,
    width: 16,
    height: 16,
    offset: { x: 0, y: 0 },
    opacity: 1,
    visiblePixels: 256,
    visibleFraction: 1,
    compositeContributionPixels: 256,
    compositeContributionFraction: 1,
    occludedPixels: 0,
    occludedFraction: 0,
    centroid: { x: 7.5, y: 7.5 },
    centroidRelativeToPivot: { x: -0.5, y: -7.5 },
    gates,
  });
  const shadowEvidence = {
    ...layerEvidence(shadow),
    layerId: "shadow",
    role: "shadow",
  };
  const comparison = (targetFrameId, referenceFrameId, gates) => ({
    targetFrameId,
    relation: "canonical",
    referenceFrameId,
    offsetX: 0,
    offsetY: 0,
    visibleAreaSimilarity: 1,
    paletteSimilarity: gates.some((gate) => gate.status === "fail") ? 0.2 : 1,
    centroidSimilarity: 1,
    silhouetteIou: 1,
    edgeSimilarity: 1,
    gates,
  });
  const frame = (id, index, bodyArtifact, composite, failed) => ({
    frameId: id,
    animation: "idle",
    direction: "down",
    frameIndex: index,
    globalFrameIndex: index,
    pivot: { x: 8, y: 15 },
    baseline: 15,
    groundContact: true,
    generatedCompositeArtifactId: composite.artifactId,
    generatedCompositeSha256: composite.contentSha256,
    identityCompositeSha256: composite.contentSha256,
    layers: [
      layerEvidence(
        bodyArtifact,
        failure === "layer-registration" && failed
          ? [failGate("layer-registration")]
          : [passGate("layer-registration")],
      ),
      shadowEvidence,
    ],
    parity: {
      declaredCompositeArtifactId: composite.artifactId,
      generatedSha256: composite.contentSha256,
      declaredSha256: composite.contentSha256,
      exact: true,
      comparedChannels: 1024,
      mismatchedChannels: 0,
      mismatchFraction: 0,
      meanAbsoluteError: 0,
      maximumAbsoluteError: 0,
    },
    comparisons: [
      comparison(
        id,
        "idle-000",
        failed && failure !== "layer-registration"
          ? [failGate(failure)]
          : [passGate("canonical-palette-similarity")],
      ),
    ],
    gates:
      failed && failure === "frame-pivot"
        ? [failGate("frame-pivot")]
        : [passGate("frame-pivot")],
    passed: !failed,
  });
  const evidence = {
    schemaVersion: "1.0",
    protocolVersion: SPRITE_FAMILY_PROTOCOL_VERSION,
    familyId: "hero-idle-down",
    manifestSha256: "a".repeat(64),
    passed: false,
    completedAt: "2026-07-30T00:00:00.000Z",
    canvas: { width: 16, height: 16 },
    layerDefinitions: [
      {
        id: "body",
        role: "identity-core",
        sourcePolicy: shared ? "static-family" : "per-frame",
        required: true,
        contributesToComposite: true,
        contributesToIdentity: true,
        mustRemainSeparate: false,
        zIndex: 0,
        blendMode: "normal",
        minimumVisibleFraction: 0.5,
        registrationTolerancePixels: 2,
        allowedOccludedBy: [],
        occludes: ["shadow"],
      },
      {
        id: "shadow",
        role: "shadow",
        sourcePolicy: "static-family",
        required: true,
        contributesToComposite: true,
        contributesToIdentity: false,
        mustRemainSeparate: true,
        zIndex: -10,
        blendMode: "multiply",
        minimumVisibleFraction: 0.1,
        registrationTolerancePixels: 0,
        allowedOccludedBy: ["body"],
        occludes: [],
      },
    ],
    frameEvidence: [
      frame("idle-000", 0, body, compositeA, true),
      frame("idle-001", 1, otherBody, compositeB, false),
    ],
    familyGates: [failGate("family-all-frames-pass")],
    generatedCompositeArtifactIds: [
      compositeA.artifactId,
      compositeB.artifactId,
    ],
    sourceArtifactIds: [
      body.artifactId,
      otherBody.artifactId,
      shadow.artifactId,
      compositeA.artifactId,
      compositeB.artifactId,
    ],
  };
  const evidenceArtifact = await store.put(
    `${JSON.stringify(evidence, null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: "hero-idle-down.sprite-family.evidence.json",
      sourceArtifacts: evidence.sourceArtifactIds,
      labels: {
        artifactRole: "sprite-family-consistency-evidence",
        familyId: evidence.familyId,
        qualityState: "rejected",
        approvalState: "evidence-only",
      },
    },
  );
  return {
    store,
    evidence,
    evidenceArtifact,
    body,
    otherBody,
    shadow,
    canonical,
    repairMask,
  };
}

function request(fixture, overrides = {}) {
  return {
    schemaVersion: "1.0",
    repairId: "hero-idle-down-body-repair",
    familyEvidenceArtifactId: fixture.evidenceArtifact.artifactId,
    target: { frameId: "idle-000", layerId: "body" },
    intent: "Restore the approved hero body and coat while retaining the pose.",
    preserve: ["shadow", "canvas", "pivot", "all pixels outside the mask"],
    maskArtifactId: fixture.repairMask.artifactId,
    references: [
      {
        artifactId: fixture.canonical.artifactId,
        role: "canonical-identity",
      },
    ],
    style: {
      styleName: "Authentic 1990s adventure sprite",
      intent: "Preserve the approved hand-authored pixel language.",
      mustHave: ["same identity", "same coat", "same pixel clusters"],
      mustAvoid: ["generic AI rendering", "modern gloss"],
      identityLocks: ["same face", "same proportions", "same handedness"],
      palette: ["locked project palette"],
      lineTreatment: ["one-pixel contour hierarchy"],
      cameraRules: ["fixed side-stage projection"],
    },
    shot: {
      subject: "The approved hero body layer only.",
      action: "Repair the failed body pixels without changing the pose.",
      direction: "Down-facing three-quarter view.",
      include: ["complete body layer"],
      exclude: ["shadow", "weapon", "effects", "background"],
      separateAssets: ["shadow", "weapon", "effects"],
      framing: ["retain the exact 16 by 16 source canvas"],
    },
    provider: {
      enabled: true,
      backgroundStrategy: "chroma-key",
      matteColour: "#ff00ff",
      candidateCount: 2,
      preferredAdapterId: "openai-gpt-image-2",
      allowedAdapterIds: ["openai-gpt-image-2"],
      allowFallback: false,
    },
    ...overrides,
  };
}

test("protocol and validation keep repair scope bounded", () => {
  const protocol = targetedRepairProtocolSummary();
  assert.ok(protocol.rules.some((rule) => rule.includes("one frame layer")));
  assert.throws(
    () =>
      validateTargetedRepairRequest({
        schemaVersion: "1.0",
        repairId: "invalid",
        familyEvidenceArtifactId: "bad",
        target: { frameId: "frame" },
        intent: "repair",
      }),
    (error) =>
      error instanceof TargetedRepairError &&
      error.code === "TARGETED_REPAIR_REQUEST_INVALID",
  );
});

test("masked pixel repair compiles one provider inpaint and protects sibling layers", async () => {
  const data = await fixture();
  const result = await planTargetedRepair(request(data), {
    artifacts: data.store,
    now: () => new Date("2026-07-30T00:00:00.000Z"),
  });
  assert.equal(result.packet.disposition, "ready");
  assert.deepEqual(result.packet.impactedFrameIds, ["idle-000"]);
  assert.equal(result.packet.providerPlan.request.operation, "inpaint");
  assert.equal(result.packet.providerPlan.request.assetKind, "sprite-layer");
  assert.equal(result.packet.providerPlan.request.layerId, "body");
  assert.ok(result.packet.mutableArtifactIds.includes(data.body.artifactId));
  assert.ok(result.packet.protectedArtifactIds.includes(data.shadow.artifactId));
  assert.deepEqual(result.packet.providerPlan.runtimeJob.requiredCapabilities, [
    "provider.inpaint",
    "provider.reference-lock",
    "provider.candidate-store",
    "quality.inpaint-mask",
    "evidence.bundle",
  ]);
  assert.deepEqual(
    result.packet.providerPlan.runtimeJob.requiredCapabilityProfile,
    [
      "cancellation",
      "candidate-count",
      "custom-size",
      "identity-reference",
      "inpaint",
      "mask",
      "multiple-reference-images",
      "reference-images",
    ],
  );
  const stored = await data.store.get(result.packetArtifactId);
  assert.equal(stored.labels.artifactRole, "targeted-repair-packet");
  assert.equal(stored.labels.repairDisposition, "ready");
});

test("shared immutable layers expand impact and require explicit authorization", async () => {
  const data = await fixture({ shared: true });
  const blocked = await planTargetedRepair(request(data), {
    artifacts: data.store,
  });
  assert.equal(blocked.packet.disposition, "blocked");
  assert.deepEqual(blocked.packet.impactedFrameIds, ["idle-000", "idle-001"]);
  assert.ok(blocked.packet.blockers.includes("shared-layer-repair-not-authorized"));

  const authorized = await planTargetedRepair(
    request(data, {
      repairId: "shared-body-repair",
      policy: { allowSharedLayerRepair: true, maximumImpactedFrames: 2 },
    }),
    { artifacts: data.store },
  );
  assert.equal(authorized.packet.disposition, "ready");
  assert.deepEqual(authorized.packet.impactedFrameIds, ["idle-000", "idle-001"]);
});

test("metadata failures produce pixel-free correction steps", async () => {
  const data = await fixture({ failure: "frame-pivot" });
  const result = await planTargetedRepair(
    request(data, {
      repairId: "pivot-repair",
      target: { frameId: "idle-000", gateIds: ["frame-pivot"] },
      maskArtifactId: undefined,
      references: [],
      style: undefined,
      shot: undefined,
      provider: { enabled: false },
    }),
    { artifacts: data.store },
  );
  assert.equal(result.packet.disposition, "ready");
  assert.deepEqual(
    result.packet.steps.map((step) => step.strategy),
    ["metadata-adjustment"],
  );
  assert.equal(result.packet.providerPlan, undefined);
});

test("mismatched masks fail before a provider job is compiled", async () => {
  const data = await fixture();
  const wrongMask = await data.store.put(await mask(8, 8), {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "wrong-mask.png",
    labels: {
      artifactRole: "repair-mask",
      qualityState: "passed",
      approvalState: "approved",
    },
  });
  await assert.rejects(
    () =>
      planTargetedRepair(
        request(data, {
          repairId: "wrong-mask-repair",
          maskArtifactId: wrongMask.artifactId,
        }),
        { artifacts: data.store },
      ),
    (error) =>
      error &&
      typeof error === "object" &&
      error.code === "INPAINT_MASK_DIMENSIONS_MISMATCH",
  );
});

test("repair planning rejects targets with no blocking failed evidence", async () => {
  const data = await fixture();
  data.evidence.frameEvidence[0].comparisons[0].gates = [
    passGate("canonical-palette-similarity"),
  ];
  data.evidence.frameEvidence[0].passed = true;
  const replacementEvidence = await data.store.put(
    `${JSON.stringify(data.evidence)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: "passing-evidence.json",
      sourceArtifacts: data.evidence.sourceArtifactIds,
      labels: {
        artifactRole: "sprite-family-consistency-evidence",
        qualityState: "rejected",
        approvalState: "evidence-only",
      },
    },
  );
  await assert.rejects(
    () =>
      planTargetedRepair(
        request(data, {
          repairId: "no-failure-repair",
          familyEvidenceArtifactId: replacementEvidence.artifactId,
        }),
        { artifacts: data.store },
      ),
    (error) =>
      error instanceof TargetedRepairError &&
      error.code === "TARGETED_REPAIR_NO_BLOCKING_FAILURE",
  );
});
