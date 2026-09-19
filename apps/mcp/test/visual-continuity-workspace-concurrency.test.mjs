import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { compileVisualContinuityBible } from "@evavo/art-direction";

import { persistVisualContinuityBible } from "../dist/visual-continuity-workspace-concurrency.js";
import { loadVisualContinuityWorkspace } from "../dist/visual-continuity-workspace-store.js";

const digest = (character) => character.repeat(64);

function bibleInput(revision, intent) {
  return {
    schemaVersion: "1.0",
    kind: "evavo.visual-continuity.bible",
    bibleId: "concurrent-bible",
    revision,
    project: {
      projectId: "concurrent-project",
      title: "Concurrent Project",
      description: "Concurrency fixture for durable visual authority.",
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
      title: "Concurrent icon style",
      intent,
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

test("identical concurrent bible writes converge but divergent stale writes fail", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-continuity-race-"));
  try {
    const bible = compileVisualContinuityBible(
      bibleInput("1.0.0", "One exact icon family with no drift."),
    );
    const [left, right] = await Promise.all([
      persistVisualContinuityBible(root, bible, {
        expectedGeneration: 0,
        actor: "worker-left",
        now: new Date("2026-09-19T15:00:00.000Z"),
      }),
      persistVisualContinuityBible(root, bible, {
        expectedGeneration: 0,
        actor: "worker-right",
        now: new Date("2026-09-19T15:00:00.000Z"),
      }),
    ]);

    assert.equal(left.reference.generation, 1);
    assert.equal(right.reference.generation, 1);
    assert.equal(left.reference.artifactId, right.reference.artifactId);
    assert.ok(left.idempotent || right.idempotent);

    const loaded = await loadVisualContinuityWorkspace(
      root,
      bible.project.projectId,
      bible.bibleId,
    );
    assert.equal(loaded.bible.bibleSha256, bible.bibleSha256);
    assert.equal(loaded.bibleReference.generation, 1);

    const divergent = compileVisualContinuityBible(
      bibleInput("1.0.1", "A deliberately different reviewed visual intent."),
    );
    await assert.rejects(
      persistVisualContinuityBible(root, divergent, {
        expectedGeneration: 0,
        actor: "stale-divergent-worker",
        now: new Date("2026-09-19T15:01:00.000Z"),
      }),
      (error) => error.code === "ARTIFACT_REFERENCE_CONFLICT",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
