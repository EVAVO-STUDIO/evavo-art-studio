import { createHash } from "node:crypto";

import type {
  CompiledLayeredProductionPlan,
  CompiledLayeredProductionUnit,
} from "./layered-production-types.js";
import {
  exactKeys,
  fail,
  freeze,
  idValue,
  record,
  relativePath,
  sha256,
  stringValue,
} from "./layered-production-internal.js";
import { verifyLayeredProductionPlan } from "./layered-production-plan.js";
import type {
  CompiledLayeredAssemblyManifest,
  CompiledLayeredAssemblyPlacement,
} from "./layered-production-assembly-types.js";
import { verifyLayeredAssemblyManifest } from "./layered-production-assembly-verification.js";
import type {
  CompiledLayeredGodotAnimationResource,
  CompiledLayeredGodotExternalResource,
  CompiledLayeredGodotIntegrationPlan,
  CompiledLayeredGodotNode,
  CompiledLayeredGodotResourceDraft,
  LayeredGodotIntegrationRequestInput,
  LayeredGodotCameraMode,
  LayeredGodotRenderer,
  LayeredGodotResourceKind,
  LayeredGodotTravelUnit,
} from "./layered-production-godot-types.js";
import {
  LAYERED_GODOT_PLAN_KIND,
  LAYERED_GODOT_PROTOCOL_VERSION,
  LAYERED_GODOT_REQUEST_KIND,
} from "./layered-production-godot-types.js";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const GODOT_NODE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SCRIPT_ROLES = ["root", "route", "camera", "destination", "actor"] as const;
const CAMERA_MODES = new Set<LayeredGodotCameraMode>([
  "overview",
  "journey-follow",
  "destination-close",
]);
const RENDERERS = new Set<LayeredGodotRenderer>([
  "gl_compatibility",
  "mobile",
  "forward_plus",
]);
const TRAVEL_UNITS = new Set<LayeredGodotTravelUnit>(["turn", "tick", "step"]);

function literal<T extends string | boolean>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) {
    fail("LAYERED_GODOT_INPUT_INVALID", `${label} must equal ${String(expected)}.`);
  }
  return expected;
}

function semver(value: unknown, label: string): string {
  const output = stringValue(value, label, 40);
  if (!SEMVER_PATTERN.test(output)) {
    fail("LAYERED_GODOT_INPUT_INVALID", `${label} must be semantic version x.y.z.`);
  }
  return output;
}

function safePath(value: unknown, label: string, extension: string): string {
  const output = relativePath(value, label);
  if (!output.endsWith(extension)) {
    fail("LAYERED_GODOT_PATH_INVALID", `${label} must end with ${extension}.`);
  }
  return output;
}

function underRoot(path: string, root: string, label: string): string {
  if (!path.startsWith(`${root}/`)) {
    fail("LAYERED_GODOT_PATH_INVALID", `${label} must remain under ${root}.`);
  }
  return path;
}

function godotNodeName(value: string, fallback: string): string {
  const output = value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("");
  const candidate = output.length > 0 ? output : fallback;
  return /^[A-Za-z_]/.test(candidate) ? candidate : `N${candidate}`;
}

function godotId(value: string): string {
  const output = value.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(output) ? output : `r_${output}`;
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function resPath(value: string): string {
  return `res://${value}`;
}

function fileSha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function resourceDraft(
  kind: LayeredGodotResourceKind,
  path: string,
  mediaType: CompiledLayeredGodotResourceDraft["mediaType"],
  content: string,
): CompiledLayeredGodotResourceDraft {
  return freeze({
    kind,
    path,
    mediaType,
    sha256: fileSha256(content),
    bytes: Buffer.byteLength(content, "utf8"),
    content,
  });
}

function jsonContent(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function unitMap(plan: CompiledLayeredProductionPlan) {
  return new Map(
    plan.layers.flatMap((layer) => layer.units).map((unit) => [unit.id, unit]),
  );
}

function placementList(
  assembly: CompiledLayeredAssemblyManifest,
): readonly CompiledLayeredAssemblyPlacement[] {
  return assembly.layers.flatMap((layer) => layer.placements);
}

function scriptResource(
  role: (typeof SCRIPT_ROLES)[number],
  path: string,
): CompiledLayeredGodotExternalResource {
  return freeze({ id: `script_${role}`, type: "Script" as const, path });
}

function buildExternalResources(
  plan: CompiledLayeredProductionPlan,
  assembly: CompiledLayeredAssemblyManifest,
  scripts: Readonly<Record<(typeof SCRIPT_ROLES)[number], string>>,
): readonly CompiledLayeredGodotExternalResource[] {
  const units = unitMap(plan);
  const resources: CompiledLayeredGodotExternalResource[] = SCRIPT_ROLES.map(
    (role) => scriptResource(role, scripts[role]),
  );
  const sortedSources = [...assembly.sources].sort((left, right) =>
    left.unitId.localeCompare(right.unitId),
  );
  sortedSources.forEach((source, index) => {
    const unit = units.get(source.unitId);
    if (!unit) {
      fail(
        "LAYERED_GODOT_SOURCE_INVALID",
        `Assembly source ${source.unitId} is missing from the production plan.`,
      );
    }
    resources.push(
      freeze({
        id: `tex_${String(index + 1).padStart(3, "0")}_${godotId(source.unitId)}`,
        type: "Texture2D" as const,
        path: unit.targetPath,
        sourceUnitId: source.unitId,
        sourceSha256: source.sha256,
      }),
    );
  });
  return freeze(resources);
}

function buildAnimationResources(
  plan: CompiledLayeredProductionPlan,
  assembly: CompiledLayeredAssemblyManifest,
  externalResources: readonly CompiledLayeredGodotExternalResource[],
): readonly CompiledLayeredGodotAnimationResource[] {
  const units = unitMap(plan);
  const textureByUnit = new Map(
    externalResources
      .filter((resource) => resource.sourceUnitId !== undefined)
      .map((resource) => [resource.sourceUnitId ?? "", resource]),
  );
  return freeze(
    assembly.animationSets.map((set, index) =>
      freeze({
        id: `SpriteFrames_${String(index + 1).padStart(3, "0")}_${godotId(set.id)}`,
        animationSetId: set.id,
        layerId: set.layerId,
        layerRole: set.layerRole,
        clips: freeze(
          set.clips.map((clip) =>
            freeze({
              clipId: clip.clipId,
              framesPerSecond: clip.framesPerSecond,
              loop: clip.loop,
              frames: freeze(
                clip.unitIds.map((unitId, frameIndex) => {
                  const unit = units.get(unitId);
                  const texture = textureByUnit.get(unitId);
                  const source = assembly.sources.find((entry) => entry.unitId === unitId);
                  if (!unit || !texture || !source) {
                    fail(
                      "LAYERED_GODOT_ANIMATION_INVALID",
                      `Animation frame ${unitId} is missing its plan unit, texture resource or source evidence.`,
                    );
                  }
                  return freeze({
                    frameNumber: clip.suppliedFrameNumbers[frameIndex] ?? frameIndex + 1,
                    unitId,
                    textureResourceId: texture.id,
                    targetPath: unit.targetPath,
                    sourceSha256: source.sha256,
                  });
                }),
              ),
            }),
          ),
        ),
      }),
    ),
  );
}

function placementGroups(placement: CompiledLayeredAssemblyPlacement): readonly string[] {
  const groups = [
    "evavo_layered_placement",
    `evavo_layer_${placement.layerId}`,
    `evavo_role_${placement.layerRole}`,
  ];
  if (placement.mode === "dynamic") groups.push("evavo_route_actor");
  if (placement.instanceGroup) groups.push(placement.instanceGroup);
  return freeze([...new Set(groups)]);
}

function buildSceneNodes(
  assembly: CompiledLayeredAssemblyManifest,
  rootNodeName: string,
  actorPlacementId: string,
  externalResources: readonly CompiledLayeredGodotExternalResource[],
  animations: readonly CompiledLayeredGodotAnimationResource[],
  outputs: LayeredGodotIntegrationRequestInput["outputs"],
): readonly CompiledLayeredGodotNode[] {
  const textureByUnit = new Map(
    externalResources
      .filter((resource) => resource.sourceUnitId !== undefined)
      .map((resource) => [resource.sourceUnitId ?? "", resource.id]),
  );
  const animationById = new Map(
    animations.map((resource) => [resource.animationSetId, resource]),
  );
  const nodes: CompiledLayeredGodotNode[] = [
    freeze({
      path: ".",
      name: rootNodeName,
      type: "Node2D" as const,
      groups: freeze(["evavo_layered_district"]),
      scriptResourceId: "script_root",
    }),
    freeze({
      path: "Layers",
      name: "Layers",
      type: "Node2D" as const,
      parent: ".",
      groups: freeze(["evavo_layer_container"]),
      dataResourcePath: outputs.placementResourcePath,
    }),
  ];

  for (const layer of assembly.layers) {
    const layerName = `Layer_${godotNodeName(layer.id, "Layer")}`;
    const layerPath = `Layers/${layerName}`;
    nodes.push(
      freeze({
        path: layerPath,
        name: layerName,
        type: "Node2D" as const,
        parent: "Layers",
        groups: freeze(["evavo_layer", `evavo_layer_${layer.id}`]),
        zIndex: layer.zOrder,
        ySortEnabled: layer.ySortMode !== "none",
        layerId: layer.id,
        layerRole: layer.role,
      }),
    );
    for (const placement of layer.placements) {
      const name = `Placement_${godotNodeName(placement.id, "Placement")}`;
      const animation =
        placement.source.kind === "animation-set"
          ? animationById.get(placement.source.id)
          : undefined;
      const unitId = placement.source.kind === "unit" ? placement.source.id : undefined;
      const textureResourceId =
        unitId === undefined ? undefined : textureByUnit.get(unitId);
      if (placement.source.kind === "animation-set" && !animation) {
        fail(
          "LAYERED_GODOT_ANIMATION_INVALID",
          `Placement ${placement.id} references missing animation set ${placement.source.id}.`,
        );
      }
      if (unitId !== undefined && !textureResourceId) {
        fail(
          "LAYERED_GODOT_SOURCE_INVALID",
          `Placement ${placement.id} references missing texture source ${unitId}.`,
        );
      }
      const baseline = placement.ySortOrigin
        ? {
            x: placement.position.x + placement.ySortOrigin.x,
            y: placement.position.y + placement.ySortOrigin.y,
          }
        : placement.position;
      const visualOffset = placement.ySortOrigin
        ? { x: -placement.ySortOrigin.x, y: -placement.ySortOrigin.y }
        : { x: 0, y: 0 };
      nodes.push(
        freeze({
          path: `${layerPath}/${name}`,
          name,
          type: animation ? ("AnimatedSprite2D" as const) : ("Sprite2D" as const),
          parent: layerPath,
          groups: placementGroups(placement),
          position: freeze(baseline),
          visualOffset: freeze(visualOffset),
          ...(textureResourceId ? { textureResourceId } : {}),
          ...(animation ? { spriteFramesResourceId: animation.id } : {}),
          ...(placement.mode === "dynamic"
            ? { scriptResourceId: "script_actor" }
            : {}),
          placementId: placement.id,
          ...(placement.routeNodeId ? { routeNodeId: placement.routeNodeId } : {}),
          ...(placement.occlusionGroupId
            ? { occlusionGroupId: placement.occlusionGroupId }
            : {}),
          dataResourcePath: animation
            ? outputs.animationResourcePath
            : outputs.placementResourcePath,
          layerId: placement.layerId,
          layerRole: placement.layerRole,
        }),
      );
    }
  }

  nodes.push(
    freeze({
      path: "RouteGraph",
      name: "RouteGraph",
      type: "Node2D" as const,
      parent: ".",
      groups: freeze(["evavo_route_graph"]),
      scriptResourceId: "script_route",
      dataResourcePath: outputs.routeResourcePath,
    }),
  );
  for (const routeNode of assembly.routeGraph.nodes) {
    const name = `Route_${godotNodeName(routeNode.id, "Node")}`;
    nodes.push(
      freeze({
        path: `RouteGraph/${name}`,
        name,
        type: "Marker2D" as const,
        parent: "RouteGraph",
        groups: freeze(["evavo_route_node", `evavo_route_kind_${routeNode.kind}`]),
        position: routeNode.position,
        routeNodeId: routeNode.id,
        routeKind: routeNode.kind,
      }),
    );
  }

  nodes.push(
    freeze({
      path: "Destinations",
      name: "Destinations",
      type: "Node2D" as const,
      parent: ".",
      groups: freeze(["evavo_destination_container"]),
      dataResourcePath: outputs.routeResourcePath,
    }),
  );
  for (const destination of assembly.routeGraph.destinations) {
    const name = `Destination_${godotNodeName(destination.id, "Destination")}`;
    nodes.push(
      freeze({
        path: `Destinations/${name}`,
        name,
        type: "Marker2D" as const,
        parent: "Destinations",
        groups: freeze(["evavo_destination"]),
        position: destination.entrance,
        scriptResourceId: "script_destination",
        routeNodeId: destination.nodeId,
        destinationId: destination.id,
        interactionId: destination.interactionId,
        targetScenePath: destination.targetScenePath,
        dataResourcePath: outputs.routeResourcePath,
      }),
    );
  }

  const actor = placementList(assembly).find(
    (placement) => placement.id === actorPlacementId,
  );
  if (!actor) {
    fail(
      "LAYERED_GODOT_RUNTIME_INVALID",
      `runtime.actorPlacementId references unknown placement ${actorPlacementId}.`,
    );
  }
  nodes.push(
    freeze({
      path: "Cameras",
      name: "Cameras",
      type: "Node2D" as const,
      parent: ".",
      groups: freeze(["evavo_camera_controller"]),
      scriptResourceId: "script_camera",
      dataResourcePath: outputs.cameraResourcePath,
    }),
  );
  const overview = assembly.camera.overview;
  const destination = assembly.routeGraph.destinations[0];
  const cameraDefinitions: readonly Readonly<{
    mode: LayeredGodotCameraMode;
    position: Readonly<{ x: number; y: number }>;
  }>[] = [
    {
      mode: "overview",
      position: {
        x: overview.bounds.x + Math.floor(overview.bounds.width / 2),
        y: overview.bounds.y + Math.floor(overview.bounds.height / 2),
      },
    },
    {
      mode: "journey-follow",
      position: actor.ySortOrigin
        ? {
            x: actor.position.x + actor.ySortOrigin.x,
            y: actor.position.y + actor.ySortOrigin.y,
          }
        : actor.position,
    },
    {
      mode: "destination-close",
      position: destination?.entrance ?? {
        x: Math.floor(assembly.district.dimensions.width / 2),
        y: Math.floor(assembly.district.dimensions.height / 2),
      },
    },
  ];
  for (const definition of cameraDefinitions) {
    const name = `Camera_${godotNodeName(definition.mode, "Camera")}`;
    nodes.push(
      freeze({
        path: `Cameras/${name}`,
        name,
        type: "Camera2D" as const,
        parent: "Cameras",
        groups: freeze(["evavo_camera", `evavo_camera_${definition.mode}`]),
        position: freeze(definition.position),
        cameraMode: definition.mode,
      }),
    );
  }

  const paths = nodes.map((node) => node.path);
  if (new Set(paths).size !== paths.length) {
    fail("LAYERED_GODOT_SCENE_INVALID", "Compiled Godot scene contains duplicate node paths.");
  }
  return freeze(nodes);
}

function renderGroups(groups: readonly string[]): string {
  return `[${groups.map((group) => quote(group)).join(", ")}]`;
}

function renderSpriteFrames(
  animation: CompiledLayeredGodotAnimationResource,
): readonly string[] {
  const entries = animation.clips.map((clip) => {
    const frames = clip.frames
      .map(
        (frame) =>
          `{\n"duration": 1.0,\n"texture": ExtResource(${quote(frame.textureResourceId)})\n}`,
      )
      .join(", ");
    return `{\n"frames": [${frames}],\n"loop": ${clip.loop ? "true" : "false"},\n"name": &${quote(clip.clipId)},\n"speed": ${Number.isInteger(clip.framesPerSecond) ? `${clip.framesPerSecond}.0` : clip.framesPerSecond}\n}`;
  });
  return [
    `[sub_resource type="SpriteFrames" id=${quote(animation.id)}]`,
    `animations = [${entries.join(", ")}]`,
    "",
  ];
}

function renderNode(
  node: CompiledLayeredGodotNode,
  assembly: CompiledLayeredAssemblyManifest,
  animations: readonly CompiledLayeredGodotAnimationResource[],
  defaultCameraMode: LayeredGodotCameraMode,
): readonly string[] {
  const headingParts = [
    `[node name=${quote(node.name)} type=${quote(node.type)}`,
    ...(node.parent ? [` parent=${quote(node.parent)}`] : []),
    ...(node.groups.length ? [` groups=${renderGroups(node.groups)}`] : []),
    ["]"],
  ].flat();
  const lines = [headingParts.join("")];
  if (node.position) lines.push(`position = Vector2(${node.position.x}, ${node.position.y})`);
  if (node.zIndex !== undefined) lines.push(`z_index = ${node.zIndex}`);
  if (node.ySortEnabled === true) lines.push("y_sort_enabled = true");
  if (node.type === "Sprite2D" || node.type === "AnimatedSprite2D") {
    lines.push("texture_filter = 1", "texture_repeat = 1", "centered = false");
    if (node.visualOffset && (node.visualOffset.x !== 0 || node.visualOffset.y !== 0)) {
      lines.push(`offset = Vector2(${node.visualOffset.x}, ${node.visualOffset.y})`);
    }
  }
  if (node.textureResourceId) {
    lines.push(`texture = ExtResource(${quote(node.textureResourceId)})`);
  }
  if (node.spriteFramesResourceId) {
    const animation = animations.find((entry) => entry.id === node.spriteFramesResourceId);
    const firstClip = animation?.clips[0];
    lines.push(`sprite_frames = SubResource(${quote(node.spriteFramesResourceId)})`);
    if (firstClip) {
      lines.push(`animation = &${quote(firstClip.clipId)}`);
      if (firstClip.loop) lines.push(`autoplay = ${quote(firstClip.clipId)}`);
    }
  }
  if (node.scriptResourceId) {
    lines.push(`script = ExtResource(${quote(node.scriptResourceId)})`);
  }
  if (node.cameraMode) {
    const camera =
      node.cameraMode === "overview"
        ? assembly.camera.overview
        : node.cameraMode === "journey-follow"
          ? assembly.camera.journeyFollow
          : assembly.camera.destinationClose;
    lines.push(`zoom = Vector2(${camera.zoom}, ${camera.zoom})`);
    lines.push(`enabled = ${node.cameraMode === defaultCameraMode ? "true" : "false"}`);
    lines.push("position_smoothing_enabled = false");
    lines.push("limit_left = 0");
    lines.push("limit_top = 0");
    lines.push(`limit_right = ${assembly.district.dimensions.width}`);
    lines.push(`limit_bottom = ${assembly.district.dimensions.height}`);
    lines.push(`metadata/camera_mode = ${quote(node.cameraMode)}`);
  }
  if (node.placementId) lines.push(`metadata/placement_id = ${quote(node.placementId)}`);
  if (node.routeNodeId) lines.push(`metadata/route_node_id = ${quote(node.routeNodeId)}`);
  if (node.destinationId) lines.push(`metadata/destination_id = ${quote(node.destinationId)}`);
  if (node.routeKind) lines.push(`metadata/route_kind = ${quote(node.routeKind)}`);
  if (node.interactionId) lines.push(`metadata/interaction_id = ${quote(node.interactionId)}`);
  if (node.targetScenePath) {
    lines.push(`metadata/target_scene_path = ${quote(resPath(node.targetScenePath))}`);
  }
  if (node.occlusionGroupId) {
    lines.push(`metadata/occlusion_group_id = ${quote(node.occlusionGroupId)}`);
  }
  if (node.dataResourcePath) {
    lines.push(`metadata/data_resource_path = ${quote(resPath(node.dataResourcePath))}`);
  }
  if (node.layerId) lines.push(`metadata/layer_id = ${quote(node.layerId)}`);
  if (node.layerRole) lines.push(`metadata/layer_role = ${quote(node.layerRole)}`);
  lines.push("");
  return lines;
}

function renderScene(
  integrationId: string,
  assembly: CompiledLayeredAssemblyManifest,
  externalResources: readonly CompiledLayeredGodotExternalResource[],
  animations: readonly CompiledLayeredGodotAnimationResource[],
  nodes: readonly CompiledLayeredGodotNode[],
  defaultCameraMode: LayeredGodotCameraMode,
  outputs: LayeredGodotIntegrationRequestInput["outputs"],
  renderer: LayeredGodotRenderer,
): string {
  const loadSteps = 1 + externalResources.length + animations.length;
  const lines = [`[gd_scene load_steps=${loadSteps} format=3]`, ""];
  for (const resource of externalResources) {
    lines.push(
      `[ext_resource type=${quote(resource.type)} path=${quote(resPath(resource.path))} id=${quote(resource.id)}]`,
    );
  }
  lines.push("");
  for (const animation of animations) lines.push(...renderSpriteFrames(animation));
  for (const node of nodes) {
    lines.push(...renderNode(node, assembly, animations, defaultCameraMode));
    if (node.path === ".") {
      lines.splice(
        lines.length - 1,
        0,
        `metadata/integration_id = ${quote(integrationId)}`,
        `metadata/assembly_manifest_sha256 = ${quote(assembly.manifestSha256)}`,
        `metadata/integration_manifest_path = ${quote(resPath(outputs.integrationManifestPath))}`,
        `metadata/route_resource_path = ${quote(resPath(outputs.routeResourcePath))}`,
        `metadata/placement_resource_path = ${quote(resPath(outputs.placementResourcePath))}`,
        `metadata/animation_resource_path = ${quote(resPath(outputs.animationResourcePath))}`,
        `metadata/camera_resource_path = ${quote(resPath(outputs.cameraResourcePath))}`,
        `metadata/import_policy_path = ${quote(resPath(outputs.importPolicyPath))}`,
        `metadata/renderer = ${quote(renderer)}`,
      );
    }
  }
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

function placementResourcePayload(
  plan: CompiledLayeredProductionPlan,
  assembly: CompiledLayeredAssemblyManifest,
) {
  const units = unitMap(plan);
  return {
    schemaVersion: "1.0",
    kind: "evavo.layered-production.godot-placement-resource",
    assemblyId: assembly.assemblyId,
    assemblyManifestSha256: assembly.manifestSha256,
    district: assembly.district,
    layers: assembly.layers.map((layer) => ({
      id: layer.id,
      role: layer.role,
      zOrder: layer.zOrder,
      ySortMode: layer.ySortMode,
      placements: layer.placements.map((placement) => ({
        ...placement,
        sourcePaths: placement.sourceUnitIds.map((unitId) => {
          const unit = units.get(unitId);
          if (!unit) {
            fail(
              "LAYERED_GODOT_SOURCE_INVALID",
              `Placement ${placement.id} references missing unit ${unitId}.`,
            );
          }
          return unit.targetPath;
        }),
      })),
    })),
    occlusionGroups: assembly.occlusionGroups,
  };
}

function routeResourcePayload(
  assembly: CompiledLayeredAssemblyManifest,
  travelUnit: LayeredGodotTravelUnit,
) {
  return {
    schemaVersion: "1.0",
    kind: "evavo.layered-production.godot-route-resource",
    assemblyId: assembly.assemblyId,
    assemblyManifestSha256: assembly.manifestSha256,
    districtWorldOrigin: assembly.district.worldOrigin,
    startNodeId: assembly.routeGraph.startNodeId,
    travelUnit,
    nodes: assembly.routeGraph.nodes.map((node) => ({
      ...node,
      worldPosition: {
        x: assembly.district.worldOrigin.x + node.position.x,
        y: assembly.district.worldOrigin.y + node.position.y,
      },
    })),
    edges: assembly.routeGraph.edges,
    destinations: assembly.routeGraph.destinations,
    reachableNodeCount: assembly.routeGraph.reachableNodeCount,
    totalTravelCost: assembly.routeGraph.totalTravelCost,
  };
}

function animationResourcePayload(
  assembly: CompiledLayeredAssemblyManifest,
  animations: readonly CompiledLayeredGodotAnimationResource[],
) {
  return {
    schemaVersion: "1.0",
    kind: "evavo.layered-production.godot-animation-resource",
    assemblyId: assembly.assemblyId,
    assemblyManifestSha256: assembly.manifestSha256,
    animationSets: animations,
  };
}

function cameraResourcePayload(
  assembly: CompiledLayeredAssemblyManifest,
  actorPlacementId: string,
  defaultMode: LayeredGodotCameraMode,
) {
  return {
    schemaVersion: "1.0",
    kind: "evavo.layered-production.godot-camera-resource",
    assemblyId: assembly.assemblyId,
    assemblyManifestSha256: assembly.manifestSha256,
    actorPlacementId,
    defaultMode,
    districtBounds: {
      x: 0,
      y: 0,
      width: assembly.district.dimensions.width,
      height: assembly.district.dimensions.height,
    },
    overview: assembly.camera.overview,
    journeyFollow: assembly.camera.journeyFollow,
    destinationClose: assembly.camera.destinationClose,
  };
}

function importPolicyPayload(
  plan: CompiledLayeredProductionPlan,
  assembly: CompiledLayeredAssemblyManifest,
) {
  const units = unitMap(plan);
  return {
    schemaVersion: "1.0",
    kind: "evavo.layered-production.godot-import-policy",
    engine: "Godot",
    engineVersion: "4.6.2",
    projectSettings: {
      "rendering/2d/snap/snap_2d_transforms_to_pixel": true,
      "rendering/2d/snap/snap_2d_vertices_to_pixel": false,
    },
    canvasItemDefaults: {
      textureFilter: "nearest",
      textureFilterEnum: 1,
      textureRepeat: "disabled",
      textureRepeatEnum: 1,
      centeredSprites: false,
      integerPositions: true,
    },
    textureImports: assembly.sources.map((source) => {
      const unit = units.get(source.unitId);
      if (!unit) {
        fail(
          "LAYERED_GODOT_SOURCE_INVALID",
          `Import policy source ${source.unitId} is missing from the production plan.`,
        );
      }
      return {
        unitId: source.unitId,
        path: unit.targetPath,
        sourceSha256: source.sha256,
        dimensions: { width: source.width, height: source.height },
        importer: {
          compression: "lossless",
          mipmaps: false,
        },
        runtimeSampling: {
          owner: "CanvasItem",
          filter: "nearest",
          filterEnum: 1,
          repeat: "disabled",
          repeatEnum: 1,
        },
      };
    }),
  };
}

export function compileLayeredGodotIntegrationPlan(
  plan: CompiledLayeredProductionPlan,
  assembly: CompiledLayeredAssemblyManifest,
  input: unknown,
): CompiledLayeredGodotIntegrationPlan {
  verifyLayeredProductionPlan(plan);
  verifyLayeredAssemblyManifest(assembly, plan);
  const request = record(input, "godotIntegration");
  exactKeys(request, "godotIntegration", [
    "schemaVersion",
    "kind",
    "integrationId",
    "revision",
    "assemblyId",
    "target",
    "pixelPolicy",
    "runtime",
    "outputs",
    "metadata",
  ]);
  if (
    request.schemaVersion !== "1.0" ||
    request.kind !== LAYERED_GODOT_REQUEST_KIND
  ) {
    fail(
      "LAYERED_GODOT_INPUT_INVALID",
      `godotIntegration must use schemaVersion 1.0 and kind ${LAYERED_GODOT_REQUEST_KIND}.`,
    );
  }
  const integrationId = idValue(request.integrationId, "godotIntegration.integrationId");
  const revision = semver(request.revision, "godotIntegration.revision");
  if (request.assemblyId !== assembly.assemblyId) {
    fail(
      "LAYERED_GODOT_ASSEMBLY_MISMATCH",
      "godotIntegration.assemblyId does not match the supplied assembly manifest.",
    );
  }
  if (plan.project.engine !== "Godot" || plan.project.engineVersion !== "4.6.2") {
    fail(
      "LAYERED_GODOT_ENGINE_MISMATCH",
      "The production plan must target Godot 4.6.2 exactly.",
    );
  }

  const targetInput = record(request.target, "godotIntegration.target");
  exactKeys(targetInput, "godotIntegration.target", [
    "engine",
    "engineVersion",
    "renderer",
    "runtimeRoot",
    "rootNodeName",
    "rootNodeType",
  ]);
  literal(targetInput.engine, "Godot", "godotIntegration.target.engine");
  literal(
    targetInput.engineVersion,
    "4.6.2",
    "godotIntegration.target.engineVersion",
  );
  const renderer = stringValue(
    targetInput.renderer,
    "godotIntegration.target.renderer",
    40,
  ) as LayeredGodotRenderer;
  if (!RENDERERS.has(renderer)) {
    fail("LAYERED_GODOT_INPUT_INVALID", "godotIntegration.target.renderer is unsupported.");
  }
  const runtimeRoot = relativePath(
    targetInput.runtimeRoot,
    "godotIntegration.target.runtimeRoot",
  );
  if (runtimeRoot !== plan.project.runtimeRoot) {
    fail(
      "LAYERED_GODOT_RUNTIME_ROOT_MISMATCH",
      "godotIntegration.target.runtimeRoot must equal the production plan runtime root.",
    );
  }
  const rootNodeName = stringValue(
    targetInput.rootNodeName,
    "godotIntegration.target.rootNodeName",
    120,
  );
  if (!GODOT_NODE_NAME_PATTERN.test(rootNodeName)) {
    fail(
      "LAYERED_GODOT_SCENE_INVALID",
      "godotIntegration.target.rootNodeName must be a canonical Godot node name.",
    );
  }
  literal(targetInput.rootNodeType, "Node2D", "godotIntegration.target.rootNodeType");
  const target = freeze({
    engine: "Godot" as const,
    engineVersion: "4.6.2" as const,
    renderer,
    runtimeRoot,
    rootNodeName,
    rootNodeType: "Node2D" as const,
  });

  const pixelInput = record(request.pixelPolicy, "godotIntegration.pixelPolicy");
  exactKeys(pixelInput, "godotIntegration.pixelPolicy", [
    "textureFilter",
    "textureRepeat",
    "mipmaps",
    "compression",
    "snapTransformsToPixel",
    "snapVerticesToPixel",
    "centeredSprites",
    "integerPositions",
  ]);
  literal(pixelInput.textureFilter, "nearest", "godotIntegration.pixelPolicy.textureFilter");
  literal(pixelInput.textureRepeat, "disabled", "godotIntegration.pixelPolicy.textureRepeat");
  literal(pixelInput.mipmaps, false, "godotIntegration.pixelPolicy.mipmaps");
  literal(pixelInput.compression, "lossless", "godotIntegration.pixelPolicy.compression");
  literal(
    pixelInput.snapTransformsToPixel,
    true,
    "godotIntegration.pixelPolicy.snapTransformsToPixel",
  );
  literal(
    pixelInput.snapVerticesToPixel,
    false,
    "godotIntegration.pixelPolicy.snapVerticesToPixel",
  );
  literal(
    pixelInput.centeredSprites,
    false,
    "godotIntegration.pixelPolicy.centeredSprites",
  );
  literal(
    pixelInput.integerPositions,
    true,
    "godotIntegration.pixelPolicy.integerPositions",
  );
  const pixelPolicy = freeze({
    textureFilter: "nearest" as const,
    textureRepeat: "disabled" as const,
    mipmaps: false as const,
    compression: "lossless" as const,
    snapTransformsToPixel: true as const,
    snapVerticesToPixel: false as const,
    centeredSprites: false as const,
    integerPositions: true as const,
  });

  const runtimeInput = record(request.runtime, "godotIntegration.runtime");
  exactKeys(runtimeInput, "godotIntegration.runtime", [
    "rootScriptPath",
    "routeControllerScriptPath",
    "cameraControllerScriptPath",
    "destinationTriggerScriptPath",
    "actorControllerScriptPath",
    "actorPlacementId",
    "defaultCameraMode",
    "routeTravelUnit",
  ]);
  const scripts = freeze({
    root: safePath(
      runtimeInput.rootScriptPath,
      "godotIntegration.runtime.rootScriptPath",
      ".gd",
    ),
    route: safePath(
      runtimeInput.routeControllerScriptPath,
      "godotIntegration.runtime.routeControllerScriptPath",
      ".gd",
    ),
    camera: safePath(
      runtimeInput.cameraControllerScriptPath,
      "godotIntegration.runtime.cameraControllerScriptPath",
      ".gd",
    ),
    destination: safePath(
      runtimeInput.destinationTriggerScriptPath,
      "godotIntegration.runtime.destinationTriggerScriptPath",
      ".gd",
    ),
    actor: safePath(
      runtimeInput.actorControllerScriptPath,
      "godotIntegration.runtime.actorControllerScriptPath",
      ".gd",
    ),
  });
  const actorPlacementId = idValue(
    runtimeInput.actorPlacementId,
    "godotIntegration.runtime.actorPlacementId",
  );
  const actorPlacement = placementList(assembly).find(
    (placement) => placement.id === actorPlacementId,
  );
  if (
    !actorPlacement ||
    actorPlacement.mode !== "dynamic" ||
    actorPlacement.source.kind !== "animation-set" ||
    !["player-character", "crowd-character"].includes(actorPlacement.layerRole) ||
    actorPlacement.routeNodeId !== assembly.routeGraph.startNodeId
  ) {
    fail(
      "LAYERED_GODOT_RUNTIME_INVALID",
      "The selected actor placement must be a dynamic character animation set bound to the route start node.",
    );
  }
  const defaultCameraMode = stringValue(
    runtimeInput.defaultCameraMode,
    "godotIntegration.runtime.defaultCameraMode",
    40,
  ) as LayeredGodotCameraMode;
  if (!CAMERA_MODES.has(defaultCameraMode)) {
    fail(
      "LAYERED_GODOT_RUNTIME_INVALID",
      "godotIntegration.runtime.defaultCameraMode is unsupported.",
    );
  }
  const routeTravelUnit = stringValue(
    runtimeInput.routeTravelUnit,
    "godotIntegration.runtime.routeTravelUnit",
    20,
  ) as LayeredGodotTravelUnit;
  if (!TRAVEL_UNITS.has(routeTravelUnit)) {
    fail(
      "LAYERED_GODOT_RUNTIME_INVALID",
      "godotIntegration.runtime.routeTravelUnit is unsupported.",
    );
  }
  const runtime = freeze({
    rootScriptPath: scripts.root,
    routeControllerScriptPath: scripts.route,
    cameraControllerScriptPath: scripts.camera,
    destinationTriggerScriptPath: scripts.destination,
    actorControllerScriptPath: scripts.actor,
    actorPlacementId,
    defaultCameraMode,
    routeTravelUnit,
  });

  const outputInput = record(request.outputs, "godotIntegration.outputs");
  exactKeys(outputInput, "godotIntegration.outputs", [
    "scenePath",
    "integrationManifestPath",
    "routeResourcePath",
    "placementResourcePath",
    "animationResourcePath",
    "cameraResourcePath",
    "importPolicyPath",
  ]);
  const outputs = freeze({
    scenePath: safePath(outputInput.scenePath, "godotIntegration.outputs.scenePath", ".tscn"),
    integrationManifestPath: underRoot(
      safePath(
        outputInput.integrationManifestPath,
        "godotIntegration.outputs.integrationManifestPath",
        ".json",
      ),
      runtimeRoot,
      "godotIntegration.outputs.integrationManifestPath",
    ),
    routeResourcePath: underRoot(
      safePath(
        outputInput.routeResourcePath,
        "godotIntegration.outputs.routeResourcePath",
        ".json",
      ),
      runtimeRoot,
      "godotIntegration.outputs.routeResourcePath",
    ),
    placementResourcePath: underRoot(
      safePath(
        outputInput.placementResourcePath,
        "godotIntegration.outputs.placementResourcePath",
        ".json",
      ),
      runtimeRoot,
      "godotIntegration.outputs.placementResourcePath",
    ),
    animationResourcePath: underRoot(
      safePath(
        outputInput.animationResourcePath,
        "godotIntegration.outputs.animationResourcePath",
        ".json",
      ),
      runtimeRoot,
      "godotIntegration.outputs.animationResourcePath",
    ),
    cameraResourcePath: underRoot(
      safePath(
        outputInput.cameraResourcePath,
        "godotIntegration.outputs.cameraResourcePath",
        ".json",
      ),
      runtimeRoot,
      "godotIntegration.outputs.cameraResourcePath",
    ),
    importPolicyPath: underRoot(
      safePath(
        outputInput.importPolicyPath,
        "godotIntegration.outputs.importPolicyPath",
        ".json",
      ),
      runtimeRoot,
      "godotIntegration.outputs.importPolicyPath",
    ),
  });
  if (
    outputs.scenePath !== assembly.outputs.godotScenePath ||
    outputs.routeResourcePath !== assembly.outputs.routeGraphPath ||
    outputs.placementResourcePath !== assembly.outputs.placementManifestPath
  ) {
    fail(
      "LAYERED_GODOT_OUTPUT_MISMATCH",
      "Godot scene, route and placement outputs must exactly match the assembly manifest outputs.",
    );
  }
  const outputPaths = Object.values(outputs);
  if (new Set(outputPaths).size !== outputPaths.length) {
    fail("LAYERED_GODOT_PATH_INVALID", "Godot integration output paths must be unique.");
  }

  const externalResources = buildExternalResources(plan, assembly, scripts);
  const animationResources = buildAnimationResources(
    plan,
    assembly,
    externalResources,
  );
  const nodes = buildSceneNodes(
    assembly,
    rootNodeName,
    actorPlacementId,
    externalResources,
    animationResources,
    outputs,
  );
  const tscnDraft = renderScene(
    integrationId,
    assembly,
    externalResources,
    animationResources,
    nodes,
    defaultCameraMode,
    outputs,
    renderer,
  );
  const sceneResource = resourceDraft(
    "scene-draft",
    outputs.scenePath,
    "text/plain",
    tscnDraft,
  );
  const routeResource = resourceDraft(
    "route-graph",
    outputs.routeResourcePath,
    "application/json",
    jsonContent(routeResourcePayload(assembly, routeTravelUnit)),
  );
  const placementsResource = resourceDraft(
    "placements",
    outputs.placementResourcePath,
    "application/json",
    jsonContent(placementResourcePayload(plan, assembly)),
  );
  const animationsResource = resourceDraft(
    "animations",
    outputs.animationResourcePath,
    "application/json",
    jsonContent(animationResourcePayload(assembly, animationResources)),
  );
  const camerasResource = resourceDraft(
    "cameras",
    outputs.cameraResourcePath,
    "application/json",
    jsonContent(cameraResourcePayload(assembly, actorPlacementId, defaultCameraMode)),
  );
  const importsResource = resourceDraft(
    "import-policy",
    outputs.importPolicyPath,
    "application/json",
    jsonContent(importPolicyPayload(plan, assembly)),
  );
  const primaryResources = freeze([
    sceneResource,
    routeResource,
    placementsResource,
    animationsResource,
    camerasResource,
    importsResource,
  ]);
  const handoffReady = assembly.readiness.runtimeReady;
  const blockers = handoffReady
    ? freeze([])
    : freeze([
        ...assembly.readiness.blockers,
        "Godot scene and resource drafts remain review-only until the assembly is an approved runtime candidate.",
      ]);
  const manifestContent = jsonContent({
    schemaVersion: "1.0",
    kind: "evavo.layered-production.godot-handoff-manifest",
    protocolVersion: LAYERED_GODOT_PROTOCOL_VERSION,
    integrationId,
    revision,
    productionPlan: {
      planId: plan.planId,
      planSha256: plan.planSha256,
      targetRepository: plan.project.targetRepository,
      runtimeRoot: plan.project.runtimeRoot,
    },
    target: {
      engine: "Godot",
      engineVersion: "4.6.2",
      renderer,
    },
    pixelPolicy,
    runtimeDependencies: Object.values(scripts).map((path) => ({
      type: "GDScript",
      path,
      generatedByThisPlan: false,
    })),
    assembly: {
      assemblyId: assembly.assemblyId,
      manifestSha256: assembly.manifestSha256,
      scope: assembly.scope,
    },
    scene: {
      path: sceneResource.path,
      sha256: sceneResource.sha256,
      bytes: sceneResource.bytes,
    },
    resources: primaryResources.slice(1).map((resource) => ({
      kind: resource.kind,
      path: resource.path,
      sha256: resource.sha256,
      bytes: resource.bytes,
    })),
    readiness: {
      handoffReady,
      reviewOnly: !handoffReady,
      requiresExplicitRepositoryWriter: true,
      runtimeActivationRequired: true,
      blockers,
    },
    authority: {
      fileWrite: false,
      targetRepositoryMutation: false,
      runtimeActivation: false,
      deployment: false,
      gitCommit: false,
      gitPush: false,
      publication: false,
    },
  });
  const integrationManifest = resourceDraft(
    "integration-manifest",
    outputs.integrationManifestPath,
    "application/json",
    manifestContent,
  );
  const resources = freeze([...primaryResources, integrationManifest]);
  const writeIntents = freeze(
    resources.map((resource) =>
      freeze({
        operation: "create-or-replace" as const,
        path: resource.path,
        mediaType: resource.mediaType,
        sha256: resource.sha256,
        bytes: resource.bytes,
        content: resource.content,
        requiresExplicitRepositoryWriter: true as const,
        expectedRepository: plan.project.targetRepository,
      }),
    ),
  );
  const partial = {
    schemaVersion: "1.0" as const,
    kind: LAYERED_GODOT_PLAN_KIND,
    protocolVersion: LAYERED_GODOT_PROTOCOL_VERSION,
    integrationId,
    revision,
    requestSha256: sha256({
      productionPlanSha256: plan.planSha256,
      assemblyManifestSha256: assembly.manifestSha256,
      request,
    }),
    productionPlan: freeze({
      planId: plan.planId,
      planSha256: plan.planSha256,
      targetRepository: plan.project.targetRepository,
      runtimeRoot: plan.project.runtimeRoot,
      engine: plan.project.engine,
      engineVersion: plan.project.engineVersion,
    }),
    assembly: freeze({
      assemblyId: assembly.assemblyId,
      manifestSha256: assembly.manifestSha256,
      scope: assembly.scope,
      runtimeReady: assembly.readiness.runtimeReady,
      candidateOnly: assembly.readiness.candidateOnly,
    }),
    target,
    pixelPolicy,
    runtime,
    outputs,
    externalResources,
    animationResources,
    scene: freeze({
      path: outputs.scenePath,
      rootNodeName,
      nodes,
      tscnSha256: sceneResource.sha256,
      tscnBytes: sceneResource.bytes,
      tscnDraft,
    }),
    resources,
    writeIntents,
    readiness: freeze({
      handoffReady,
      reviewOnly: !handoffReady,
      requiresExplicitRepositoryWriter: true as const,
      runtimeActivationRequired: true as const,
      blockers,
    }),
    totals: freeze({
      externalResources: externalResources.length,
      textureResources: externalResources.filter((resource) => resource.type === "Texture2D").length,
      scriptResources: externalResources.filter((resource) => resource.type === "Script").length,
      animationResources: animationResources.length,
      sceneNodes: nodes.length,
      placementNodes: nodes.filter((node) => node.placementId !== undefined).length,
      routeMarkerNodes: nodes.filter(
        (node) => node.routeNodeId !== undefined && node.destinationId === undefined && node.placementId === undefined,
      ).length,
      destinationNodes: nodes.filter((node) => node.destinationId !== undefined).length,
      cameraNodes: nodes.filter((node) => node.cameraMode !== undefined).length,
      resourceDrafts: resources.length,
      writeIntents: writeIntents.length,
    }),
    qualityGates: freeze([
      "the exact self-hashed production plan and layered assembly manifest are verified before any Godot draft is compiled",
      "Godot 4.6.2, repository identity, runtime root and assembly output paths are immutable integration inputs",
      "all retained source PNGs remain separate Texture2D external resources and a flattened review composite is never referenced",
      "AnimatedSprite2D resources preserve exact frame order, FPS, loop state, source hashes and runtime target paths",
      "dynamic characters place their node at the declared Y-sort baseline and offset the visual by the inverse origin",
      "route nodes, travel costs, destinations, scene bindings, placements, cameras and occlusion metadata remain data-driven",
      "nearest CanvasItem filtering and repeat ownership, lossless importer compression, disabled mipmaps, integer positions and transform pixel snapping are explicit",
      "the TSCN draft and every JSON resource are exact-byte hashed and copied into bounded create-or-replace write intents",
      "candidate style-proof assemblies remain review-only and cannot acquire runtime handoff authority",
      "an explicit repository writer, target-repository review and separate runtime activation are required after compilation",
    ]),
    authority: freeze({
      planningOnly: true as const,
      artifactRead: false as const,
      fileWrite: false as const,
      targetRepositoryMutation: false as const,
      runtimeActivation: false as const,
      deployment: false as const,
      gitCommit: false as const,
      gitPush: false as const,
      publication: false as const,
    }),
    ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
  };
  return freeze({ ...partial, integrationSha256: sha256(partial) });
}
