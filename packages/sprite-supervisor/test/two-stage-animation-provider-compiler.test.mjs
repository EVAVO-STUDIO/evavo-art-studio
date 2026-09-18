
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  bindAnimationPoseControlArtifact,
  compileAnimationDirectorPlan,
  compileAnimationPoseControl,
} from "@evavo/art-direction";
import { compileComfyUIWorkflowCatalog } from "@evavo/art-providers";

import {
  compileAutomaticSpriteWorkflow,
  compileTwoStageAnimationClip,
  compileTwoStageAnimationProviderBatch,
} from "../dist/index.js";
import { buildDrawThingsCatalogDraft } from "../../../scripts/draw-things-local-models.mjs";

const artifact = (hex) => "artifact_" + hex.repeat(64);
const digest = (hex) => hex.repeat(64);

async function spritePlan() {
  const input = JSON.parse(
    await readFile(
      new URL("../../../examples/automatic-sprite-workflow.json", import.meta.url),
      "utf8",
    ),
  );
  return compileAutomaticSpriteWorkflow(input).request.spritePlan;
}

function animationPlan(canvas) {
  return compileAnimationDirectorPlan({
    clipId: "hero-walk-right",
    subjectId: "hero",
    action: "walk",
    direction: "right",
    motionStyle: "vga-adventure",
    canvas,
    canonicalIdentityArtifactId: artifact("a"),
    directionMasterArtifactId: artifact("b"),
  });
}

function poseBinding(canvas, frameNumber, hex) {
  const frameId =
    "hero-walk-right:f" + String(frameNumber).padStart(3, "0");
  const manifest = compileAnimationPoseControl({
    clipId: "hero-walk-right",
    frameId,
    frameNumber,
    canvas,
    landmarks: {
      root: { x: 0.5, y: 0.55 },
      leftFoot: { x: 0.35, y: 0.92 },
      rightFoot: { x: 0.67, y: 0.9 },
    },
    requiredLandmarkIds: ["root", "leftFoot", "rightFoot"],
    source: {
      kind: "authored",
      id: "two-stage-test-pose",
      version: "1",
      configSha256: digest("f"),
    },
  });
  return bindAnimationPoseControlArtifact(manifest, {
    artifactId: artifact(hex),
    contentSha256: digest(hex),
    mediaType: "image/png",
    width: canvas.width,
    height: canvas.height,
  });
}

function poseBindings(canvas) {
  return Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7, 8].map((frameNumber) => [
      String(frameNumber),
      poseBinding(canvas, frameNumber, String(frameNumber)),
    ]),
  );
}

function install() {
  return {
    schema: "evavo.draw-things-local-install.v1",
    grpcHost: "127.0.0.1",
    grpcPort: 7859,
    bridgeHost: "127.0.0.1",
    bridgePort: 8193,
    modelsRoot: "C:\\EVAVO\\AI\\DrawThings\\Models",
    comfyMainSha256: digest("1"),
    bridgeCommit: "dec14def1759a16f55fa5ff32625e70ca70c16d3",
    bridgeVersion: "1.11.1",
    bridgeRequirementsSha256: digest("2"),
    dockerImageVersion: "v1.20260721.1",
    dockerImageId: "sha256:" + digest("3"),
  };
}

function modelInventoryEntry({
  id,
  name,
  file,
  version,
  bundle,
  modifier,
}) {
  return {
    id,
    name,
    file,
    version,
    bundleSha256: bundle,
    metadataSha256: digest("4"),
    components: [
      {
        relativePath: file,
        sizeBytes: 1024,
        sha256: digest("5"),
      },
    ],
    model: {
      name,
      file,
      version,
      prefix: "",
      modifier,
    },
  };
}

function localInventory() {
  return {
    schema: "evavo.draw-things-local-inventory.v1",
    capturedAt: "2026-09-18T00:00:00.000Z",
    bridgeEndpoint: "http://127.0.0.1:8193",
    grpcEndpoint: "127.0.0.1:7859",
    installManifestSha256: digest("6"),
    models: [
      modelInventoryEntry({
        id: "dt-flux",
        name: "FLUX Test 4B",
        file: "flux-test.ckpt",
        version: "flux2_4b",
        bundle: digest("a"),
        modifier: "kontext",
      }),
      modelInventoryEntry({
        id: "dt-sdxl",
        name: "SDXL Test",
        file: "sdxl-test.ckpt",
        version: "sdxl_base_v0.9",
        bundle: digest("b"),
        modifier: "none",
      }),
    ],
    controls: [
      {
        id: "dt-control",
        name: "Xinsir Test Union",
        file: "xinsir-pose-test.ckpt",
        version: "sdxl_base_v0.9",
        bundleSha256: digest("c"),
        metadataSha256: digest("7"),
        components: [
          {
            relativePath: "xinsir-pose-test.ckpt",
            sizeBytes: 1024,
            sha256: digest("8"),
          },
        ],
        model: {
          name: "Xinsir Test Union",
          file: "xinsir-pose-test.ckpt",
          version: "sdxl_base_v0.9",
          type: "controlnetunion",
          global_average_pooling: false,
        },
      },
    ],
    rawCategoryCounts: {
      models: 2,
      controlNets: 1,
    },
  };
}

function license() {
  return {
    id: "Apache-2.0",
    name: "Apache License 2.0",
    url: "https://www.apache.org/licenses/LICENSE-2.0",
    commercialUse: "allowed",
    derivatives: "allowed",
    redistribution: "allowed",
  };
}

function governanceModel({
  id,
  name,
  file,
  version,
  bundle,
  priority,
  resourceClass,
}) {
  return {
    id,
    inventoryName: name,
    inventoryFile: file,
    version,
    bundleSha256: bundle,
    source: {
      publisher: "Fixture Publisher",
      url: "https://example.com/model/" + id,
    },
    license: license(),
    approvedUses: [
      "illustration",
      "sprite",
      "environment",
      "reference",
    ],
    priority,
    resourceClass,
    policyId: "fixture-policy",
    policySha256: digest("9"),
    reviewedBy: "EVAVO Studio",
    reviewedAt: "2026-09-18T00:00:00.000Z",
  };
}

function governance() {
  return {
    schema: "evavo.draw-things-model-governance.v1",
    policyId: "fixture-policy",
    policySha256: digest("9"),
    reviewedBy: "EVAVO Studio",
    reviewedAt: "2026-09-18T00:00:00.000Z",
    models: [
      governanceModel({
        id: "flux-quality",
        name: "FLUX Test 4B",
        file: "flux-test.ckpt",
        version: "flux2_4b",
        bundle: digest("a"),
        priority: 220,
        resourceClass: "quality",
      }),
      governanceModel({
        id: "sdxl-baseline",
        name: "SDXL Test",
        file: "sdxl-test.ckpt",
        version: "sdxl_base_v0.9",
        bundle: digest("b"),
        priority: 140,
        resourceClass: "baseline",
      }),
    ],
    controls: [
      {
        id: "xinsir-pose",
        inventoryName: "Xinsir Test Union",
        inventoryFile: "xinsir-pose-test.ckpt",
        version: "sdxl_base_v0.9",
        bundleSha256: digest("c"),
        expectedFiles: [
          {
            name: "xinsir-pose-test.ckpt",
            sha256: digest("8"),
          },
        ],
        source: {
          publisher: "xinsir",
          url: "https://example.com/xinsir",
        },
        license: license(),
        approvedRoles: ["pose-control"],
        compatibleModelIds: ["sdxl-baseline"],
        minimumVramGb: 8,
        priority: 180,
        policyId: "fixture-policy",
        policySha256: digest("9"),
        reviewedBy: "EVAVO Studio",
        reviewedAt: "2026-09-18T00:00:00.000Z",
      },
    ],
  };
}

function catalog() {
  const { draft } = buildDrawThingsCatalogDraft({
    inventory: localInventory(),
    governance: governance(),
    install: install(),
  });
  return compileComfyUIWorkflowCatalog(draft);
}

function style() {
  return {
    styleName: "EVAVO VGA adventure sprite",
    intent:
      "Readable authored VGA sprite animation with exact identity and pose continuity.",
    mustHave: ["stable silhouette", "clear authored pose"],
    mustAvoid: ["generic AI rendering", "soft vector edges"],
    identityLocks: ["face", "costume", "body proportions"],
    palette: ["project-approved palette"],
    lineTreatment: ["native-scale deliberate pixel clusters"],
    materials: [],
    cameraRules: ["fixed gameplay camera"],
    compositionRules: ["one complete uncropped subject"],
    eraRules: ["1990s VGA visual grammar"],
  };
}

async function request(batchId, overrides = {}) {
  const sprite = await spritePlan();
  const canvas = {
    width: sprite.asset.dimensions.width,
    height: sprite.asset.dimensions.height,
  };
  return {
    spritePlan: sprite,
    plan: animationPlan(canvas),
    batchId,
    poseControlBindings: poseBindings(canvas),
    keyPoseArtifactIds: {
      "1": artifact("c"),
      "5": artifact("d"),
    },
    style: style(),
    background: {
      strategy: "chroma-key",
      matteColour: "#00ff00",
    },
    finalCandidatesPerFrame: 2,
    drawThingsCatalog: catalog(),
    promotion: {
      namespace: "projects/two-stage-test",
      actor: "two-stage-test",
      expectedGeneration: 0,
    },
    ...overrides,
  };
}

test("compiles key-pose frames through SDXL structural control then FLUX edit", async () => {
  const result = compileTwoStageAnimationProviderBatch(
    await request("hero-walk-right:keys"),
  );
  assert.equal(result.phase, "key-pose");
  assert.equal(result.frames.length, 2);
  assert.match(result.drawThingsCatalogSha256, /^[a-f0-9]{64}$/u);
  assert.equal(result.supervisorWorkflow.rootJob.kind, "art.sprite-production.supervise");
  assert.equal(
    result.supervisorRequest.policy.requiredReleaseArtifactRoles.length,
    result.frames.length,
  );

  for (const frame of result.frames) {
    assert.equal(
      frame.structuralAdapterId,
      "draw-things:dt-sdxl-baseline-generate-pose-ref",
    );
    assert.equal(
      frame.finalAdapterId,
      "draw-things:dt-flux-quality-generate-edit-direction-ref",
    );
    assert.deepEqual(
      frame.structuralRequest.selection.allowedAdapterIds,
      [frame.structuralAdapterId],
    );
    assert.deepEqual(
      frame.finalValidationRequest.selection.allowedAdapterIds,
      [frame.finalAdapterId],
    );
    assert.deepEqual(
      frame.structuralRequest.references.map((entry) => entry.role),
      ["canonical-identity", "pose-control"],
    );
    assert.deepEqual(
      frame.finalValidationRequest.references.map((entry) => entry.role),
      ["base-image", "canonical-identity", "direction-master"],
    );
    assert.ok(frame.taskIds.length === 9);
  }

  const tasks = result.supervisorRequest.tasks;
  assert.equal(
    tasks.filter((task) => task.kind === "art.candidate.generate").length,
    2,
  );
  assert.equal(
    tasks.filter((task) => task.kind === "art.candidate.edit").length,
    4,
  );
  assert.equal(
    tasks.filter((task) => task.kind === "art.candidate.master-alpha").length,
    6,
  );
  assert.equal(
    tasks.filter((task) => task.kind === "art.candidate.select").length,
    4,
  );
  assert.equal(
    tasks.filter((task) => task.kind === "art.candidate.promote").length,
    2,
  );

  const structural = tasks.find(
    (task) => task.kind === "art.candidate.generate",
  );
  assert.ok(structural);
  assert.equal(
    structural.outputBindings[0].source,
    "runtime-result-json",
  );
  assert.equal(
    structural.outputBindings[0].pointer,
    "/candidateArtifacts/0",
  );
  assert.deepEqual(
    structural.payloadTemplate.selection.allowedAdapterIds,
    ["draw-things:dt-sdxl-baseline-generate-pose-ref"],
  );

  const final = tasks.find((task) => task.kind === "art.candidate.edit");
  assert.ok(final);
  assert.deepEqual(
    final.payloadTemplate.selection.allowedAdapterIds,
    ["draw-things:dt-flux-quality-generate-edit-direction-ref"],
  );
  assert.equal(
    final.payloadTemplate.references[0].role,
    "base-image",
  );
  assert.deepEqual(
    final.payloadTemplate.references[0].artifactId,
    { $artifact: result.frames[0].structuralArtifactRole },
  );

  const selections = tasks.filter(
    (task) => task.kind === "art.candidate.select",
  );
  const poseSelection = selections.find(
    (task) =>
      task.payloadTemplate.referenceRole ===
      "pose-locked-structural-draft",
  );
  const identitySelection = selections.find(
    (task) =>
      task.payloadTemplate.referenceRole ===
      "direction-identity-lock",
  );
  assert.ok(poseSelection);
  assert.ok(identitySelection);
  assert.equal(identitySelection.payloadTemplate.referenceArtifactId, artifact("b"));
  assert.equal(
    identitySelection.payloadTemplate.policy.requireReferenceLineage,
    false,
  );
  assert.deepEqual(
    identitySelection.payloadTemplate.candidateArtifactIds,
    { $artifacts: identitySelection.requiredArtifactRoles[0] },
  );
  const promotion = tasks.find(
    (task) => task.kind === "art.candidate.promote",
  );
  assert.ok(promotion);
  assert.deepEqual(
    promotion.payloadTemplate.selectionEvidenceArtifactId,
    { $artifact: promotion.requiredArtifactRoles[0] },
  );
  assert.ok(
    promotion.dependencyTaskIds.includes(identitySelection.id),
  );
});

test("compiles in-betweens to the FLUX direction+temporal edit profile", async () => {
  const result = compileTwoStageAnimationProviderBatch(
    await request("hero-walk-right:inbetweens-a"),
  );
  assert.equal(result.phase, "in-between");
  assert.equal(result.frames.length, 3);
  for (const frame of result.frames) {
    assert.equal(
      frame.structuralAdapterId,
      "draw-things:dt-sdxl-baseline-generate-pose-ref",
    );
    assert.equal(
      frame.finalAdapterId,
      "draw-things:dt-flux-quality-generate-edit-direction-temporal-ref",
    );
    assert.deepEqual(
      frame.finalValidationRequest.references.map((entry) => entry.role),
      [
        "base-image",
        "canonical-identity",
        "direction-master",
        "previous-key-pose",
        "next-key-pose",
      ],
    );
  }
});

test("two-stage compiler rejects catalogs that cannot prove local structural pose control", async () => {
  const input = await request("hero-walk-right:keys");
  const badCatalog = structuredClone(input.drawThingsCatalog);
  badCatalog.profiles = badCatalog.profiles.filter(
    (profile) => !profile.capabilities.includes("pose-control"),
  );
  input.drawThingsCatalog = badCatalog;
  assert.throws(
    () => compileTwoStageAnimationProviderBatch(input),
    /catalog|pose-control|tampered|structural/iu,
  );
});

test("two-stage compiler refuses candidate counts beyond the Animation Director batch budget", async () => {
  const input = await request("hero-walk-right:keys", {
    finalCandidatesPerFrame: 99,
  });
  assert.throws(
    () => compileTwoStageAnimationProviderBatch(input),
    /finalCandidatesPerFrame/u,
  );
});

test("two-stage compiler rejects sprite-plan and Animation Director canvas drift", async () => {
  const input = await request("hero-walk-right:keys");
  input.plan = animationPlan({
    width: input.spritePlan.asset.dimensions.width + 64,
    height: input.spritePlan.asset.dimensions.height,
  });
  assert.throws(
    () => compileTwoStageAnimationProviderBatch(input),
    /spritePlan canvas/u,
  );
});


test("full-clip compiler binds promoted key poses into all in-betweens", async () => {
  const batch = await request("hero-walk-right:keys");
  const {
    batchId: _batchId,
    keyPoseArtifactIds: _keyPoseArtifactIds,
    finalCandidatesPerFrame: _finalCandidatesPerFrame,
    ...clipInput
  } = batch;
  const result = compileTwoStageAnimationClip({
    ...clipInput,
    keyPoseCandidatesPerFrame: 2,
    inBetweenCandidatesPerFrame: 2,
  });

  assert.equal(result.frames.length, 8);
  assert.equal(result.supervisorRequest.policy.maximumActiveChildren, 1);
  assert.deepEqual(
    result.supervisorRequest.policy.requiredReleaseArtifactRoles,
    ["two-stage.family-evidence", "two-stage.family-manifest"],
  );

  const frame1 = result.frames.find(
    (frame) => frame.frameId === "hero-walk-right:f001",
  );
  const frame5 = result.frames.find(
    (frame) => frame.frameId === "hero-walk-right:f005",
  );
  assert.ok(frame1);
  assert.ok(frame5);

  const inBetweenTask = result.supervisorRequest.tasks.find(
    (task) =>
      task.kind === "art.candidate.edit" &&
      task.payloadTemplate.frameId === "hero-walk-right:f002",
  );
  assert.ok(inBetweenTask);
  const previous = inBetweenTask.payloadTemplate.references.find(
    (reference) => reference.role === "previous-key-pose",
  );
  const next = inBetweenTask.payloadTemplate.references.find(
    (reference) => reference.role === "next-key-pose",
  );
  assert.deepEqual(previous.artifactId, {
    $artifact: frame1.finalMasterRole,
  });
  assert.deepEqual(next.artifactId, {
    $artifact: frame5.finalMasterRole,
  });
  assert.ok(
    inBetweenTask.requiredArtifactRoles.includes(frame1.finalMasterRole),
  );
  assert.ok(
    inBetweenTask.requiredArtifactRoles.includes(frame5.finalMasterRole),
  );
  assert.ok(
    inBetweenTask.dependencyTaskIds.some((id) =>
      id.includes("two-promote-"),
    ),
  );
  assert.equal(
    inBetweenTask.staticInputArtifacts.includes(artifact("c")),
    false,
  );
  assert.equal(
    inBetweenTask.staticInputArtifacts.includes(artifact("d")),
    false,
  );
});

test("full-clip compiler reverses loop-side temporal dependencies for frames 6-8", async () => {
  const batch = await request("hero-walk-right:keys");
  const {
    batchId: _batchId,
    keyPoseArtifactIds: _keyPoseArtifactIds,
    finalCandidatesPerFrame: _finalCandidatesPerFrame,
    ...clipInput
  } = batch;
  const result = compileTwoStageAnimationClip({
    ...clipInput,
    keyPoseCandidatesPerFrame: 1,
    inBetweenCandidatesPerFrame: 1,
  });
  const frame1 = result.frames.find(
    (frame) => frame.frameId === "hero-walk-right:f001",
  );
  const frame5 = result.frames.find(
    (frame) => frame.frameId === "hero-walk-right:f005",
  );
  const frame6 = result.supervisorRequest.tasks.find(
    (task) =>
      task.kind === "art.candidate.edit" &&
      task.payloadTemplate.frameId === "hero-walk-right:f006",
  );
  assert.ok(frame1);
  assert.ok(frame5);
  assert.ok(frame6);
  const temporal = Object.fromEntries(
    frame6.payloadTemplate.references
      .filter((reference) =>
        ["previous-key-pose", "next-key-pose"].includes(reference.role),
      )
      .map((reference) => [reference.role, reference.artifactId]),
  );
  assert.deepEqual(temporal["previous-key-pose"], {
    $artifact: frame5.finalMasterRole,
  });
  assert.deepEqual(temporal["next-key-pose"], {
    $artifact: frame1.finalMasterRole,
  });
});

test("full-clip release is gated by one manifest-bound family verification task", async () => {
  const batch = await request("hero-walk-right:keys");
  const {
    batchId: _batchId,
    keyPoseArtifactIds: _keyPoseArtifactIds,
    finalCandidatesPerFrame: _finalCandidatesPerFrame,
    ...clipInput
  } = batch;
  const result = compileTwoStageAnimationClip({
    ...clipInput,
    keyPoseCandidatesPerFrame: 1,
    inBetweenCandidatesPerFrame: 1,
  });

  const familyTasks = result.supervisorRequest.tasks.filter(
    (task) => task.kind === "sprite.family.verify",
  );
  assert.equal(familyTasks.length, 1);
  const family = familyTasks[0];
  assert.equal(family.payloadTemplate.frames.length, 8);
  assert.ok(
    family.payloadTemplate.frames.every(
      (frame) =>
        frame.baseline ===
        result.supervisorRequest.spritePlan.godot.ySortOrigin.y,
    ),
  );
  assert.equal(family.payloadTemplate.layerDefinitions.length, 1);
  assert.equal(
    family.payloadTemplate.layerDefinitions[0].role,
    "identity-core",
  );
  assert.equal(
    family.payloadTemplate.policy.requireQualityPassed,
    true,
  );
  assert.equal(
    family.payloadTemplate.policy.requireDeclaredComposite,
    false,
  );
  assert.equal(
    family.payloadTemplate.policy.minimumLoopClosureSimilarity,
    0.5,
  );
  assert.equal(family.requiredArtifactRoles.length, 8);
  assert.equal(family.dependencyTaskIds.length, 8);
  assert.ok(
    family.outputBindings.some(
      (binding) =>
        binding.role === result.familyEvidenceRole &&
        binding.labels.artifactRole ===
          "sprite-family-consistency-evidence",
    ),
  );
  assert.ok(
    family.outputBindings.some(
      (binding) =>
        binding.role === result.familyManifestRole &&
        binding.labels.artifactRole ===
          "sprite-family-normalized-manifest",
    ),
  );
});

test("full-clip graph remains local-only at every provider task", async () => {
  const batch = await request("hero-walk-right:keys");
  const {
    batchId: _batchId,
    keyPoseArtifactIds: _keyPoseArtifactIds,
    finalCandidatesPerFrame: _finalCandidatesPerFrame,
    ...clipInput
  } = batch;
  const result = compileTwoStageAnimationClip({
    ...clipInput,
    keyPoseCandidatesPerFrame: 1,
    inBetweenCandidatesPerFrame: 1,
  });
  const providerTasks = result.supervisorRequest.tasks.filter(
    (task) =>
      task.kind === "art.candidate.generate" ||
      task.kind === "art.candidate.edit",
  );
  assert.equal(providerTasks.length, 16);
  for (const task of providerTasks) {
    assert.equal(
      task.payloadTemplate.selection.allowedAdapterIds.length,
      1,
    );
    assert.match(
      task.payloadTemplate.selection.allowedAdapterIds[0],
      /^draw-things:/u,
    );
    assert.equal(task.payloadTemplate.selection.allowFallback, false);
  }
});


test("full-clip delivery chains verified family artifacts into atlas packaging", async () => {
  const batch = await request("hero-walk-right:keys");
  const {
    batchId: _batchId,
    keyPoseArtifactIds: _keyPoseArtifactIds,
    finalCandidatesPerFrame: _finalCandidatesPerFrame,
    ...clipInput
  } = batch;
  const result = compileTwoStageAnimationClip({
    ...clipInput,
    keyPoseCandidatesPerFrame: 1,
    inBetweenCandidatesPerFrame: 1,
    delivery: {
      outputDirectory: "C:\\EVAVO\\ArtStudio\\deliveries\\hero-walk-right",
      atlasId: "hero-walk-right-atlas",
      godotProjectPath: "C:\\GitRepos\\game-project",
    },
  });

  const atlasTasks = result.supervisorRequest.tasks.filter(
    (task) => task.kind === "sprite.atlas.build",
  );
  assert.equal(atlasTasks.length, 1);
  const atlas = atlasTasks[0];
  assert.deepEqual(atlas.requiredArtifactRoles, [
    result.familyManifestRole,
    result.familyEvidenceRole,
    result.familyCompositeRole,
  ]);
  assert.deepEqual(atlas.payloadTemplate.familyManifestArtifactId, {
    $artifact: result.familyManifestRole,
  });
  assert.deepEqual(atlas.payloadTemplate.familyEvidenceArtifactId, {
    $artifact: result.familyEvidenceRole,
  });
  assert.equal(atlas.payloadTemplate.atlasId, "hero-walk-right-atlas");
  assert.equal(
    atlas.payloadTemplate.godotProjectPath,
    "C:\\GitRepos\\game-project",
  );
  assert.ok(result.atlasImageRole);
  assert.ok(result.atlasDataRole);
  assert.ok(result.atlasEvidenceRole);
  assert.ok(result.godotDescriptorRole);
  assert.ok(result.godotImporterRole);
  assert.ok(
    result.supervisorRequest.policy.requiredReleaseArtifactRoles.includes(
      result.atlasEvidenceRole,
    ),
  );
  assert.ok(
    result.supervisorRequest.policy.requiredReleaseArtifactRoles.includes(
      result.godotDescriptorRole,
    ),
  );
  assert.ok(
    atlas.outputBindings.some(
      (binding) =>
        binding.role === result.atlasEvidenceRole &&
        binding.labels.qualityState === "passed",
    ),
  );
});
