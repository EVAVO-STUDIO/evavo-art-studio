import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ArtDirectionError,
  compileLayeredAssemblyManifest,
  compileLayeredGodotIntegrationPlan,
  compileLayeredProductionPlan,
  layeredGodotIntegrationProtocolSummary,
  verifyLayeredGodotIntegrationPlan,
} from "../dist/index.js";
import {
  addCompleteRuntimeAnimations,
  approvePlan,
  assemblyRequest,
  productionRequest,
  runtimeAssemblyRequest,
} from "./layered-assembly-fixtures.mjs";

const GODOT_FIXTURE = new URL(
  "../../../config/jonez-layered-godot-integration.v1.json",
  import.meta.url,
);
const GODOT_REQUEST = JSON.parse(await readFile(GODOT_FIXTURE, "utf8"));
const GODOT_CONTRACT_FIXTURE = new URL(
  "../../../config/layered-production-godot-integration.v1.json",
  import.meta.url,
);
const GODOT_CONTRACT = JSON.parse(
  await readFile(GODOT_CONTRACT_FIXTURE, "utf8"),
);
const godotRequest = () => structuredClone(GODOT_REQUEST);

function canonicalSort(value) {
  if (Array.isArray(value)) return value.map(canonicalSort);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalSort(value[key])]),
  );
}

function canonicalSha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalSort(value)))
    .digest("hex");
}

function proofIntegration() {
  const plan = compileLayeredProductionPlan(productionRequest());
  const assembly = compileLayeredAssemblyManifest(plan, assemblyRequest());
  return {
    plan,
    assembly,
    integration: compileLayeredGodotIntegrationPlan(
      plan,
      assembly,
      godotRequest(),
    ),
  };
}


test("Godot integration contract keeps exact drafting and all execution authority separate", () => {
  assert.equal(
    GODOT_CONTRACT.contract,
    "evavo.layered-production.godot-integration.v1",
  );
  assert.equal(GODOT_CONTRACT.protocolVersion, "2026-08-11.1");
  assert.equal(GODOT_CONTRACT.engine.name, "Godot");
  assert.equal(GODOT_CONTRACT.engine.version, "4.6.2");
  assert.equal(GODOT_CONTRACT.engine.sceneFormat, 3);
  assert.equal(Object.values(GODOT_CONTRACT.requirements).every(Boolean), true);
  assert.equal(GODOT_CONTRACT.resourceDrafts.length, 7);
  assert.equal(GODOT_CONTRACT.writeIntent.automaticExecution, false);
  assert.equal(
    Object.values(GODOT_CONTRACT.authority).every((value) => value === false),
    true,
  );
});

test("compiles the JONEZ proof into exact Godot 4.6.2 scene and resource drafts", () => {
  const { plan, assembly, integration } = proofIntegration();
  assert.equal(
    integration.kind,
    "evavo.layered-production.godot-integration-plan",
  );
  assert.equal(integration.protocolVersion, "2026-08-11.1");
  assert.equal(integration.target.engine, "Godot");
  assert.equal(integration.target.engineVersion, "4.6.2");
  assert.equal(integration.target.renderer, "gl_compatibility");
  assert.equal(integration.readiness.handoffReady, false);
  assert.equal(integration.readiness.reviewOnly, true);
  assert.equal(integration.readiness.blockers.length > 0, true);
  assert.equal(integration.totals.externalResources, 11);
  assert.equal(integration.totals.scriptResources, 5);
  assert.equal(integration.totals.textureResources, 6);
  assert.equal(integration.totals.animationResources, 1);
  assert.equal(integration.totals.sceneNodes, 32);
  assert.equal(integration.totals.placementNodes, 6);
  assert.equal(integration.totals.routeMarkerNodes, 11);
  assert.equal(integration.totals.destinationNodes, 1);
  assert.equal(integration.totals.cameraNodes, 3);
  assert.equal(integration.totals.resourceDrafts, 7);
  assert.equal(integration.totals.writeIntents, 7);
  assert.match(
    integration.scene.tscnDraft,
    /^\[gd_scene load_steps=\d+ format=3\]/,
  );
  assert.match(integration.scene.tscnDraft, /type="AnimatedSprite2D"/);
  assert.match(integration.scene.tscnDraft, /texture_filter = 1/);
  assert.match(integration.scene.tscnDraft, /texture_repeat = 1/);
  assert.match(integration.scene.tscnDraft, /centered = false/);
  assert.match(integration.scene.tscnDraft, /y_sort_enabled = true/);
  assert.match(
    integration.scene.tscnDraft,
    /metadata\/route_resource_path = "res:\/\/examples\/city_life_board_sim\/assets\/final\/manifests\/jonez-market-district-proof\.route\.json"/,
  );
  assert.match(
    integration.scene.tscnDraft,
    /metadata\/target_scene_path = "res:\/\/examples\/city_life_board_sim\/scenes\/locations\/cafe\.tscn"/,
  );
  assert.ok(
    !integration.scene.tscnDraft.includes(
      assembly.outputs.reviewCompositePath,
    ),
  );
  const player = integration.scene.nodes.find(
    (node) => node.placementId === "player-placement",
  );
  assert.ok(player);
  assert.equal(player.type, "AnimatedSprite2D");
  assert.deepEqual(player.position, { x: 154, y: 143 });
  assert.deepEqual(player.visualOffset, { x: -12, y: -33 });
  assert.equal(player.routeNodeId, assembly.routeGraph.startNodeId);
  assert.equal(player.scriptResourceId, "script_actor");
  const sceneResource = integration.resources.find(
    (resource) => resource.kind === "scene-draft",
  );
  assert.ok(sceneResource);
  assert.equal(sceneResource.content, integration.scene.tscnDraft);
  assert.equal(sceneResource.sha256, integration.scene.tscnSha256);
  assert.equal(
    integration.writeIntents.every(
      (intent) =>
        intent.requiresExplicitRepositoryWriter === true &&
        intent.expectedRepository === plan.project.targetRepository,
    ),
    true,
  );
  for (const resource of integration.resources.filter(
    (entry) => entry.mediaType === "application/json",
  )) {
    assert.doesNotThrow(() => JSON.parse(resource.content));
  }
  assert.equal(
    verifyLayeredGodotIntegrationPlan(integration, plan, assembly),
    true,
  );
});

test("approved complete animations compile into a handoff-ready Godot runtime candidate", () => {
  const pending = compileLayeredProductionPlan(
    addCompleteRuntimeAnimations(productionRequest()),
  );
  const { plan } = approvePlan(pending);
  const assembly = compileLayeredAssemblyManifest(
    plan,
    runtimeAssemblyRequest(plan),
  );
  const integration = compileLayeredGodotIntegrationPlan(
    plan,
    assembly,
    godotRequest(),
  );
  assert.equal(assembly.scope, "runtime-candidate");
  assert.equal(integration.readiness.handoffReady, true);
  assert.equal(integration.readiness.reviewOnly, false);
  assert.deepEqual(integration.readiness.blockers, []);
  assert.equal(integration.totals.textureResources, 14);
  assert.equal(integration.totals.animationResources, 2);
  assert.match(integration.scene.tscnDraft, /SpriteFrames_001_player_runtime/);
  assert.match(integration.scene.tscnDraft, /SpriteFrames_002_fountain_runtime/);
  assert.equal(
    integration.animationResources.find(
      (entry) => entry.animationSetId === "player-runtime",
    )?.clips.length,
    2,
  );
  assert.equal(
    verifyLayeredGodotIntegrationPlan(integration, plan, assembly),
    true,
  );
});

test("Godot integration compilation is deterministic and exact-byte tampering fails closed", () => {
  const { plan, assembly } = proofIntegration();
  const left = compileLayeredGodotIntegrationPlan(
    plan,
    assembly,
    godotRequest(),
  );
  const right = compileLayeredGodotIntegrationPlan(
    plan,
    assembly,
    godotRequest(),
  );
  assert.equal(left.requestSha256, right.requestSha256);
  assert.equal(left.integrationSha256, right.integrationSha256);
  assert.equal(left.scene.tscnSha256, right.scene.tscnSha256);
  assert.deepEqual(
    left.resources.map((resource) => resource.sha256),
    right.resources.map((resource) => resource.sha256),
  );

  const tamperedScene = structuredClone(left);
  tamperedScene.scene.tscnDraft += "\n[node name=\"Injected\" type=\"Node2D\"]\n";
  assert.throws(
    () => verifyLayeredGodotIntegrationPlan(tamperedScene, plan, assembly),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_GODOT_PLAN_INVALID",
  );

  const tamperedIntent = structuredClone(left);
  tamperedIntent.writeIntents[0].content += "tampered";
  assert.throws(
    () => verifyLayeredGodotIntegrationPlan(tamperedIntent, plan, assembly),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_GODOT_PLAN_INVALID",
  );

  const semanticallyTampered = structuredClone(left);
  semanticallyTampered.externalResources.find(
    (resource) => resource.id === "script_route",
  ).path = "examples/city_life_board_sim/scripts/world/invented_route.gd";
  const { integrationSha256: _oldHash, ...withoutHash } = semanticallyTampered;
  semanticallyTampered.integrationSha256 = canonicalSha256(withoutHash);
  assert.throws(
    () =>
      verifyLayeredGodotIntegrationPlan(
        semanticallyTampered,
        plan,
        assembly,
      ),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_GODOT_PLAN_INVALID",
  );
});

test("rejects unsafe engine, pixel, output and actor integration drift", () => {
  const plan = compileLayeredProductionPlan(productionRequest());
  const assembly = compileLayeredAssemblyManifest(plan, assemblyRequest());

  const wrongEngine = godotRequest();
  wrongEngine.target.engineVersion = "4.5.0";
  assert.throws(
    () => compileLayeredGodotIntegrationPlan(plan, assembly, wrongEngine),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_GODOT_INPUT_INVALID",
  );

  const filtered = godotRequest();
  filtered.pixelPolicy.textureFilter = "linear";
  assert.throws(
    () => compileLayeredGodotIntegrationPlan(plan, assembly, filtered),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_GODOT_INPUT_INVALID",
  );

  const mismatchedOutput = godotRequest();
  mismatchedOutput.outputs.scenePath =
    "examples/city_life_board_sim/scenes/world/other.tscn";
  assert.throws(
    () =>
      compileLayeredGodotIntegrationPlan(plan, assembly, mismatchedOutput),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_GODOT_OUTPUT_MISMATCH",
  );

  const escapedOutput = godotRequest();
  escapedOutput.outputs.cameraResourcePath = "outside/cameras.json";
  assert.throws(
    () => compileLayeredGodotIntegrationPlan(plan, assembly, escapedOutput),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_GODOT_PATH_INVALID",
  );

  const wrongActor = godotRequest();
  wrongActor.runtime.actorPlacementId = "cafe-placement";
  assert.throws(
    () => compileLayeredGodotIntegrationPlan(plan, assembly, wrongActor),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "LAYERED_GODOT_RUNTIME_INVALID",
  );
});

test("Godot integration protocol keeps all write, runtime and publication authority disabled", () => {
  const protocol = layeredGodotIntegrationProtocolSummary();
  assert.equal(protocol.protocolVersion, "2026-08-11.1");
  assert.equal(protocol.engine, "Godot 4.6.2");
  assert.ok(protocol.rules.some((rule) => rule.includes("format=3 TSCN")));
  assert.ok(
    protocol.rules.some((rule) =>
      rule.includes("explicit repository writer"),
    ),
  );
  assert.equal(
    Object.values(protocol.authority).every((value) => value === false),
    true,
  );
});
