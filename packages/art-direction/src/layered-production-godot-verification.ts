import { createHash } from "node:crypto";

import type { CompiledLayeredProductionPlan } from "./layered-production-types.js";
import { fail, relativePath, sha256 } from "./layered-production-internal.js";
import { verifyLayeredProductionPlan } from "./layered-production-plan.js";
import type { CompiledLayeredAssemblyManifest } from "./layered-production-assembly-types.js";
import { verifyLayeredAssemblyManifest } from "./layered-production-assembly-verification.js";
import { compileLayeredGodotIntegrationPlan } from "./layered-production-godot-compiler.js";
import type {
  CompiledLayeredGodotIntegrationPlan,
  CompiledLayeredGodotResourceDraft,
} from "./layered-production-godot-types.js";
import {
  LAYERED_GODOT_PLAN_KIND,
  LAYERED_GODOT_PROTOCOL_VERSION,
  LAYERED_GODOT_REQUEST_KIND,
} from "./layered-production-godot-types.js";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function fileSha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function verifyDraft(resource: CompiledLayeredGodotResourceDraft): void {
  const path = relativePath(resource.path, `godot resource ${resource.kind}.path`);
  if (path !== resource.path) {
    fail("LAYERED_GODOT_PLAN_INVALID", `Godot resource ${resource.kind} path is not canonical.`);
  }
  if (
    !SHA256_PATTERN.test(resource.sha256) ||
    fileSha256(resource.content) !== resource.sha256 ||
    Buffer.byteLength(resource.content, "utf8") !== resource.bytes
  ) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      `Godot resource ${resource.kind} exact-byte identity is invalid.`,
    );
  }
  if (
    (resource.mediaType === "application/json" && !resource.path.endsWith(".json")) ||
    (resource.kind === "scene-draft" &&
      (resource.mediaType !== "text/plain" || !resource.path.endsWith(".tscn")))
  ) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      `Godot resource ${resource.kind} media type and path do not agree.`,
    );
  }
  if (resource.mediaType === "application/json") {
    try {
      JSON.parse(resource.content);
    } catch {
      fail(
        "LAYERED_GODOT_PLAN_INVALID",
        `Godot resource ${resource.kind} is not valid JSON.`,
      );
    }
  }
}

export function verifyLayeredGodotIntegrationPlan(
  integration: CompiledLayeredGodotIntegrationPlan,
  plan: CompiledLayeredProductionPlan,
  assembly: CompiledLayeredAssemblyManifest,
): true {
  verifyLayeredProductionPlan(plan);
  verifyLayeredAssemblyManifest(assembly, plan);
  if (
    integration.kind !== LAYERED_GODOT_PLAN_KIND ||
    integration.protocolVersion !== LAYERED_GODOT_PROTOCOL_VERSION ||
    !SHA256_PATTERN.test(integration.requestSha256) ||
    !SHA256_PATTERN.test(integration.integrationSha256)
  ) {
    fail("LAYERED_GODOT_PLAN_INVALID", "Layered Godot integration identity is invalid.");
  }
  const { integrationSha256, ...withoutHash } = integration;
  if (sha256(withoutHash) !== integrationSha256) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot integration hash does not match its canonical payload.",
    );
  }
  if (
    integration.productionPlan.planId !== plan.planId ||
    integration.productionPlan.planSha256 !== plan.planSha256 ||
    integration.productionPlan.targetRepository !== plan.project.targetRepository ||
    integration.productionPlan.runtimeRoot !== plan.project.runtimeRoot ||
    integration.productionPlan.engine !== "Godot" ||
    integration.productionPlan.engineVersion !== "4.6.2" ||
    integration.target.engine !== "Godot" ||
    integration.target.engineVersion !== "4.6.2" ||
    integration.target.runtimeRoot !== plan.project.runtimeRoot
  ) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot integration is not bound to the supplied production plan and Godot 4.6.2 target.",
    );
  }
  if (
    integration.assembly.assemblyId !== assembly.assemblyId ||
    integration.assembly.manifestSha256 !== assembly.manifestSha256 ||
    integration.assembly.scope !== assembly.scope ||
    integration.assembly.runtimeReady !== assembly.readiness.runtimeReady ||
    integration.assembly.candidateOnly !== assembly.readiness.candidateOnly
  ) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot integration is not bound to the supplied assembly manifest.",
    );
  }
  if (
    integration.pixelPolicy.textureFilter !== "nearest" ||
    integration.pixelPolicy.textureRepeat !== "disabled" ||
    integration.pixelPolicy.mipmaps !== false ||
    integration.pixelPolicy.compression !== "lossless" ||
    integration.pixelPolicy.snapTransformsToPixel !== true ||
    integration.pixelPolicy.snapVerticesToPixel !== false ||
    integration.pixelPolicy.centeredSprites !== false ||
    integration.pixelPolicy.integerPositions !== true
  ) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot pixel policy has drifted from the exact pixel-art contract.",
    );
  }
  if (
    integration.outputs.scenePath !== assembly.outputs.godotScenePath ||
    integration.outputs.routeResourcePath !== assembly.outputs.routeGraphPath ||
    integration.outputs.placementResourcePath !== assembly.outputs.placementManifestPath
  ) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot outputs do not match the assembly output contract.",
    );
  }
  const outputPaths = Object.values(integration.outputs);
  if (new Set(outputPaths).size !== outputPaths.length) {
    fail("LAYERED_GODOT_PLAN_INVALID", "Layered Godot output paths are not unique.");
  }
  for (const [name, path] of Object.entries(integration.outputs)) {
    relativePath(path, `integration.outputs.${name}`);
    if (
      name !== "scenePath" &&
      !path.startsWith(`${plan.project.runtimeRoot}/`)
    ) {
      fail(
        "LAYERED_GODOT_PLAN_INVALID",
        `Layered Godot output ${name} escapes the production runtime root.`,
      );
    }
  }

  const resourcePaths = integration.resources.map((resource) => resource.path);
  const resourceKinds = integration.resources.map((resource) => resource.kind);
  if (
    new Set(resourcePaths).size !== resourcePaths.length ||
    new Set(resourceKinds).size !== resourceKinds.length ||
    integration.resources.length !== 7
  ) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot resource drafts must contain seven unique paths and kinds.",
    );
  }
  for (const resource of integration.resources) verifyDraft(resource);
  const sceneResource = integration.resources.find(
    (resource) => resource.kind === "scene-draft",
  );
  if (
    !sceneResource ||
    sceneResource.path !== integration.scene.path ||
    sceneResource.content !== integration.scene.tscnDraft ||
    sceneResource.sha256 !== integration.scene.tscnSha256 ||
    sceneResource.bytes !== integration.scene.tscnBytes ||
    !/^\[gd_scene load_steps=\d+ format=3\]\n/.test(
      integration.scene.tscnDraft,
    )
  ) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot TSCN draft identity or Godot 4 format header is invalid.",
    );
  }

  const externalIds = integration.externalResources.map((resource) => resource.id);
  const externalPaths = integration.externalResources.map((resource) => resource.path);
  if (
    new Set(externalIds).size !== externalIds.length ||
    new Set(externalPaths).size !== externalPaths.length
  ) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot external resource identities or paths are duplicated.",
    );
  }
  const scripts = integration.externalResources.filter(
    (resource) => resource.type === "Script",
  );
  const textures = integration.externalResources.filter(
    (resource) => resource.type === "Texture2D",
  );
  if (scripts.length !== 5 || textures.length !== assembly.sources.length) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot external resources do not cover the exact script roles and retained source textures.",
    );
  }
  const expectedScripts = new Map([
    ["script_root", integration.runtime.rootScriptPath],
    ["script_route", integration.runtime.routeControllerScriptPath],
    ["script_camera", integration.runtime.cameraControllerScriptPath],
    ["script_destination", integration.runtime.destinationTriggerScriptPath],
    ["script_actor", integration.runtime.actorControllerScriptPath],
  ]);
  for (const script of scripts) {
    if (expectedScripts.get(script.id) !== script.path) {
      fail(
        "LAYERED_GODOT_PLAN_INVALID",
        `Layered Godot script ${script.id} is not bound to its declared runtime dependency.`,
      );
    }
  }
  const sourceByUnit = new Map(assembly.sources.map((source) => [source.unitId, source]));
  const planUnits = new Map(
    plan.layers.flatMap((layer) => layer.units).map((unit) => [unit.id, unit]),
  );
  for (const texture of textures) {
    const unitId = texture.sourceUnitId;
    const source = unitId ? sourceByUnit.get(unitId) : undefined;
    const unit = unitId ? planUnits.get(unitId) : undefined;
    if (
      !unitId ||
      !source ||
      !unit ||
      texture.path !== unit.targetPath ||
      texture.sourceSha256 !== source.sha256
    ) {
      fail(
        "LAYERED_GODOT_PLAN_INVALID",
        `Layered Godot texture ${texture.id} is not bound to one exact source unit.`,
      );
    }
  }

  const animationIds = integration.animationResources.map((animation) => animation.id);
  const animationSetIds = integration.animationResources.map(
    (animation) => animation.animationSetId,
  );
  if (
    new Set(animationIds).size !== animationIds.length ||
    new Set(animationSetIds).size !== animationSetIds.length ||
    integration.animationResources.length !== assembly.animationSets.length
  ) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot animation resources do not match the assembly animation sets.",
    );
  }
  for (const animation of integration.animationResources) {
    const sourceSet = assembly.animationSets.find(
      (entry) => entry.id === animation.animationSetId,
    );
    if (!sourceSet || animation.clips.length !== sourceSet.clips.length) {
      fail(
        "LAYERED_GODOT_PLAN_INVALID",
        `Layered Godot animation ${animation.animationSetId} is incomplete.`,
      );
    }
    for (const clip of animation.clips) {
      const sourceClip = sourceSet.clips.find((entry) => entry.clipId === clip.clipId);
      if (
        !sourceClip ||
        clip.framesPerSecond !== sourceClip.framesPerSecond ||
        clip.loop !== sourceClip.loop ||
        clip.frames.length !== sourceClip.unitIds.length ||
        clip.frames.some(
          (frame, index) =>
            frame.unitId !== sourceClip.unitIds[index] ||
            frame.frameNumber !== sourceClip.suppliedFrameNumbers[index],
        )
      ) {
        fail(
          "LAYERED_GODOT_PLAN_INVALID",
          `Layered Godot animation clip ${clip.clipId} has drifted from the assembly timing or frame order.`,
        );
      }
    }
  }

  const nodePaths = integration.scene.nodes.map((node) => node.path);
  if (
    new Set(nodePaths).size !== nodePaths.length ||
    integration.scene.nodes.filter((node) => node.path === ".").length !== 1 ||
    integration.scene.nodes[0]?.path !== "." ||
    integration.scene.nodes[0]?.name !== integration.scene.rootNodeName
  ) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot scene tree must contain one canonical root and unique node paths.",
    );
  }
  const pathSet = new Set(nodePaths);
  for (const node of integration.scene.nodes) {
    if (
      node.parent !== undefined &&
      node.parent !== "." &&
      !pathSet.has(node.parent)
    ) {
      fail(
        "LAYERED_GODOT_PLAN_INVALID",
        `Layered Godot node ${node.path} references missing parent ${node.parent}.`,
      );
    }
    if (
      node.position &&
      (!Number.isInteger(node.position.x) || !Number.isInteger(node.position.y))
    ) {
      fail(
        "LAYERED_GODOT_PLAN_INVALID",
        `Layered Godot node ${node.path} has a non-integer position.`,
      );
    }
  }
  const placementNodes = integration.scene.nodes.filter(
    (node) => node.placementId !== undefined,
  );
  const placements = assembly.layers.flatMap((layer) => layer.placements);
  if (
    placementNodes.length !== placements.length ||
    placements.some(
      (placement) =>
        placementNodes.filter((node) => node.placementId === placement.id).length !== 1,
    )
  ) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot scene does not contain exactly one visual node per assembly placement.",
    );
  }
  const actorNode = placementNodes.find(
    (node) => node.placementId === integration.runtime.actorPlacementId,
  );
  if (
    !actorNode ||
    actorNode.type !== "AnimatedSprite2D" ||
    actorNode.scriptResourceId !== "script_actor" ||
    actorNode.routeNodeId !== assembly.routeGraph.startNodeId
  ) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot route actor node is not bound to the selected animated start placement.",
    );
  }
  if (
    integration.scene.nodes.filter((node) => node.cameraMode !== undefined).length !== 3 ||
    integration.scene.nodes.filter((node) => node.destinationId !== undefined).length !==
      assembly.routeGraph.destinations.length ||
    integration.scene.nodes.filter(
      (node) =>
        node.routeNodeId !== undefined &&
        node.destinationId === undefined &&
        node.placementId === undefined,
    ).length !== assembly.routeGraph.nodes.length
  ) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot camera, destination or route marker nodes are incomplete.",
    );
  }

  if (integration.writeIntents.length !== integration.resources.length) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot write intents do not cover every resource draft.",
    );
  }
  for (const intent of integration.writeIntents) {
    const resource = integration.resources.find((entry) => entry.path === intent.path);
    if (
      !resource ||
      intent.operation !== "create-or-replace" ||
      intent.mediaType !== resource.mediaType ||
      intent.sha256 !== resource.sha256 ||
      intent.bytes !== resource.bytes ||
      intent.content !== resource.content ||
      intent.requiresExplicitRepositoryWriter !== true ||
      intent.expectedRepository !== plan.project.targetRepository
    ) {
      fail(
        "LAYERED_GODOT_PLAN_INVALID",
        `Layered Godot write intent ${intent.path} is not an exact bounded copy of its draft.`,
      );
    }
  }
  const expectedHandoffReady = assembly.readiness.runtimeReady;
  if (
    integration.readiness.handoffReady !== expectedHandoffReady ||
    integration.readiness.reviewOnly === expectedHandoffReady ||
    integration.readiness.requiresExplicitRepositoryWriter !== true ||
    integration.readiness.runtimeActivationRequired !== true ||
    (expectedHandoffReady && integration.readiness.blockers.length !== 0) ||
    (!expectedHandoffReady && integration.readiness.blockers.length < 1)
  ) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot handoff readiness does not match the assembly approval state.",
    );
  }
  if (
    integration.authority.planningOnly !== true ||
    Object.entries(integration.authority).some(
      ([key, value]) => key !== "planningOnly" && value !== false,
    )
  ) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot authority must remain planning-only with every execution capability false.",
    );
  }

  const expectedTotals = {
    externalResources: integration.externalResources.length,
    textureResources: textures.length,
    scriptResources: scripts.length,
    animationResources: integration.animationResources.length,
    sceneNodes: integration.scene.nodes.length,
    placementNodes: placementNodes.length,
    routeMarkerNodes: assembly.routeGraph.nodes.length,
    destinationNodes: assembly.routeGraph.destinations.length,
    cameraNodes: 3,
    resourceDrafts: integration.resources.length,
    writeIntents: integration.writeIntents.length,
  };
  if (JSON.stringify(integration.totals) !== JSON.stringify(expectedTotals)) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot totals do not match the retained integration content.",
    );
  }

  const reconstructedRequest = {
    schemaVersion: "1.0" as const,
    kind: LAYERED_GODOT_REQUEST_KIND,
    integrationId: integration.integrationId,
    revision: integration.revision,
    assemblyId: integration.assembly.assemblyId,
    target: integration.target,
    pixelPolicy: integration.pixelPolicy,
    runtime: integration.runtime,
    outputs: integration.outputs,
    ...(integration.metadata === undefined
      ? {}
      : { metadata: integration.metadata }),
  };
  const expectedRequestSha256 = sha256({
    productionPlanSha256: plan.planSha256,
    assemblyManifestSha256: assembly.manifestSha256,
    request: reconstructedRequest,
  });
  if (integration.requestSha256 !== expectedRequestSha256) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot request hash does not match the retained compiler inputs.",
    );
  }
  const expected = compileLayeredGodotIntegrationPlan(
    plan,
    assembly,
    reconstructedRequest,
  );
  if (expected.integrationSha256 !== integration.integrationSha256) {
    fail(
      "LAYERED_GODOT_PLAN_INVALID",
      "Layered Godot integration does not exactly match deterministic recompilation.",
    );
  }
  return true;
}
