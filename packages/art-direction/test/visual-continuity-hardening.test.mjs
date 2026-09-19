import assert from "node:assert/strict";
import test from "node:test";

import {
  VISUAL_CONTINUITY_APPROVAL_KIND,
  compileApprovedVisualContinuityStudioHandoff,
  compileNextVisualContinuityWorkPacket,
  compileVisualContinuityApprovalReceipt,
  compileVisualContinuityBible,
  compileVisualContinuitySession,
  evaluateVisualContinuityWorkPacket,
  evaluateVisualContinuityWorkPacketBatch,
  verifyApprovedVisualContinuityStudioHandoff,
  verifyVisualContinuityApprovalReceipt,
} from "../dist/visual-continuity.js";

const digest = (character) => character.repeat(64);

function baseBibleInput() {
  return {
    schemaVersion: "1.0",
    kind: "evavo.visual-continuity.bible",
    bibleId: "utility-bible",
    revision: "1.0.0",
    project: {
      projectId: "utility-project",
      title: "Utility Art",
      description: "Reference-bound cross-studio art production.",
      targetPlatforms: ["web"],
      targetStudios: ["art-studio", "web-runtime", "3d-studio"],
    },
    scope: {
      assetTypes: ["icon"],
      preserveCrossStudioContinuity: true,
      supportLongRunningSessions: true,
      noHiddenChatState: true,
    },
    style: {
      title: "Engraved utility art",
      intent: "Crisp authored silhouettes with exact palette and restrained detail.",
      authoredEra: "1871",
      renderingLanguage: ["engraved monochrome raster"],
      lineLanguage: ["controlled one-pixel clusters"],
      valueStructure: ["ink black, paper white and one accent"],
      materialLanguage: ["construction-led marks"],
      lightingLanguage: ["no soft generated glow"],
      compositionLanguage: ["one clear subject"],
      distinctiveMotifs: ["brass ring", "route-red notch", "salt-cut edge"],
      prohibitedGenericTraits: ["random filigree", "soft fantasy glow", "stock app glyph"],
      prohibitedModernTraits: ["glassmorphism"],
    },
    colourTokens: [
      {
        id: "ink-black",
        hex: "#000000",
        role: "primary ink",
        usage: ["linework", "silhouette"],
        reservedFor: ["canonical outlines"],
        pairWith: ["route-red"],
        toleranceDeltaE: 1,
      },
      {
        id: "route-red",
        hex: "#ff244e",
        role: "navigation accent",
        usage: ["one selected notch"],
        prohibitedFor: ["shading", "background fill"],
        toleranceDeltaE: 1,
      },
    ],
    references: [
      {
        id: "style-master",
        role: "style-master",
        uri: "file:///refs/style-master.png",
        sha256: digest("a"),
        rights: "owner supplied",
        note: "Canonical construction and line language.",
      },
    ],
    locks: [
      {
        id: "style-lock",
        kind: "palette",
        description: "Keep exact palette, silhouette and line grammar.",
        severity: "blocking",
        appliesToAssetTypes: ["icon"],
        referenceIds: ["style-master"],
        mustNotVary: ["palette", "line density", "camera"],
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
        lightingRules: ["no baked glow"],
        safeAreaRules: ["retain eight-pixel clear edge"],
        referenceIds: ["style-master"],
        lockIds: ["style-lock"],
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

function iconSessionInput(bible, candidateCountPerAttempt = 1) {
  const icon = (id, title) => ({
    id,
    title,
    assetType: "icon",
    targetStudio: "art-studio",
    purpose: `Create ${title} without redesigning the family.`,
    output: {
      width: 256,
      height: 256,
      format: "png",
      transparency: "required",
    },
    shotTemplateId: "icon-shot",
    preserve: ["palette", "silhouette", "line language"],
    mayChange: ["subject meaning"],
    mustNotIntroduce: ["glow", "extra decoration", "corrupted text"],
  });
  return {
    schemaVersion: "1.0",
    kind: "evavo.visual-continuity.session",
    sessionId: "utility-session",
    bibleSha256: bible.bibleSha256,
    objective: "Produce two consistent icons in one atomic batch.",
    mode: "production",
    revision: "1.0.0",
    iteration: {
      maximumAttemptsPerItem: 2,
      maximumBatchSize: 2,
      candidateCountPerAttempt,
      repairBeforeNewWork: true,
      failClosed: true,
    },
    workItems: [
      icon("icon-anchor", "anchor icon"),
      icon("icon-compass", "compass icon"),
    ],
  };
}

function attemptFor(packet, job, character) {
  return {
    schemaVersion: "1.0",
    packetSha256: packet.packetSha256,
    workItemId: job.workItemId,
    reviewer: "continuity-reviewer",
    reviewedAt: "2026-09-19T12:00:00.000Z",
    candidate: {
      artifactId: `candidate-${job.workItemId}`,
      uri: `file:///candidates/${job.workItemId}.png`,
      sha256: digest(character),
    },
    metrics: job.requiredMetricIds.map((metricId, index) => ({
      metricId,
      score: 0.98,
      evidenceSha256: digest(String((index + 1) % 10)),
    })),
    detections: [],
  };
}

function approvalFor(bible, session, workItemId, evidenceCharacter) {
  const state = session.states.find((candidate) => candidate.id === workItemId);
  assert.ok(state?.acceptedCandidate);
  return compileVisualContinuityApprovalReceipt(bible, session, {
    schemaVersion: "1.0",
    kind: VISUAL_CONTINUITY_APPROVAL_KIND,
    workItemId,
    candidateSha256: state.acceptedCandidate.sha256,
    attemptSha256: state.acceptedCandidate.attemptSha256,
    decision: "approved",
    reviewer: "greg",
    reviewedAt: "2026-09-19T12:05:00.000Z",
    evidenceSha256: digest(evidenceCharacter),
    note: "Approved after full-resolution and runtime-scale visual review.",
  });
}

test("multi-job packets evaluate atomically and release only with approvals", () => {
  const bible = compileVisualContinuityBible(baseBibleInput());
  let session = compileVisualContinuitySession(bible, iconSessionInput(bible));
  const packet = compileNextVisualContinuityWorkPacket(bible, session);
  assert.equal(packet.jobs.length, 2);
  assert.throws(
    () =>
      evaluateVisualContinuityWorkPacket(
        bible,
        session,
        packet,
        attemptFor(packet, packet.jobs[0], "b"),
      ),
    (error) => error.code === "VISUAL_CONTINUITY_ATOMIC_BATCH_REQUIRED",
  );

  session = evaluateVisualContinuityWorkPacketBatch(
    bible,
    session,
    packet,
    [
      attemptFor(packet, packet.jobs[0], "b"),
      attemptFor(packet, packet.jobs[1], "c"),
    ],
  );
  assert.equal(session.totals.accepted, 2);
  assert.equal(session.totals.attempts, 2);

  const approvals = [
    approvalFor(bible, session, "icon-anchor", "d"),
    approvalFor(bible, session, "icon-compass", "e"),
  ];
  approvals.forEach((approval) =>
    verifyVisualContinuityApprovalReceipt(bible, session, approval),
  );

  const handoff = compileApprovedVisualContinuityStudioHandoff(bible, session, {
    schemaVersion: "1.0",
    targetStudio: "web-runtime",
    receiverProjectId: "utility-web",
    purpose: "Deliver approved icon masters for receiver validation.",
    workItemIds: ["icon-anchor", "icon-compass"],
    requestedOutputs: ["responsive lossless icon package"],
    approvalReceipts: approvals,
  });
  assert.equal(handoff.releaseStatus, "approved-for-receiver-validation");
  assert.equal(handoff.receiverRoute.status, "receiver-validation-required");
  verifyApprovedVisualContinuityStudioHandoff(bible, session, handoff);

  const threeDimensional = compileApprovedVisualContinuityStudioHandoff(
    bible,
    session,
    {
      schemaVersion: "1.0",
      targetStudio: "3d-studio",
      receiverProjectId: "utility-3d",
      purpose: "Prepare one approved source for the governed multi-view adapter.",
      workItemIds: ["icon-anchor"],
      requestedOutputs: ["multi-view adapter request"],
      approvalReceipts: [approvals[0]],
    },
  );
  assert.equal(threeDimensional.receiverRoute.status, "adapter-required");
  assert.equal(
    threeDimensional.receiverRoute.adapterId,
    "asset-fabricator-reference-handoff",
  );
});

test("candidate sets and tampered approval fields fail closed", () => {
  const bible = compileVisualContinuityBible(baseBibleInput());
  assert.throws(
    () => compileVisualContinuitySession(bible, iconSessionInput(bible, 2)),
    (error) => error.code === "VISUAL_CONTINUITY_CANDIDATE_SET_UNSUPPORTED",
  );

  let session = compileVisualContinuitySession(bible, iconSessionInput(bible));
  const packet = compileNextVisualContinuityWorkPacket(bible, session);
  session = evaluateVisualContinuityWorkPacketBatch(
    bible,
    session,
    packet,
    [
      attemptFor(packet, packet.jobs[0], "4"),
      attemptFor(packet, packet.jobs[1], "5"),
    ],
  );
  const approval = approvalFor(bible, session, "icon-anchor", "6");
  const tampered = structuredClone(approval);
  tampered.artifactId = "different-artifact";
  assert.throws(
    () => verifyVisualContinuityApprovalReceipt(bible, session, tampered),
    (error) => error.code === "VISUAL_CONTINUITY_APPROVAL_HASH_MISMATCH",
  );
});

function mapBibleInput() {
  const input = structuredClone(baseBibleInput());
  input.bibleId = "map-bible";
  input.project.projectId = "map-project";
  input.scope.assetTypes = ["world-map"];
  input.references.push({
    id: "symbol-master",
    role: "map-symbol-master",
    uri: "file:///refs/symbol-master.png",
    sha256: digest("f"),
    rights: "owner supplied",
    note: "Canonical port symbol shape and scale.",
  });
  input.locks = [
    {
      id: "map-lock",
      kind: "map-projection",
      description: "Keep projection, geography, symbols and routes exact.",
      severity: "blocking",
      appliesToAssetTypes: ["world-map"],
      referenceIds: ["style-master"],
      mustNotVary: ["coastline", "port symbol", "route grammar"],
    },
  ];
  input.mapSymbols = [
    {
      id: "port-symbol",
      meaning: "active port",
      shapeRules: ["small ring with centered dot"],
      colourTokenIds: ["route-red"],
      scaleRules: ["eight pixels at the 1024 by 512 master"],
      referenceIds: ["symbol-master"],
    },
  ];
  input.mapProfiles = [
    {
      id: "world-map-profile",
      kind: "world",
      title: "World map",
      projection: "fixed authored projection",
      orientation: "north up",
      coordinateSpace: "world-map-1024x512",
      scalePolicy: "derive all outputs from the master",
      terrainLayers: ["land", "sea", "coastline"],
      routeGrammar: ["route-red solid line"],
      labelGrammar: ["runtime labels only"],
      safeAreaRules: ["reserve top-right ticker zone"],
      symbolIds: ["port-symbol"],
      colourTokenIds: ["ink-black", "route-red"],
      referenceIds: ["style-master"],
      lockIds: ["map-lock"],
      outputSizes: [{ width: 1024, height: 512, use: "runtime master" }],
    },
  ];
  input.shotTemplates = [
    {
      id: "map-shot",
      title: "Map master",
      assetTypes: ["world-map"],
      aspectRatio: "2:1",
      camera: {
        projection: "screen-space",
        lensOrScale: "fixed master scale",
        height: "not applicable",
        angle: "front",
        movement: "locked",
      },
      compositionRules: ["preserve safe areas"],
      lightingRules: ["no lighting gradient"],
      safeAreaRules: ["reserve ticker zone"],
      referenceIds: ["style-master"],
      lockIds: ["map-lock"],
    },
  ];
  return input;
}

test("map packets bind symbol rules and symbol reference bytes", () => {
  const bible = compileVisualContinuityBible(mapBibleInput());
  const session = compileVisualContinuitySession(bible, {
    schemaVersion: "1.0",
    kind: "evavo.visual-continuity.session",
    sessionId: "map-session",
    bibleSha256: bible.bibleSha256,
    objective: "Produce the canonical world map without symbol drift.",
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
        id: "world-map-art",
        title: "World map",
        assetType: "world-map",
        targetStudio: "art-studio",
        purpose: "Create the canonical runtime world map.",
        output: {
          width: 1024,
          height: 512,
          format: "png",
          transparency: "opaque",
        },
        mapProfileIds: ["world-map-profile"],
        shotTemplateId: "map-shot",
        preserve: ["projection", "coastline", "symbol geometry"],
        mayChange: ["weather overlay intensity"],
        mustNotIntroduce: ["new ports", "modern iconography"],
      },
    ],
  });
  const packet = compileNextVisualContinuityWorkPacket(bible, session);
  assert.ok(
    packet.jobs[0].brief.mapRules.some((rule) =>
      rule.includes("Map symbol port-symbol shape"),
    ),
  );
  assert.ok(
    packet.jobs[0].references.some(
      (reference) =>
        reference.id === "symbol-master" && reference.required === true,
    ),
  );
});
