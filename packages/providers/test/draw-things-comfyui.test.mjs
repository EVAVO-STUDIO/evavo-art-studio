import assert from "node:assert/strict";
import test from "node:test";

import {
  COMFYUI_WORKFLOW_CATALOG_DRAFT_SCHEMA,
  DRAW_THINGS_COMFYUI_PROVIDER_EVIDENCE_SCHEMA,
  DRAW_THINGS_SAMPLER_CLASS,
  ProviderError,
  compileComfyUIWorkflowCatalog,
  createDrawThingsComfyUIProviderAdapters,
} from "../dist/index.js";

function profile(
  profileId,
  {
    classType = DRAW_THINGS_SAMPLER_CLASS,
    server = "127.0.0.1",
    port = "7859",
    useTls = false,
  } = {},
) {
  return {
    profileId,
    label: profileId,
    description: "Reviewed Draw Things bridge fixture profile.",
    version: "1.0.0",
    priority: 180,
    operations: ["generate"],
    assetKinds: ["illustration", "sprite-frame"],
    continuityPhases: ["independent", "key-pose"],
    capabilities: [
      "generate",
      "seed",
      "custom-size",
      "candidate-count",
      "cancellation",
    ],
    modelId: `${profileId}-model`,
    workflow: {
      "1": {
        class_type: classType,
        inputs: {
          prompt: "replace me",
          seed: 1,
          width: 512,
          height: 512,
          batch_size: 1,
          server,
          port,
          use_tls: useTls,
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
        id: `${profileId}-model`,
        kind: "checkpoint",
        sha256: "a".repeat(64),
      },
    ],
    runtimeInventory: [
      {
        id: "comfyui",
        version: "0.4.0",
        sha256: "b".repeat(64),
      },
      {
        id: "draw-things-comfyui",
        version: "1.11.1",
        sha256: "c".repeat(64),
      },
      {
        id: "draw-things-grpc-server",
        version: "v26.0910.1",
        sha256: "d".repeat(64),
      },
    ],
    limits: {
      maximumCandidates: 4,
      maximumReferenceImages: 4,
      maximumSourceBytes: 16 * 1024 * 1024,
    },
  };
}

function catalog(profiles) {
  return compileComfyUIWorkflowCatalog({
    schemaVersion: COMFYUI_WORKFLOW_CATALOG_DRAFT_SCHEMA,
    catalogId: "evavo-draw-things-test",
    catalogVersion: "1.0.0",
    profiles,
  });
}

test("Draw Things bridge exposes distinct local provider identity from immutable workflow endpoint", () => {
  const compiled = catalog([
    profile("draw-things-sprite"),
    profile("ordinary-comfy", { classType: "KSampler" }),
  ]);
  const adapters = createDrawThingsComfyUIProviderAdapters({
    catalog: compiled,
    dedicatedInstance: true,
  });

  assert.equal(adapters.length, 1);
  const adapter = adapters[0];
  assert.equal(adapter.descriptor.id, "draw-things:draw-things-sprite");
  assert.equal(
    adapter.descriptor.label,
    "Draw Things via ComfyUI — draw-things-sprite",
  );
  assert.deepEqual(adapter.descriptor.models, ["draw-things-sprite-model"]);
  assert.equal(adapter.descriptor.dataPolicy.remote, false);
  assert.equal(adapter.descriptor.dataPolicy.retainedByProvider, true);
  assert.equal(adapter.descriptor.dataPolicy.usedForTraining, false);
  assert.ok(adapter.descriptor.capabilities.includes("generate"));
});

test("Draw Things bridge fails closed when catalog has no DrawThingsSampler", () => {
  const compiled = catalog([
    profile("ordinary-comfy", { classType: "KSampler" }),
  ]);
  assert.throws(
    () =>
      createDrawThingsComfyUIProviderAdapters({
        catalog: compiled,
        dedicatedInstance: true,
      }),
    (error) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "DRAW_THINGS_PROFILE_MISSING");
      assert.match(error.message, /DrawThingsSampler/);
      return true;
    },
  );
});

test("Draw Things bridge derives remote data policy from reviewed TLS endpoint", () => {
  const compiled = catalog([
    profile("draw-things-remote", {
      server: "gpu.example.com",
      port: "7859",
      useTls: true,
    }),
  ]);
  const [adapter] = createDrawThingsComfyUIProviderAdapters({
    catalog: compiled,
    dedicatedInstance: true,
  });

  assert.equal(adapter.descriptor.dataPolicy.remote, true);
  assert.equal(
    adapter.descriptor.dataPolicy.usedForTraining,
    "provider-dependent",
  );
  assert.equal(
    DRAW_THINGS_COMFYUI_PROVIDER_EVIDENCE_SCHEMA,
    "evavo.draw-things-comfyui-provider-evidence.v1",
  );
});

test("Draw Things bridge rejects a remote gRPC endpoint without TLS", () => {
  const compiled = catalog([
    profile("draw-things-remote-insecure", {
      server: "gpu.example.com",
      port: "7859",
      useTls: false,
    }),
  ]);
  assert.throws(
    () =>
      createDrawThingsComfyUIProviderAdapters({
        catalog: compiled,
        dedicatedInstance: true,
      }),
    (error) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "DRAW_THINGS_REMOTE_TLS_REQUIRED");
      return true;
    },
  );
});

test("Draw Things bridge rejects ambiguous sampler endpoints in one reviewed profile", () => {
  const base = profile("draw-things-ambiguous");
  base.workflow["2"] = {
    class_type: DRAW_THINGS_SAMPLER_CLASS,
    inputs: {
      prompt: "second sampler",
      seed: 2,
      width: 512,
      height: 512,
      batch_size: 1,
      server: "localhost",
      port: "7860",
      use_tls: false,
    },
  };
  const compiled = catalog([base]);
  assert.throws(
    () =>
      createDrawThingsComfyUIProviderAdapters({
        catalog: compiled,
        dedicatedInstance: true,
      }),
    (error) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "DRAW_THINGS_ENDPOINT_AMBIGUOUS");
      return true;
    },
  );
});
