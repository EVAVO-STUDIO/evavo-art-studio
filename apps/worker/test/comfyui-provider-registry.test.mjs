import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  COMFYUI_WORKFLOW_CATALOG_DRAFT_SCHEMA,
  compileComfyUIWorkflowCatalog,
} from "@evavo/art-providers";

import { createProviderRegistryFromEnvironment } from "../dist/provider-handlers.js";

function profile({
  profileId,
  operation,
  capabilities,
  references = [],
  priority = 10,
}) {
  const flow = {
    "1": { class_type: "CLIPTextEncode", inputs: { text: "prompt" } },
    "2": { class_type: "EmptyLatentImage", inputs: { width: 512, height: 512, batch_size: 1 } },
    "3": { class_type: "KSampler", inputs: { seed: 1, denoise: 1 } },
    "4": { class_type: "SaveImage", inputs: { filename_prefix: "evavo", images: ["3", 0] } },
    "5": { class_type: "LoadImage", inputs: { image: "base.png" } },
    "6": { class_type: "LoadImageMask", inputs: { image: "mask.png" } },
    "20": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: `${profileId}.safetensors` } },
  };
  return {
    profileId,
    label: profileId,
    description: `Exact ${operation} fixture profile for worker registry tests.`,
    version: "1.0.0",
    priority,
    operations: [operation],
    assetKinds: ["illustration"],
    continuityPhases: operation === "generate" ? ["independent"] : ["repair"],
    capabilities,
    modelId: `${profileId}-model`,
    workflow: flow,
    bindings: {
      positivePrompt: { nodeId: "1", input: "text" },
      width: { nodeId: "2", input: "width" },
      height: { nodeId: "2", input: "height" },
      candidateCount: { nodeId: "2", input: "batch_size" },
      seed: { nodeId: "3", input: "seed" },
      filenamePrefix: { nodeId: "4", input: "filename_prefix" },
      referenceImages: references,
    },
    outputNodeIds: ["4"],
    modelInventory: [
      { id: `${profileId}-model`, kind: "checkpoint", sha256: "a".repeat(64) },
    ],
    runtimeInventory: [
      { id: "comfyui", version: "0.4.0", sha256: "b".repeat(64) },
    ],
    limits: {
      maximumCandidates: 4,
      maximumReferenceImages: Math.max(1, references.length),
      maximumSourceBytes: 16 * 1024 * 1024,
    },
  };
}

async function catalogFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-comfy-worker-"));
  const catalog = compileComfyUIWorkflowCatalog({
    schemaVersion: COMFYUI_WORKFLOW_CATALOG_DRAFT_SCHEMA,
    catalogId: "worker-profiles",
    catalogVersion: "1.0.0",
    profiles: [
      profile({
        profileId: "generate-only",
        operation: "generate",
        capabilities: [
          "generate",
          "seed",
          "custom-size",
          "candidate-count",
          "cancellation",
        ],
        priority: 20,
      }),
      profile({
        profileId: "inpaint-only",
        operation: "inpaint",
        capabilities: [
          "inpaint",
          "reference-images",
          "multiple-reference-images",
          "mask",
          "seed",
          "custom-size",
          "candidate-count",
          "cancellation",
        ],
        references: [
          { role: "base-image", nodeId: "5", input: "image", strength: { nodeId: "3", input: "denoise" } },
          { role: "mask", nodeId: "6", input: "image" },
        ],
      }),
    ],
  });
  const catalogPath = path.join(root, "catalog.json");
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  return { root, catalogPath, catalog };
}

test("worker registers exact ComfyUI workflow-profile adapters without unioning capabilities", async () => {
  const fixture = await catalogFixture();
  const registry = createProviderRegistryFromEnvironment({
    EVAVO_ART_COMFYUI_CATALOG: fixture.catalogPath,
    EVAVO_ART_COMFYUI_CATALOG_ROOT: fixture.root,
    EVAVO_ART_COMFYUI_BASE_URL: "http://127.0.0.1:8188",
    EVAVO_ART_COMFYUI_DEDICATED_INSTANCE: "true",
    EVAVO_ART_COMFYUI_ALLOW_REMOTE: "false",
  });
  const descriptors = registry.list();
  assert.deepEqual(
    descriptors.map((entry) => entry.id).sort(),
    ["comfyui:generate-only", "comfyui:inpaint-only"],
  );
  const generate = descriptors.find((entry) => entry.id === "comfyui:generate-only");
  const inpaint = descriptors.find((entry) => entry.id === "comfyui:inpaint-only");
  assert.deepEqual(generate.capabilities, [
    "cancellation",
    "candidate-count",
    "custom-size",
    "generate",
    "seed",
  ]);
  assert.equal(generate.capabilities.includes("inpaint"), false);
  assert.equal(inpaint.capabilities.includes("generate"), false);
  assert.equal(inpaint.capabilities.includes("mask"), true);
  assert.equal(generate.models[0], "generate-only-model");
  assert.equal(inpaint.models[0], "inpaint-only-model");
});

test("worker requires explicit dedicated-instance and remote authority", async () => {
  const fixture = await catalogFixture();
  assert.throws(
    () => createProviderRegistryFromEnvironment({
      EVAVO_ART_COMFYUI_CATALOG: fixture.catalogPath,
      EVAVO_ART_COMFYUI_CATALOG_ROOT: fixture.root,
    }),
    /DEDICATED_INSTANCE=true is required/,
  );
  assert.throws(
    () => createProviderRegistryFromEnvironment({
      EVAVO_ART_COMFYUI_CATALOG: fixture.catalogPath,
      EVAVO_ART_COMFYUI_CATALOG_ROOT: fixture.root,
      EVAVO_ART_COMFYUI_DEDICATED_INSTANCE: "yes",
    }),
    /must be exactly true or false/,
  );
  assert.throws(
    () => createProviderRegistryFromEnvironment({
      EVAVO_ART_COMFYUI_CATALOG: fixture.catalogPath,
      EVAVO_ART_COMFYUI_CATALOG_ROOT: fixture.root,
      EVAVO_ART_COMFYUI_DEDICATED_INSTANCE: "true",
      EVAVO_ART_COMFYUI_ALLOW_REMOTE: "true",
      EVAVO_ART_COMFYUI_BASE_URL: "http://gpu.example.com:8188",
      EVAVO_ART_COMFYUI_API_TOKEN: "super-secret-token",
    }),
    (error) => {
      assert.doesNotMatch(error.message, /super-secret-token/);
      return /must use HTTPS/.test(error.message);
    },
  );
});
