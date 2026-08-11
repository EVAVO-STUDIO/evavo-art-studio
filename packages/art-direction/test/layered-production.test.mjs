import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  ArtDirectionError,
  applyLayeredProductionStyleProofApproval,
  compileLayeredProductionPlan,
  compileLayeredProductionStyleProofApprovalReceipt,
  compileLayeredProviderCandidateRequest,
  getLayeredProductionUnit,
  layeredProductionProtocolSummary,
  validateLayeredProductionRequest,
  verifyLayeredProductionPlan,
  verifyLayeredProductionStyleProofApprovalReceipt,
} from "../dist/index.js";

function unit(id, kind, width, height, fileName, targetPath, extra = {}) {
  return {
    id,
    kind,
    purpose: `Author the isolated ${id} source unit.`,
    dimensions: { width, height },
    continuityKey: `jonez-${id}`,
    include: [`only the ${id} artwork`],
    exclude: ["all other scene layers", "readable signage"],
    fileName,
    targetPath,
    ...extra,
  };
}

function request() {
  return {
    schemaVersion: "1.0",
    kind: "evavo.layered-production.request",
    planId: "jonez-market-district-proof",
    revision: "1.0.0",
    intent: "runtime-source",
    project: {
      projectId: "godot-game-foundation-kit",
      title: "Godot Game Foundation Kit",
      gameId: "jonez",
      gameTitle: "JONEZ",
      targetRepository: "EVAVO-STUDIO/GodotGameFoundationKit",
      engine: "Godot",
      engineVersion: "4.6.2",
      runtimeRoot: "examples/city_life_board_sim/assets/final",
    },
    canvas: {
      width: 320,
      height: 200,
      worldWidth: 960,
      worldHeight: 600,
      coordinateSystem: "top-left-integer",
      pixelAspect: "dos-vga-4:3-corrected",
      presentationScale: 2,
      filtering: "nearest",
    },
    style: {
      styleId: "jonez-1991-vga-story-city",
      title: "JONEZ 1991 VGA living city",
      authoredEra: "1991-1993 DOS VGA social simulation",
      renderingMode: "isometric-pixel",
      projection: "dimetric",
      camera: {
        fixed: true,
        yawDegrees: 45,
        pitchDegrees: 30,
        rollDegrees: 0,
        orthographicScale: 1,
      },
      lighting: {
        fixed: true,
        keyDirectionDegrees: 315,
        keyElevationDegrees: 45,
        shadowDirectionDegrees: 135,
        frameVariation: "forbidden",
      },
      palette: {
        mode: "indexed",
        maximumSceneColours: 256,
        maximumLocalColours: 32,
        preserveIndices: true,
        colours: [
          "#101018",
          "#263248",
          "#4B5D72",
          "#8B6A4D",
          "#C49A65",
          "#E1C68A",
          "#295A46",
          "#4E8A57",
          "#32739A",
          "#6A4C93",
          "#B54D4D",
          "#E3A646",
        ],
      },
      pixelGrammar: {
        deliberateClusters: true,
        fixedPixelDensity: true,
        antialias: "none",
        subpixelMotion: "forbidden",
        gradientPolicy: "forbidden",
        textureNoise: "forbidden",
        dithering: "manual",
        outline: "selective",
      },
      materialVocabulary: [
        "weathered brick",
        "painted civic stone",
        "aged concrete",
        "striped canvas awnings",
        "dark iron street furniture",
      ],
      lineRules: [
        "one-pixel selective dark contours",
        "cluster-shaped corners rather than smooth vector curves",
        "details simplify by distance and gameplay importance",
      ],
      compositionRules: [
        "dense but readable micro-stories",
        "board route embedded into believable paving",
        "clear silhouettes at native 320x200 scale",
        "blank sign fields for live text",
      ],
      distinctiveMotifs: [
        "colour-coded destination medallions embedded in paving",
        "recurring civic blue and market ochre accents",
        "small visual jokes carried by crowds and props",
      ],
      forbiddenModernTraits: [
        "glossy mobile-game rendering",
        "cinematic bloom",
        "volumetric light",
        "soft gradient shading",
        "airbrush highlights",
        "modern flat-design cards",
        "high-resolution painterly texture",
        "neon cyberpunk lighting",
      ],
      forbiddenGenericTraits: [
        "generic AI concept-art city",
        "random micro-detail confetti",
        "plastic isometric mobile game buildings",
        "identical repeated crowd faces",
        "fake readable signage",
      ],
      references: [
        {
          id: "jonez-grammar",
          role: "composition",
          uri: "artifact:jonez-approved-style-proof",
          rights: "project-owned",
          note: "Approved EVAVO style proof; grammar only.",
        },
      ],
    },
    sourcePolicy: {
      oneImagePerProviderJob: true,
      oneLayerRolePerSourceUnit: true,
      conceptArtAsRuntimeSourceForbidden: true,
      collagesAsRuntimeSourceForbidden: true,
      contactSheetsAsRuntimeSourceForbidden: true,
      readableGeneratedTextForbidden: true,
      automaticAssemblyForbidden: true,
      automaticPromotionForbidden: true,
      humanApprovalRequired: true,
      styleProofApprovalRequired: true,
      maximumProviderImagesPerJob: 1,
    },
    styleProof: {
      required: true,
      approvalBeforeExpansion: true,
      maximumUnitsBeforeApproval: 8,
      unitIds: [
        "ground-base",
        "route-base",
        "architecture-back",
        "cafe-building",
        "player-idle-se",
        "fountain-f001",
      ],
    },
    layers: [
      {
        id: "ground",
        role: "ground-base",
        zOrder: 0,
        alpha: "opaque",
        assemblyMode: "full-canvas",
        ySortMode: "none",
        include: ["road, paving, grass and canal base only"],
        exclude: ["route markings, buildings, props, people and UI"],
        units: [
          unit(
            "ground-base",
            "full-canvas-layer",
            320,
            200,
            "jonez__market__ground_base.png",
            "examples/city_life_board_sim/assets/final/environment/jonez__market__ground_base.png",
            { position: { x: 0, y: 0 } },
          ),
        ],
      },
      {
        id: "route",
        role: "route-base",
        zOrder: 10,
        alpha: "transparent",
        assemblyMode: "full-canvas",
        ySortMode: "none",
        dependsOn: ["ground"],
        include: ["embedded board-route paving and destination sockets only"],
        exclude: [
          "ground fill, buildings, props, characters and active highlights",
        ],
        units: [
          unit(
            "route-base",
            "full-canvas-layer",
            320,
            200,
            "jonez__market__route_base.png",
            "examples/city_life_board_sim/assets/final/environment/jonez__market__route_base.png",
            { position: { x: 0, y: 0 } },
          ),
        ],
      },
      {
        id: "architecture-back",
        role: "architecture-back",
        zOrder: 20,
        alpha: "transparent",
        assemblyMode: "full-canvas",
        ySortMode: "none",
        dependsOn: ["ground", "route"],
        include: [
          "rear facades, rooftops and non-interactive distant architecture only",
        ],
        exclude: [
          "destination buildings, props, people, foreground occluders and UI",
        ],
        units: [
          unit(
            "architecture-back",
            "full-canvas-layer",
            320,
            200,
            "jonez__market__architecture_back.png",
            "examples/city_life_board_sim/assets/final/environment/jonez__market__architecture_back.png",
            { position: { x: 0, y: 0 } },
          ),
        ],
      },
      {
        id: "destinations",
        role: "destination-structure",
        zOrder: 30,
        alpha: "transparent",
        assemblyMode: "positioned",
        ySortMode: "none",
        dependsOn: ["architecture-back"],
        include: ["one isolated destination structure with blank sign fields"],
        exclude: ["street ground, crowd, props, route and UI"],
        units: [
          unit(
            "cafe-building",
            "sprite",
            96,
            80,
            "jonez__destination__cafe.png",
            "examples/city_life_board_sim/assets/final/environment/jonez__destination__cafe.png",
            { position: { x: 42, y: 34 }, pivot: { x: 48, y: 76 } },
          ),
          unit(
            "market-building",
            "sprite",
            112,
            88,
            "jonez__destination__market.png",
            "examples/city_life_board_sim/assets/final/environment/jonez__destination__market.png",
            { position: { x: 168, y: 28 }, pivot: { x: 56, y: 84 } },
          ),
        ],
      },
      {
        id: "player",
        role: "player-character",
        zOrder: 50,
        alpha: "transparent",
        assemblyMode: "y-sorted",
        ySortMode: "ground-contact",
        dependsOn: ["route"],
        include: ["the isolated active player sprite only"],
        exclude: [
          "cast shadow, scenery, props, crowds, route markers and UI",
        ],
        units: [
          unit(
            "player-idle-se",
            "animation-frame",
            24,
            36,
            "jonez__player__idle_se__f001.png",
            "examples/city_life_board_sim/assets/final/characters/jonez__player__idle_se__f001.png",
            {
              pivot: { x: 12, y: 33 },
              ySortOrigin: { x: 12, y: 33 },
              continuityKey: "jonez-player",
              frame: {
                clipId: "idle-se",
                frameNumber: 1,
                frameCount: 2,
                framesPerSecond: 4,
                loop: true,
                pose: "settled south-east idle with weight on the back foot",
              },
            },
          ),
          unit(
            "player-walk-se-f001",
            "animation-frame",
            24,
            36,
            "jonez__player__walk_se__f001.png",
            "examples/city_life_board_sim/assets/final/characters/jonez__player__walk_se__f001.png",
            {
              pivot: { x: 12, y: 33 },
              ySortOrigin: { x: 12, y: 33 },
              continuityKey: "jonez-player",
              frame: {
                clipId: "walk-se",
                frameNumber: 1,
                frameCount: 4,
                framesPerSecond: 8,
                loop: true,
                pose: "south-east contact pose, front foot planted and rear arm forward",
              },
            },
          ),
        ],
      },
      {
        id: "ambient-fx",
        role: "ambient-effect",
        zOrder: 70,
        alpha: "transparent",
        assemblyMode: "positioned",
        ySortMode: "none",
        dependsOn: ["ground"],
        include: ["one isolated fountain water animation frame only"],
        exclude: ["fountain masonry, scenery, people, glow and UI"],
        units: [
          unit(
            "fountain-f001",
            "animation-frame",
            32,
            32,
            "jonez__fx__fountain__f001.png",
            "examples/city_life_board_sim/assets/final/effects/jonez__fx__fountain__f001.png",
            {
              position: { x: 144, y: 86 },
              pivot: { x: 16, y: 28 },
              frame: {
                clipId: "fountain",
                frameNumber: 1,
                frameCount: 4,
                framesPerSecond: 6,
                loop: true,
                pose: "lowest water crest with two compact upward jets",
              },
            },
          ),
        ],
      },
    ],
  };
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function approvalInput(plan) {
  return {
    schemaVersion: "1.0",
    kind: "evavo.layered-production.style-proof-approval.request",
    planId: plan.planId,
    pendingPlanSha256: plan.planSha256,
    styleFingerprintSha256: plan.styleFingerprintSha256,
    reviewer: "Greg Parker",
    reviewedAt: "2026-08-11T03:45:00.000Z",
    evidence: plan.styleProof.unitIds.map((unitId, index) => {
      const unit = plan.layers
        .flatMap((layer) => layer.units)
        .find((entry) => entry.id === unitId);
      assert.ok(unit);
      const sourceSha256 = digest(`source:${unitId}`);
      const sealedReviewReceiptSha256 = digest(`sealed-review:${unitId}`);
      const reviewBundleSha256 = digest(`review-bundle:${unitId}`);
      return {
        unitId,
        sourceArtifactId: `artifact_${sourceSha256}`,
        sourceSha256,
        sourceBytes: 1024 + index,
        width: unit.dimensions.width,
        height: unit.dimensions.height,
        providerJobIdempotencyKey: unit.providerJob.idempotencyKey,
        providerRequestSha256: digest(`provider-request:${unitId}`),
        sealedReviewArtifactId: `artifact_${sealedReviewReceiptSha256}`,
        sealedReviewReceiptSha256,
        reviewBundleArtifactId: `artifact_${reviewBundleSha256}`,
        reviewBundleSha256,
        decision: "approved",
      };
    }),
    crossUnitReview: {
      decision: "approved",
      styleFingerprintSha256: plan.styleFingerprintSha256,
      cameraConsistency: "approved",
      lightingConsistency: "approved",
      paletteConsistency: "approved",
      pixelGrammarConsistency: "approved",
      layerSeparation: "approved",
      antiGenericQuality: "approved",
      evidenceArtifactId: `artifact_${digest("cross-unit-style-review")}`,
      evidenceSha256: digest("cross-unit-style-review"),
    },
  };
}

function approvePlan(pending) {
  const receipt = compileLayeredProductionStyleProofApprovalReceipt(
    pending,
    approvalInput(pending),
  );
  return {
    receipt,
    approved: applyLayeredProductionStyleProofApproval(pending, receipt),
  };
}

test("compiles one exclusive provider job per layered runtime source", () => {
  const plan = compileLayeredProductionPlan(request());
  assert.equal(plan.kind, "evavo.layered-production.plan");
  assert.equal(plan.totals.layers, 6);
  assert.equal(plan.totals.units, 8);
  assert.equal(plan.totals.providerCalls, 8);
  assert.equal(plan.totals.maximumImagesPerProviderCall, 1);
  assert.equal(plan.styleProof.status, "approval-required");
  assert.equal(plan.assembly.reviewCompositeIsRuntimeSource, false);
  assert.equal(plan.authority.providerExecution, false);
  const sourceUnit = getLayeredProductionUnit(plan, "cafe-building");
  assert.equal(sourceUnit.providerJob.images, 1);
  assert.equal(sourceUnit.providerJob.sourceIntent, "runtime-source");
  assert.match(sourceUnit.providerJob.prompt, /RUNTIME SOURCE UNIT/);
  assert.match(sourceUnit.providerJob.prompt, /Exclusive layer ownership/);
  assert.match(sourceUnit.providerJob.prompt, /Do not draw a complete scene/);
  assert.match(sourceUnit.providerJob.negativePrompt, /concept sheet/);
  assert.match(sourceUnit.providerJob.negativePrompt, /AI microtexture noise/);
  assert.equal(sourceUnit.providerJob.transparentBackground, true);
});

test("blocks non-proof retrieval until a content-addressed proof receipt is applied", () => {
  const pending = compileLayeredProductionPlan(request());
  assert.throws(
    () => getLayeredProductionUnit(pending, "market-building"),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_PRODUCTION_STYLE_PROOF_REQUIRED",
  );
  const { receipt, approved } = approvePlan(pending);
  assert.equal(verifyLayeredProductionStyleProofApprovalReceipt(receipt), true);
  assert.equal(approved.styleProof.status, "approved");
  assert.equal(approved.styleProof.approval.receiptSha256, receipt.receiptSha256);
  assert.equal(getLayeredProductionUnit(approved, "market-building").id, "market-building");
});

test("rejects legacy inline approval instead of trusting an arbitrary hash", () => {
  const invalid = request();
  invalid.styleProof.approval = {
    approved: true,
    reviewer: "Unbound reviewer",
    reviewedAt: "2026-08-11T03:45:00.000Z",
    evidenceSha256: "a".repeat(64),
    approvedUnitIds: [...invalid.styleProof.unitIds],
  };
  assert.throws(
    () => compileLayeredProductionPlan(invalid),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_PRODUCTION_STYLE_PROOF_RECEIPT_REQUIRED",
  );
});

test("style-proof receipt binds dimensions, jobs, source artifacts and cross-unit style", () => {
  const pending = compileLayeredProductionPlan(request());
  const wrongDimensions = approvalInput(pending);
  wrongDimensions.evidence[0].width += 1;
  assert.throws(
    () =>
      compileLayeredProductionStyleProofApprovalReceipt(
        pending,
        wrongDimensions,
      ),
    /dimensions do not match/,
  );

  const wrongJob = approvalInput(pending);
  wrongJob.evidence[0].providerJobIdempotencyKey = "b".repeat(64);
  assert.throws(
    () => compileLayeredProductionStyleProofApprovalReceipt(pending, wrongJob),
    /does not match the exact compiled unit job/,
  );

  const duplicateSource = approvalInput(pending);
  duplicateSource.evidence[1].sourceSha256 =
    duplicateSource.evidence[0].sourceSha256;
  duplicateSource.evidence[1].sourceArtifactId =
    duplicateSource.evidence[0].sourceArtifactId;
  assert.throws(
    () =>
      compileLayeredProductionStyleProofApprovalReceipt(
        pending,
        duplicateSource,
      ),
    /source artifacts must be unique/,
  );

  const wrongStyle = approvalInput(pending);
  wrongStyle.crossUnitReview.styleFingerprintSha256 = "c".repeat(64);
  assert.throws(
    () => compileLayeredProductionStyleProofApprovalReceipt(pending, wrongStyle),
    /not bound to the exact style fingerprint/,
  );
});

test("tampered approval receipts and approved plans fail closed", () => {
  const pending = compileLayeredProductionPlan(request());
  const { receipt, approved } = approvePlan(pending);
  const tamperedReceipt = structuredClone(receipt);
  tamperedReceipt.evidence[0].width += 1;
  assert.throws(
    () => verifyLayeredProductionStyleProofApprovalReceipt(tamperedReceipt),
    /receiptSha256 does not match|evidenceSha256 does not match/,
  );

  const tamperedPlan = structuredClone(approved);
  tamperedPlan.styleProof.approval.evidence[0].sourceBytes += 1;
  assert.throws(() => verifyLayeredProductionPlan(tamperedPlan));
});

test("is deterministic and self-hashed", () => {
  const left = compileLayeredProductionPlan(request());
  const right = compileLayeredProductionPlan(structuredClone(request()));
  assert.equal(left.requestSha256, right.requestSha256);
  assert.equal(left.styleFingerprintSha256, right.styleFingerprintSha256);
  assert.equal(left.planSha256, right.planSha256);
  assert.equal(
    left.layers[0].units[0].providerJob.idempotencyKey,
    right.layers[0].units[0].providerJob.idempotencyKey,
  );
  const leftReceipt = compileLayeredProductionStyleProofApprovalReceipt(
    left,
    approvalInput(left),
  );
  const rightReceipt = compileLayeredProductionStyleProofApprovalReceipt(
    right,
    approvalInput(right),
  );
  assert.equal(leftReceipt.receiptSha256, rightReceipt.receiptSha256);
});

test("rejects flattened source intent and unsafe policy drift", () => {
  const flattened = request();
  flattened.layers[0].units[0].purpose = "Create a complete concept sheet collage.";
  assert.throws(
    () => validateLayeredProductionRequest(flattened),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_PRODUCTION_SOURCE_INVALID",
  );
  const multi = request();
  multi.sourcePolicy.maximumProviderImagesPerJob = 10;
  assert.throws(
    () => validateLayeredProductionRequest(multi),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_PRODUCTION_INPUT_INVALID",
  );
});

test("rejects style proof that does not cover animation", () => {
  const invalid = request();
  invalid.styleProof.unitIds = [
    "ground-base",
    "route-base",
    "architecture-back",
    "cafe-building",
  ];
  assert.throws(
    () => validateLayeredProductionRequest(invalid),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_PRODUCTION_STYLE_PROOF_INVALID",
  );
});

test("rejects duplicate z-order and cross-layer unit identity", () => {
  const duplicateZ = request();
  duplicateZ.layers[1].zOrder = 0;
  assert.throws(
    () => validateLayeredProductionRequest(duplicateZ),
    /zOrder values must be unique/,
  );
  const duplicateUnit = request();
  duplicateUnit.layers[1].units[0].id = "ground-base";
  assert.throws(
    () => validateLayeredProductionRequest(duplicateUnit),
    /Unit IDs must be unique/,
  );
});

test("verifies the canonical plan hash and rejects a tampered pending plan", () => {
  const plan = compileLayeredProductionPlan(request());
  assert.equal(verifyLayeredProductionPlan(plan), true);
  const tampered = structuredClone(plan);
  tampered.totals.units += 1;
  assert.throws(
    () => verifyLayeredProductionPlan(tampered),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_PRODUCTION_PLAN_INVALID",
  );
});

test("compiles a provider-protocol request for a pending proof source unit", () => {
  const plan = compileLayeredProductionPlan(request());
  const bridge = compileLayeredProviderCandidateRequest(plan, "player-idle-se");
  assert.equal(bridge.request.operation, "generate");
  assert.equal(bridge.request.assetKind, "sprite-frame");
  assert.equal(bridge.request.continuityPhase, "identity-master");
  assert.equal(bridge.request.candidateCount, 1);
  assert.equal(bridge.request.quality, "high");
  assert.equal(bridge.request.target.outputFormat, "png");
  assert.equal(bridge.request.target.transparency, "required");
  assert.equal(bridge.requiredReferenceRoles.length, 0);
  assert.match(bridge.request.creativeIntent, /one PNG/);
  assert.match(bridge.request.negativeIntent, /concept sheet/);
});

test("requires an approved canonical identity artifact for later character frames", () => {
  const pending = compileLayeredProductionPlan(request());
  const { approved } = approvePlan(pending);
  assert.equal(approved.styleProof.status, "approved");
  assert.throws(
    () => compileLayeredProviderCandidateRequest(approved, "player-walk-se-f001"),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_PRODUCTION_PROVIDER_REFERENCE_REQUIRED",
  );
  const bridge = compileLayeredProviderCandidateRequest(
    approved,
    "player-walk-se-f001",
    [
      {
        artifactId: `artifact_${"b".repeat(64)}`,
        role: "canonical-identity",
        required: true,
        note: "Approved player identity-master source.",
      },
    ],
  );
  assert.equal(bridge.request.continuityPhase, "key-pose");
  assert.deepEqual(bridge.requiredReferenceRoles, ["canonical-identity"]);
  assert.equal(
    bridge.request.references[0]?.artifactId,
    `artifact_${"b".repeat(64)}`,
  );
});

test("protocol makes concept and runtime-source boundaries explicit", () => {
  const protocol = layeredProductionProtocolSummary();
  assert.equal(protocol.protocolVersion, "2026-08-10.1");
  assert.ok(
    protocol.sourceRules.some((rule) => rule.includes("never runtime-source")),
  );
  assert.ok(
    protocol.sourceRules.some((rule) => rule.includes("exactly one image")),
  );
  assert.equal(protocol.authority.providerExecution, false);
});
