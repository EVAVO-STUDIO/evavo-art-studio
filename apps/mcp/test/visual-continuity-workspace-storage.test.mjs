import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  compileNextVisualContinuityWorkPacket,
  compileVisualContinuityBible,
  compileVisualContinuitySession,
  evaluateVisualContinuityWorkPacket,
} from "@evavo/art-direction";

import {
  loadVisualContinuityArtifact,
  loadVisualContinuityWorkspace,
  persistVisualContinuityBible,
  persistVisualContinuitySession,
} from "../dist/visual-continuity-workspace-store.js";

const digest = (character) => character.repeat(64);

function bibleInput() {
  return {
    schemaVersion: "1.0",
    kind: "evavo.visual-continuity.bible",
    bibleId: "storage-bible",
    revision: "1.0.0",
    project: {
      projectId: "storage-project",
      title: "Storage Project",
      description: "Durable continuity workspace integration fixture.",
      targetPlatforms: ["web"],
      targetStudios: ["art-studio", "web-runtime"],
    },
    scope: {
      assetTypes: ["icon"],
      preserveCrossStudioContinuity: true,
      supportLongRunningSessions: true,
      noHiddenChatState: true,
    },
    style: {
      title: "Storage fixture style",
      intent: "One exact icon family with no generative drift.",
      authoredEra: "1871",
      renderingLanguage: ["engraved monochrome raster"],
      lineLanguage: ["controlled one-pixel clusters"],
      valueStructure: ["ink black and paper white"],
      materialLanguage: ["construction-led marks"],
      lightingLanguage: ["flat authored values"],
      compositionLanguage: ["one centered subject"],
      distinctiveMotifs: [
        "brass ring",
        "salt-cut edge",
        "single rope-knot notch",
      ],
      prohibitedGenericTraits: [
        "soft glow",
        "random filigree",
        "stock mobile-app glyph",
      ],
      prohibitedModernTraits: ["glassmorphism"],
    },
    colourTokens: [
      {
        id: "ink-black",
        hex: "#000000",
        role: "primary ink",
        usage: ["linework", "silhouette"],
        toleranceDeltaE: 1,
      },
    ],
    references: [
      {
        id: "icon-master",
        role: "style-master",
        uri: "file:///refs/icon-master.png",
        sha256: digest("a"),
        rights: "owner supplied",
        note: "Canonical icon construction.",
      },
    ],
    locks: [
      {
        id: "icon-lock",
        kind: "palette",
        description: "Keep exact icon construction.",
        severity: "blocking",
        appliesToAssetTypes: ["icon"],
        referenceIds: ["icon-master"],
        mustNotVary: ["palette", "silhouette", "line density"],
      },
    ],
    entities: [],
    locations: [],
    mapSymbols: [],
    mapProfiles: [],
    shotTemplates: [
      {
        id: "icon-shot",
        title: "Icon master",
        assetTypes: ["icon"],
        aspectRatio: "1:1",
        camera: {
          projection: "screen-space",
          lensOrScale: "fixed master scale",
          height: "centered",
          angle: "front",
          movement: "locked",
        },
        compositionRules: ["one centered subject"],
        lightingRules: ["no glow"],
        safeAreaRules: ["retain eight-pixel clear edge"],
        referenceIds: ["icon-master"],
        lockIds: ["icon-lock"],
      },
    ],
    quality: {
      minimumMetricScores: {
        palette: 0.9,
        silhouette: 0.9,
        "non-generic": 0.9,
      },
      technicalPassScore: 0.88,
      maximumUnexpectedColourRatio: 0.01,
      maximumAnchorDriftPixels: 1,
      maximumGeometryDriftPixels: 1,
      maximumSilhouetteAreaDeltaRatio: 0.02,
      blockingDetections: ["generic-ai-treatment", "palette-drift"],
    },
    policy: {
      immutableApprovedReferences: true,
      oneBoundedOutputPerWorkItem: true,
      noSilentCanonMutation: true,
      noGenericFallback: true,
      promptIsNotAuthority: true,
      seedIsNotAuthority: true,
      requireFullResolutionReview: true,
      requireEvidenceBeforePromotion: true,
      preserveApprovedExceptions: true,
      requireNeighborReviewForSequences: true,
      requireLoopClosureReview: true,
    },
  };
}

function sessionInput(bible) {
  return {
    schemaVersion: "1.0",
    kind: "evavo.visual-continuity.session",
    sessionId: "storage-session",
    bibleSha256: bible.bibleSha256,
    objective: "Create one exact durable icon candidate.",
    mode: "production",
    revision: "1.0.0",
    iteration: {
      maximumAttemptsPerItem: 2,
      maximumBatchSize: 1,
      candidateCountPerAttempt: 1,
      repairBeforeNewWork: true,
      failClosed: true,
    },
    workItems: [
      {
        id: "icon-anchor",
        title: "Anchor icon",
        assetType: "icon",
        targetStudio: "art-studio",
        purpose: "Create the canonical anchor icon.",
        output: {
          width: 256,
          height: 256,
          format: "png",
          transparency: "required",
        },
        shotTemplateId: "icon-shot",
        preserve: ["palette", "silhouette", "line language"],
        mayChange: ["bounded edge cleanup"],
        mustNotIntroduce: ["glow", "extra decoration", "readable text"],
      },
    ],
  };
}

function acceptedAttempt(packet) {
  const job = packet.jobs[0];
  assert.ok(job);
  return {
    schemaVersion: "1.0",
    packetSha256: packet.packetSha256,
    workItemId: job.workItemId,
    reviewer: "storage-integration-reviewer",
    reviewedAt: "2026-09-19T13:00:00.000Z",
    candidate: {
      artifactId: "candidate-icon-anchor",
      uri: "file:///candidates/icon-anchor.png",
      sha256: digest("b"),
    },
    metrics: job.requiredMetricIds.map((metricId, index) => ({
      metricId,
      score: 0.98,
      evidenceSha256: digest(String((index + 1) % 10)),
    })),
    detections: [],
  };
}

test("continuity workspace persists, resumes, advances and rejects stale state", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "evavo-continuity-store-"));
  try {
    const bible = compileVisualContinuityBible(bibleInput());
    const initialSession = compileVisualContinuitySession(
      bible,
      sessionInput(bible),
    );

    const storedBible = await persistVisualContinuityBible(root, bible, {
      expectedGeneration: 0,
      actor: "storage-test",
      now: new Date("2026-09-19T13:01:00.000Z"),
    });
    assert.equal(storedBible.reference.generation, 1);
    assert.equal(storedBible.idempotent, false);

    const duplicateBible = await persistVisualContinuityBible(root, bible, {
      expectedGeneration: 0,
      actor: "storage-test",
      now: new Date("2026-09-19T13:02:00.000Z"),
    });
    assert.equal(duplicateBible.idempotent, true);
    assert.equal(
      duplicateBible.reference.artifactId,
      storedBible.reference.artifactId,
    );
    assert.equal(duplicateBible.reference.generation, 1);

    const storedInitialSession = await persistVisualContinuitySession(
      root,
      bible,
      initialSession,
      {
        expectedGeneration: 0,
        actor: "storage-test",
        now: new Date("2026-09-19T13:03:00.000Z"),
      },
    );
    assert.equal(storedInitialSession.reference.generation, 1);

    const loadedInitial = await loadVisualContinuityWorkspace(
      root,
      bible.project.projectId,
      bible.bibleId,
      initialSession.sessionId,
    );
    assert.equal(loadedInitial.bible.bibleSha256, bible.bibleSha256);
    assert.equal(
      loadedInitial.session.sessionSha256,
      initialSession.sessionSha256,
    );
    assert.equal(loadedInitial.sessionReference.generation, 1);

    const packet = compileNextVisualContinuityWorkPacket(
      bible,
      initialSession,
    );
    const acceptedSession = evaluateVisualContinuityWorkPacket(
      bible,
      initialSession,
      packet,
      acceptedAttempt(packet),
    );
    assert.equal(acceptedSession.totals.accepted, 1);

    const storedAcceptedSession = await persistVisualContinuitySession(
      root,
      bible,
      acceptedSession,
      {
        expectedGeneration: loadedInitial.sessionReference.generation,
        actor: "storage-test",
        now: new Date("2026-09-19T13:04:00.000Z"),
      },
    );
    assert.equal(storedAcceptedSession.reference.generation, 2);
    assert.equal(
      storedAcceptedSession.reference.previousArtifactId,
      storedInitialSession.artifact.artifactId,
    );

    const artifact = await loadVisualContinuityArtifact(
      root,
      storedInitialSession.artifact.artifactId,
    );
    assert.equal(
      artifact.document.sessionSha256,
      initialSession.sessionSha256,
    );

    await assert.rejects(
      persistVisualContinuitySession(root, bible, initialSession, {
        expectedGeneration: 1,
        actor: "stale-worker",
        now: new Date("2026-09-19T13:05:00.000Z"),
      }),
      (error) => error.code === "ARTIFACT_REFERENCE_CONFLICT",
    );

    const loadedCurrent = await loadVisualContinuityWorkspace(
      root,
      bible.project.projectId,
      bible.bibleId,
      acceptedSession.sessionId,
    );
    assert.equal(
      loadedCurrent.session.sessionSha256,
      acceptedSession.sessionSha256,
    );
    assert.equal(loadedCurrent.sessionReference.generation, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
