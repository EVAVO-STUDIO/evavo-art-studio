import assert from "node:assert/strict";
import test from "node:test";

import {
  compileNextVisualContinuityWorkPacket,
  compileVisualContinuityBible,
  compileVisualContinuitySession,
  compileVisualContinuityStudioHandoff,
  evaluateVisualContinuityWorkPacket,
  verifyVisualContinuityBible,
} from "../dist/visual-continuity.js";

const digest = (character) => character.repeat(64);

function bibleInput() {
  return {
    schemaVersion: "1.0",
    kind: "evavo.visual-continuity.bible",
    bibleId: "harbour-bible",
    revision: "1.0.0",
    project: {
      projectId: "harbour-project",
      title: "Harbour Project",
      description: "Reference-bound cross-studio production.",
      targetPlatforms: ["desktop", "web"],
      targetStudios: ["art-studio", "animation-studio", "3d-studio"],
    },
    scope: {
      assetTypes: ["sprite-frame", "world-map", "model-sheet"],
      preserveCrossStudioContinuity: true,
      supportLongRunningSessions: true,
      noHiddenChatState: true,
    },
    style: {
      title: "Engraved harbour",
      intent: "Hand-authored monochrome engraving with restrained red navigation accents.",
      authoredEra: "1871",
      renderingLanguage: ["engraved linework", "hard silhouettes"],
      lineLanguage: ["controlled hatching", "no generative smudge"],
      valueStructure: ["black, paper white and restrained mid-tone hatch"],
      materialLanguage: ["construction-following timber grain", "hard-edged metal"],
      lightingLanguage: ["single readable key direction"],
      compositionLanguage: ["front-on stage camera", "clear lower interaction lane"],
      distinctiveMotifs: ["route-red marks", "brass compass rose", "salt-stained timber"],
      prohibitedGenericTraits: ["teal-orange grading", "random filigree", "soft fantasy glow"],
      prohibitedModernTraits: ["electric signage", "modern containers"],
    },
    colourTokens: [
      { id: "ink-black", hex: "#000000", role: "primary ink", usage: ["linework", "silhouette"] },
      { id: "paper-white", hex: "#f4f0e6", role: "paper", usage: ["negative space"] },
      { id: "route-red", hex: "#ff244e", role: "navigation accent", usage: ["routes", "selected marker"] },
    ],
    references: [
      {
        id: "captain-master",
        role: "identity-master",
        uri: "file:///refs/captain.png",
        sha256: digest("a"),
        rights: "owner supplied",
        note: "Canonical captain identity.",
        entityIds: ["captain"],
      },
      {
        id: "map-master",
        role: "map-symbol-master",
        uri: "file:///refs/map.png",
        sha256: digest("b"),
        rights: "owner supplied",
        note: "Canonical map grammar.",
        mapProfileIds: ["world-map"],
      },
      {
        id: "camera-master",
        role: "camera-master",
        uri: "file:///refs/camera.png",
        sha256: digest("c"),
        rights: "owner supplied",
        note: "Canonical stage camera.",
      },
    ],
    locks: [
      {
        id: "captain-lock",
        kind: "identity",
        description: "Captain face, coat and left-eye scar remain canonical.",
        severity: "blocking",
        entityIds: ["captain"],
        referenceIds: ["captain-master"],
      },
      {
        id: "map-lock",
        kind: "map-projection",
        description: "Geography, projection and route grammar remain fixed.",
        severity: "blocking",
        mapProfileIds: ["world-map"],
        referenceIds: ["map-master"],
      },
      {
        id: "camera-lock",
        kind: "camera",
        description: "Keep the front-on stage camera.",
        severity: "blocking",
        referenceIds: ["camera-master"],
      },
    ],
    entities: [
      {
        id: "captain",
        kind: "character",
        name: "Captain",
        canonicalDescription: "Tall weathered captain with a left-eye scar and long dark coat.",
        distinctiveFeatures: ["left-eye scar", "brass compass at belt"],
        silhouetteRules: ["long straight coat", "broad shoulders"],
        proportionRules: ["head is one eighth of standing height"],
        materialRules: ["wool coat", "aged brass"],
        asymmetryRules: ["scar remains on viewer left"],
        forbiddenMutations: ["no hat", "no beard"],
        colourTokenIds: ["ink-black", "paper-white"],
        referenceIds: ["captain-master"],
        lockIds: ["captain-lock"],
      },
    ],
    locations: [],
    mapSymbols: [
      {
        id: "port-symbol",
        meaning: "active port",
        shapeRules: ["small ring with central dot"],
        colourTokenIds: ["route-red"],
        scaleRules: ["eight pixels at master size"],
        referenceIds: ["map-master"],
      },
    ],
    mapProfiles: [
      {
        id: "world-map",
        kind: "world",
        title: "World map",
        projection: "fixed authored projection",
        orientation: "north up",
        coordinateSpace: "world-map-1024x512",
        scalePolicy: "derive all sizes from the 1024x512 master",
        terrainLayers: ["land", "sea", "coastline"],
        routeGrammar: ["route-red solid line", "small circular waypoints"],
        labelGrammar: ["labels remain external metadata"],
        safeAreaRules: ["reserve top-right ticker zone"],
        symbolIds: ["port-symbol"],
        colourTokenIds: ["ink-black", "paper-white", "route-red"],
        referenceIds: ["map-master"],
        lockIds: ["map-lock"],
        outputSizes: [{ width: 1024, height: 512, use: "runtime master" }],
      },
    ],
    shotTemplates: [
      {
        id: "stage-shot",
        title: "Stage shot",
        assetTypes: ["sprite-frame", "model-sheet"],
        aspectRatio: "1:1",
        camera: {
          projection: "front",
          lensOrScale: "orthographic fixed scale",
          height: "eye level",
          angle: "front-on",
          movement: "locked",
        },
        compositionRules: ["keep full silhouette visible"],
        lightingRules: ["key remains upper left"],
        safeAreaRules: ["retain transparent border"],
        referenceIds: ["camera-master"],
        lockIds: ["camera-lock"],
      },
    ],
    quality: {
      minimumMetricScores: { identity: 0.9, "non-generic": 0.9, "map-grammar": 0.9 },
      technicalPassScore: 0.85,
      maximumUnexpectedColourRatio: 0.01,
      maximumAnchorDriftPixels: 1,
      maximumGeometryDriftPixels: 2,
      maximumSilhouetteAreaDeltaRatio: 0.03,
      blockingDetections: ["identity-drift", "generic-ai-treatment", "map-geography-drift"],
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

function sessionInput(bible, maximumAttemptsPerItem = 2) {
  return {
    schemaVersion: "1.0",
    kind: "evavo.visual-continuity.session",
    sessionId: "harbour-session",
    bibleSha256: bible.bibleSha256,
    objective: "Produce a two-frame captain motion and a matching world map.",
    mode: "production",
    revision: "1.0.0",
    iteration: {
      maximumAttemptsPerItem,
      maximumBatchSize: 1,
      candidateCountPerAttempt: 1,
      repairBeforeNewWork: true,
      failClosed: true,
    },
    workItems: [
      {
        id: "frame-01",
        title: "Captain frame one",
        assetType: "sprite-frame",
        targetStudio: "animation-studio",
        purpose: "First frame of the captain step.",
        output: { width: 256, height: 256, format: "png", transparency: "required" },
        entityIds: ["captain"],
        shotTemplateId: "stage-shot",
        preserve: ["identity", "canvas", "pivot"],
        mayChange: ["leg pose"],
        mustNotIntroduce: ["hat", "beard", "extra props"],
        sequence: {
          sequenceId: "captain-step",
          frameNumber: 1,
          frameCount: 2,
          framesPerSecond: 8,
          loop: true,
          nextWorkItemId: "frame-02",
        },
      },
      {
        id: "frame-02",
        title: "Captain frame two",
        assetType: "sprite-frame",
        targetStudio: "animation-studio",
        purpose: "Second frame of the captain step.",
        output: { width: 256, height: 256, format: "png", transparency: "required" },
        dependsOn: ["frame-01"],
        entityIds: ["captain"],
        shotTemplateId: "stage-shot",
        preserve: ["identity", "canvas", "pivot"],
        mayChange: ["leg pose"],
        mustNotIntroduce: ["hat", "beard", "extra props"],
        sequence: {
          sequenceId: "captain-step",
          frameNumber: 2,
          frameCount: 2,
          framesPerSecond: 8,
          loop: true,
          previousWorkItemId: "frame-01",
        },
      },
      {
        id: "world-map-art",
        title: "World map",
        assetType: "world-map",
        targetStudio: "art-studio",
        purpose: "Canonical runtime world map.",
        output: { width: 1024, height: 512, format: "png", transparency: "opaque" },
        dependsOn: ["frame-02"],
        mapProfileIds: ["world-map"],
        preserve: ["projection", "coastlines", "symbols", "safe areas"],
        mayChange: ["weather overlay intensity"],
        mustNotIntroduce: ["new ports", "corrupted labels", "modern icons"],
      },
    ],
  };
}

function evidence(packet, job, character, score, detections = []) {
  return {
    schemaVersion: "1.0",
    packetSha256: packet.packetSha256,
    workItemId: job.workItemId,
    reviewer: "test-reviewer",
    reviewedAt: "2026-09-19T05:00:00.000Z",
    candidate: {
      artifactId: `candidate-${job.workItemId}-${job.attemptNumber}`,
      uri: `file:///candidates/${job.workItemId}-${job.attemptNumber}.png`,
      sha256: digest(character),
    },
    metrics: job.requiredMetricIds.map((metricId, index) => ({
      metricId,
      score,
      evidenceSha256: digest(String((index + 1) % 10)),
    })),
    detections: detections.map((detection, index) => ({
      detection,
      evidenceSha256: digest(String((index + 7) % 10)),
    })),
  };
}

test("iterative continuity repairs before expansion and carries exact neighbour context", () => {
  const bible = compileVisualContinuityBible(bibleInput());
  let session = compileVisualContinuitySession(bible, sessionInput(bible));

  let packet = compileNextVisualContinuityWorkPacket(bible, session);
  assert.equal(packet.jobs[0].workItemId, "frame-01");
  session = evaluateVisualContinuityWorkPacket(
    bible,
    session,
    packet,
    evidence(packet, packet.jobs[0], "d", 0.4, ["generic-ai-treatment"]),
  );
  assert.equal(session.states[0].status, "repair-required");

  packet = compileNextVisualContinuityWorkPacket(bible, session);
  assert.equal(packet.jobs[0].mode, "repair");
  assert.ok(packet.jobs[0].brief.repairDirectives.length > 0);
  session = evaluateVisualContinuityWorkPacket(
    bible,
    session,
    packet,
    evidence(packet, packet.jobs[0], "e", 0.97),
  );
  assert.equal(session.states[0].status, "accepted");

  packet = compileNextVisualContinuityWorkPacket(bible, session);
  assert.equal(packet.jobs[0].workItemId, "frame-02");
  assert.equal(packet.jobs[0].sequenceContext.previousAcceptedSha256, digest("e"));
  session = evaluateVisualContinuityWorkPacket(
    bible,
    session,
    packet,
    evidence(packet, packet.jobs[0], "f", 0.97),
  );

  packet = compileNextVisualContinuityWorkPacket(bible, session);
  assert.equal(packet.jobs[0].workItemId, "world-map-art");
  assert.ok(packet.jobs[0].brief.mapRules.some((rule) => rule.includes("Route grammar")));
  session = evaluateVisualContinuityWorkPacket(
    bible,
    session,
    packet,
    evidence(packet, packet.jobs[0], "7", 0.97),
  );
  assert.equal(compileNextVisualContinuityWorkPacket(bible, session).status, "complete");

  const handoff = compileVisualContinuityStudioHandoff(bible, session, {
    schemaVersion: "1.0",
    targetStudio: "3d-studio",
    receiverProjectId: "harbour-3d",
    purpose: "Build a scale-locked captain reference model.",
    workItemIds: ["frame-02"],
    requestedOutputs: ["orthographic model sheet", "turntable validation"],
  });
  assert.deepEqual(handoff.sources.map((source) => source.workItemId), ["frame-02"]);
  assert.ok(handoff.receivingChecks.some((check) => check.includes("handedness")));
});

test("bibles, sessions and retries fail closed", () => {
  const invalidBible = bibleInput();
  invalidBible.style.prohibitedGenericTraits = ["generic"];
  assert.throws(() => compileVisualContinuityBible(invalidBible));

  const bible = compileVisualContinuityBible(bibleInput());
  const tampered = structuredClone(bible);
  tampered.style.intent = "tampered";
  assert.throws(
    () => verifyVisualContinuityBible(tampered),
    (error) => error.code === "VISUAL_CONTINUITY_BIBLE_HASH_MISMATCH",
  );

  const missingMapProfile = sessionInput(bible);
  delete missingMapProfile.workItems[2].mapProfileIds;
  assert.throws(() => compileVisualContinuitySession(bible, missingMapProfile));

  let session = compileVisualContinuitySession(bible, sessionInput(bible, 1));
  const packet = compileNextVisualContinuityWorkPacket(bible, session);
  session = evaluateVisualContinuityWorkPacket(
    bible,
    session,
    packet,
    evidence(packet, packet.jobs[0], "8", 0.2, ["identity-drift"]),
  );
  assert.equal(session.states[0].status, "blocked");
  assert.equal(compileNextVisualContinuityWorkPacket(bible, session).status, "blocked");
});
