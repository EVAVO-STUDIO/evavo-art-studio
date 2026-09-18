import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  COMFYUI_WORKFLOW_CATALOG_DRAFT_SCHEMA,
  DRAW_THINGS_SAMPLER_CLASS,
  compileComfyUIWorkflowCatalog,
} from "@evavo/art-providers";

import { createProviderRegistryFromEnvironment } from "../dist/provider-handlers.js";

async function drawThingsCatalogFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-draw-things-worker-"));
  const catalog = compileComfyUIWorkflowCatalog({
    schemaVersion: COMFYUI_WORKFLOW_CATALOG_DRAFT_SCHEMA,
    catalogId: "worker-draw-things-profiles",
    catalogVersion: "1.0.0",
    profiles: [
      {
        profileId: "sprite-local",
        label: "Local Draw Things sprite",
        description: "Reviewed Draw Things bridge profile for worker registry tests.",
        version: "1.0.0",
        priority: 200,
        operations: ["generate"],
        assetKinds: ["sprite-frame"],
        continuityPhases: ["key-pose", "independent"],
        capabilities: [
          "generate",
          "seed",
          "custom-size",
          "candidate-count",
          "cancellation",
        ],
        modelId: "draw-things-sprite-model",
        workflow: {
          "1": {
            class_type: DRAW_THINGS_SAMPLER_CLASS,
            inputs: {
              prompt: "replace",
              seed: 1,
              width: 512,
              height: 512,
              batch_size: 1,
            },
          },
        },
        bindings: {
          positivePrompt: { nodeId: "1", input: "prompt" },
          seed: { nodeId: "1", input: "seed" },
          width: { nodeId: "1", input: "width" },
          height: { nodeId: "1", input: "height" },
          candidateCount: { nodeId: "1", input: "batch_size" },
          referenceImages: [],
        },
        outputNodeIds: ["1"],
        modelInventory: [
          {
            id: "draw-things-sprite-model",
            kind: "checkpoint",
            sha256: "a".repeat(64),
          },
        ],
        runtimeInventory: [
          { id: "comfyui", version: "0.4.0", sha256: "b".repeat(64) },
          {
            id: "draw-things-comfyui",
            version: "2026.09.11",
            sha256: "c".repeat(64),
          },
          {
            id: "draw-things-grpc-server",
            version: "2026.09.11",
            sha256: "d".repeat(64),
          },
        ],
        limits: {
          maximumCandidates: 4,
          maximumReferenceImages: 4,
          maximumSourceBytes: 16 * 1024 * 1024,
        },
      },
    ],
  });
  const catalogPath = path.join(root, "catalog.json");
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  return { root, catalogPath };
}

test("worker registers Draw Things bridge as a distinct local provider", async () => {
  const fixture = await drawThingsCatalogFixture();
  const registry = createProviderRegistryFromEnvironment({
    EVAVO_ART_DRAWTHINGS_CATALOG: fixture.catalogPath,
    EVAVO_ART_DRAWTHINGS_CATALOG_ROOT: fixture.root,
    EVAVO_ART_DRAWTHINGS_COMFYUI_BASE_URL: "http://127.0.0.1:8192",
    EVAVO_ART_DRAWTHINGS_COMFYUI_DEDICATED_INSTANCE: "true",
    EVAVO_ART_DRAWTHINGS_COMFYUI_ALLOW_REMOTE: "false",
    EVAVO_ART_DRAWTHINGS_GRPC_REMOTE: "false",
  });

  const descriptors = registry.list();
  assert.equal(descriptors.length, 1);
  assert.equal(descriptors[0].id, "draw-things:sprite-local");
  assert.equal(descriptors[0].dataPolicy.remote, false);
  assert.deepEqual(descriptors[0].models, ["draw-things-sprite-model"]);
});

test("worker fails closed without explicit Draw Things dedicated-instance authority", async () => {
  const fixture = await drawThingsCatalogFixture();
  assert.throws(
    () =>
      createProviderRegistryFromEnvironment({
        EVAVO_ART_DRAWTHINGS_CATALOG: fixture.catalogPath,
        EVAVO_ART_DRAWTHINGS_CATALOG_ROOT: fixture.root,
      }),
    /EVAVO_ART_DRAWTHINGS_COMFYUI_DEDICATED_INSTANCE=true is required/,
  );
});

test("worker records explicit remote Draw Things gRPC policy", async () => {
  const fixture = await drawThingsCatalogFixture();
  const registry = createProviderRegistryFromEnvironment({
    EVAVO_ART_DRAWTHINGS_CATALOG: fixture.catalogPath,
    EVAVO_ART_DRAWTHINGS_CATALOG_ROOT: fixture.root,
    EVAVO_ART_DRAWTHINGS_COMFYUI_BASE_URL: "http://127.0.0.1:8192",
    EVAVO_ART_DRAWTHINGS_COMFYUI_DEDICATED_INSTANCE: "true",
    EVAVO_ART_DRAWTHINGS_COMFYUI_ALLOW_REMOTE: "false",
    EVAVO_ART_DRAWTHINGS_GRPC_REMOTE: "true",
  });
  assert.equal(registry.list()[0].dataPolicy.remote, true);
  assert.equal(
    registry.list()[0].dataPolicy.usedForTraining,
    "provider-dependent",
  );
});
