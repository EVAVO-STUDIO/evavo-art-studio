import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDrawThingsCatalogDraft,
} from "./draw-things-local-models.mjs";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const BUNDLE = "d".repeat(64);

function install() {
  return {
    schema: "evavo.draw-things-local-install.v1",
    grpcHost: "127.0.0.1",
    grpcPort: 7859,
    bridgeHost: "127.0.0.1",
    bridgePort: 8193,
    modelsRoot: "C:\\EVAVO\\DrawThings\\Models",
    comfyMainSha256: SHA_A,
    bridgeCommit: "dec14def1759a16f55fa5ff32625e70ca70c16d3",
    bridgeVersion: "1.11.1",
    bridgeRequirementsSha256: SHA_B,
    dockerImageVersion: "v1.20260721.1",
    dockerImageId: `sha256:${SHA_C}`,
  };
}

function inventory(overrides = {}) {
  return {
    schema: "evavo.draw-things-local-inventory.v1",
    capturedAt: "2026-09-18T00:00:00.000Z",
    bridgeEndpoint: "http://127.0.0.1:8193",
    grpcEndpoint: "127.0.0.1:7859",
    installManifestSha256: "e".repeat(64),
    rawCategoryCounts: { models: 1 },
    models: [
      {
        id: "dt-fixture",
        name: "Fixture XL",
        file: "fixture_xl.safetensors",
        version: "sdxl",
        bundleSha256: BUNDLE,
        metadataSha256: "f".repeat(64),
        components: [
          {
            relativePath: "fixture_xl.safetensors",
            sizeBytes: 1024,
            sha256: "1".repeat(64),
          },
        ],
        model: {
          name: "Fixture XL",
          file: "fixture_xl.safetensors",
          version: "sdxl",
          prefix: "",
          modifier: "none",
        },
        ...overrides,
      },
    ],
  };
}

function governance(overrides = {}) {
  return {
    schema: "evavo.draw-things-model-governance.v1",
    models: [
      {
        id: "fixture-xl",
        inventoryName: "Fixture XL",
        inventoryFile: "fixture_xl.safetensors",
        version: "sdxl",
        bundleSha256: BUNDLE,
        source: {
          publisher: "Fixture Publisher",
          url: "https://example.com/model",
        },
        license: {
          id: "fixture-open-license",
          name: "Fixture Open License",
          url: "https://example.com/license",
          commercialUse: "allowed",
          derivatives: "allowed",
          redistribution: "restricted",
        },
        approvedUses: ["illustration", "sprite", "environment"],
        reviewedBy: "owner",
        reviewedAt: "2026-09-18T00:00:00.000Z",
        ...overrides,
      },
    ],
  };
}

test("builds a governed Draw Things profile from exact local model identity", () => {
  const result = buildDrawThingsCatalogDraft({
    inventory: inventory(),
    governance: governance(),
    install: install(),
    modelId: "fixture-xl",
  });

  assert.equal(
    result.draft.schemaVersion,
    "evavo.comfyui-workflow-catalog-draft.v1",
  );
  assert.equal(result.draft.profiles.length, 1);
  const profile = result.draft.profiles[0];
  assert.equal(profile.profileId, "dt-fixture-xl-generate");
  assert.equal(profile.modelId, "fixture-xl");
  assert.ok(profile.assetKinds.includes("sprite-frame"));
  assert.ok(profile.assetKinds.includes("environment"));
  assert.ok(profile.continuityPhases.includes("identity-master"));
  assert.deepEqual(profile.capabilities, [
    "generate",
    "seed",
    "custom-size",
    "candidate-count",
    "cancellation",
  ]);
  assert.equal(profile.limits.maximumReferenceImages, 0);
  assert.equal(profile.workflow["3"].class_type, "DrawThingsSampler");
  assert.equal(profile.workflow["3"].inputs.server, "127.0.0.1");
  assert.equal(profile.workflow["3"].inputs.port, "7859");
  assert.equal(profile.workflow["3"].inputs.use_tls, false);
  assert.equal(
    profile.workflow["3"].inputs.model.value.file,
    "fixture_xl.safetensors",
  );
  assert.deepEqual(profile.workflow["3"].inputs.positive, ["1", 0]);
  assert.deepEqual(profile.workflow["3"].inputs.negative, ["2", 0]);
  assert.equal(profile.modelInventory[0].sha256, BUNDLE);
  assert.equal(profile.runtimeInventory[0].sha256, SHA_A);
  assert.equal(profile.runtimeInventory[2].sha256, SHA_C);
  assert.equal(result.governanceEvidence.commercialUseApproved, true);
  assert.equal(result.governanceEvidence.automaticModelDownloadAllowed, false);
});

test("does not claim sprite continuity phases when sprite use is not approved", () => {
  const result = buildDrawThingsCatalogDraft({
    inventory: inventory(),
    governance: governance({ approvedUses: ["illustration"] }),
    install: install(),
  });
  assert.deepEqual(result.draft.profiles[0].continuityPhases, ["independent"]);
  assert.deepEqual(result.draft.profiles[0].assetKinds, ["illustration"]);
});

test("fails closed when current model bytes differ from the governance binding", () => {
  assert.throws(
    () =>
      buildDrawThingsCatalogDraft({
        inventory: inventory({ bundleSha256: "2".repeat(64) }),
        governance: governance(),
        install: install(),
        modelId: "fixture-xl",
      }),
    /does not exactly match current local inventory/u,
  );
});

test("fails closed when commercial use is not approved", () => {
  assert.throws(
    () =>
      buildDrawThingsCatalogDraft({
        inventory: inventory(),
        governance: governance({
          license: {
            id: "fixture-license",
            name: "Fixture License",
            url: "https://example.com/license",
            commercialUse: "unknown",
            derivatives: "allowed",
            redistribution: "restricted",
          },
        }),
        install: install(),
        modelId: "fixture-xl",
      }),
    /not approved for commercial use/u,
  );
});

test("fails closed when derivative use is prohibited", () => {
  assert.throws(
    () =>
      buildDrawThingsCatalogDraft({
        inventory: inventory(),
        governance: governance({
          license: {
            id: "fixture-license",
            name: "Fixture License",
            url: "https://example.com/license",
            commercialUse: "allowed",
            derivatives: "prohibited",
            redistribution: "restricted",
          },
        }),
        install: install(),
        modelId: "fixture-xl",
      }),
    /prohibits derivative use/u,
  );
});

test("generated sampler pins all governance-sensitive endpoints and model metadata", () => {
  const { draft } = buildDrawThingsCatalogDraft({
    inventory: inventory(),
    governance: governance(),
    install: install(),
  });
  const sampler = draft.profiles[0].workflow["3"].inputs;
  const required = [
    "settings",
    "server",
    "port",
    "use_tls",
    "model",
    "strength",
    "seed",
    "seed_mode",
    "width",
    "height",
    "steps",
    "num_frames",
    "cfg",
    "cfg_zero_star",
    "cfg_zero_star_init_steps",
    "speed_up",
    "guidance_embed",
    "sampler_name",
    "stochastic_sampling_gamma",
    "res_dpt_shift",
    "shift",
    "batch_size",
    "fps",
    "motion_scale",
    "guiding_frame_noise",
    "start_frame_guidance",
    "causal_inference",
    "causal_inference_pad",
    "clip_skip",
    "sharpness",
    "mask_blur",
    "mask_blur_outset",
    "preserve_original",
    "high_res_fix",
    "high_res_fix_start_width",
    "high_res_fix_start_height",
    "high_res_fix_strength",
    "tiled_decoding",
    "decoding_tile_width",
    "decoding_tile_height",
    "decoding_tile_overlap",
    "tiled_diffusion",
    "diffusion_tile_width",
    "diffusion_tile_height",
    "diffusion_tile_overlap",
    "tea_cache",
    "tea_cache_start",
    "tea_cache_end",
    "tea_cache_threshold",
    "tea_cache_max_skip_steps",
    "separate_clip_l",
    "clip_l_text",
    "separate_open_clip_g",
    "open_clip_g_text",
    "color_calibration",
  ];
  for (const key of required) assert.ok(Object.hasOwn(sampler, key), key);
});
