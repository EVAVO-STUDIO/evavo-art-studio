import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDrawThingsCatalogDraft,
  governanceFromPolicy,
} from "./draw-things-local-models.mjs";
import {
  compileComfyUIWorkflowCatalog,
} from "../packages/providers/dist/index.js";

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
  assert.equal(result.draft.profiles.length, 2);
  const profile = result.draft.profiles.find(
    (entry) => entry.profileId === "dt-fixture-xl-generate",
  );
  assert.ok(profile);
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


function policy(overrides = {}) {
  return {
    schema: "evavo.draw-things-approved-model-policy.v1",
    policyId: "fixture-policy",
    reviewedBy: "EVAVO Studio",
    reviewedAt: "2026-09-18T03:47:00.000Z",
    models: [
      {
        id: "fixture-xl",
        inventoryName: "Fixture XL",
        inventoryFile: "fixture_xl.safetensors",
        version: "sdxl",
        expectedFiles: [
          {
            name: "fixture_xl.safetensors",
            sha256: "1".repeat(64),
          },
        ],
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
        generationDefaults: {
          steps: 7,
          cfg: 2.5,
          samplerName: "DDIM Trailing",
          seedMode: "ScaleAlike",
          clipSkip: 2,
          shift: 3,
          resolutionDependentShift: false,
          speedUp: true,
          teaCache: false,
          teaCacheThreshold: 0.3,
          teaCacheStart: 5,
          teaCacheEnd: -1,
          teaCacheMaxSkipSteps: 3,
        },
        priority: 220,
        resourceClass: "quality",
        ...overrides,
      },
    ],
  };
}

test("reviewed policy binds exact current physical files into generated governance", () => {
  const result = governanceFromPolicy(
    inventory(),
    policy(),
    "9".repeat(64),
  );
  assert.equal(result.policyId, "fixture-policy");
  assert.equal(result.policySha256, "9".repeat(64));
  assert.equal(result.models.length, 1);
  assert.equal(result.models[0].bundleSha256, BUNDLE);
  assert.equal(result.models[0].priority, 220);
  assert.equal(result.models[0].resourceClass, "quality");
  assert.equal(result.models[0].generationDefaults.steps, 7);
  assert.equal(result.models[0].generationDefaults.samplerName, "DDIM Trailing");
});

test("reviewed policy rejects an unexpected tensor sidecar until it is explicitly reviewed", () => {
  const input = inventory({
    components: [
      {
        relativePath: "fixture_xl.safetensors",
        sizeBytes: 1024,
        sha256: "1".repeat(64),
      },
      {
        relativePath: "fixture_xl.safetensors-tensordata",
        sizeBytes: 4096,
        sha256: "2".repeat(64),
      },
    ],
  });
  assert.throws(
    () => governanceFromPolicy(input, policy(), "9".repeat(64)),
    /unreviewed physical components/u,
  );
});

test("reviewed policy rejects dependency hash drift", () => {
  const input = inventory({
    components: [
      {
        relativePath: "fixture_xl.safetensors",
        sizeBytes: 1024,
        sha256: "3".repeat(64),
      },
    ],
  });
  assert.throws(
    () => governanceFromPolicy(input, policy(), "9".repeat(64)),
    /current inventory differs/u,
  );
});

test("model-specific governance defaults control the Draw Things sampler", () => {
  const generated = governanceFromPolicy(
    inventory(),
    policy(),
    "9".repeat(64),
  );
  const { draft } = buildDrawThingsCatalogDraft({
    inventory: inventory(),
    governance: generated,
    install: install(),
  });
  const sampler = draft.profiles[0].workflow["3"].inputs;
  assert.equal(sampler.steps, 7);
  assert.equal(sampler.cfg, 2.5);
  assert.equal(sampler.sampler_name, "DDIM Trailing");
  assert.equal(sampler.seed_mode, "ScaleAlike");
  assert.equal(sampler.clip_skip, 2);
  assert.equal(sampler.shift, 3);
  assert.equal(sampler.res_dpt_shift, false);
  assert.equal(sampler.speed_up, true);
  assert.equal(sampler.tea_cache_end, -1);
  assert.equal(draft.profiles[0].priority, 220);
});

test("catalog carries multiple governed models and sorts them by routing priority", () => {
  const firstInventory = inventory().models[0];
  const secondInventory = {
    ...structuredClone(firstInventory),
    id: "dt-fallback",
    name: "Fixture Fallback",
    file: "fallback.ckpt",
    version: "fallback",
    bundleSha256: "4".repeat(64),
    metadataSha256: "5".repeat(64),
    components: [
      {
        relativePath: "fallback.ckpt",
        sizeBytes: 2048,
        sha256: "6".repeat(64),
      },
    ],
    model: {
      name: "Fixture Fallback",
      file: "fallback.ckpt",
      version: "fallback",
      prefix: "",
    },
  };
  const multiInventory = {
    ...inventory(),
    models: [firstInventory, secondInventory],
    rawCategoryCounts: { models: 2 },
  };
  const primary = governance({
    priority: 220,
    generationDefaults: policy().models[0].generationDefaults,
  }).models[0];
  const fallback = {
    ...structuredClone(primary),
    id: "fixture-fallback",
    inventoryName: "Fixture Fallback",
    inventoryFile: "fallback.ckpt",
    version: "fallback",
    bundleSha256: "4".repeat(64),
    priority: 100,
    generationDefaults: {
      ...policy().models[0].generationDefaults,
      steps: 16,
      cfg: 5,
      samplerName: "DPM++ 2M AYS",
    },
  };
  const { draft, governanceEvidence } = buildDrawThingsCatalogDraft({
    inventory: multiInventory,
    governance: {
      schema: "evavo.draw-things-model-governance.v1",
      models: [fallback, primary],
    },
    install: install(),
  });
  assert.equal(draft.profiles.length, 4);
  const primaryBase = draft.profiles.find(
    (profile) => profile.profileId === "dt-fixture-xl-generate",
  );
  const fallbackBase = draft.profiles.find(
    (profile) => profile.profileId === "dt-fixture-fallback-generate",
  );
  assert.ok(primaryBase);
  assert.ok(fallbackBase);
  assert.equal(primaryBase.modelId, "fixture-xl");
  assert.equal(primaryBase.priority, 220);
  assert.equal(primaryBase.workflow["3"].inputs.steps, 7);
  assert.equal(fallbackBase.modelId, "fixture-fallback");
  assert.equal(fallbackBase.priority, 100);
  assert.equal(fallbackBase.workflow["3"].inputs.steps, 16);
  assert.equal(governanceEvidence.models.length, 2);
});


test("all governed models get one canonical identity reference profile", () => {
  const { draft } = buildDrawThingsCatalogDraft({
    inventory: inventory(),
    governance: governance(),
    install: install(),
  });
  const identity = draft.profiles.find(
    (profile) => profile.profileId === "dt-fixture-xl-generate-identity-ref",
  );
  assert.ok(identity);
  assert.equal(identity.priority, 169);
  assert.equal(identity.workflow["5"].class_type, "LoadImage");
  assert.deepEqual(identity.workflow["3"].inputs.image, ["5", 0]);
  assert.equal(identity.workflow["3"].inputs.strength, 0.55);
  assert.ok(identity.capabilities.includes("reference-images"));
  assert.ok(identity.capabilities.includes("identity-reference"));
  assert.ok(!identity.capabilities.includes("multiple-reference-images"));
  assert.ok(!identity.capabilities.includes("temporal-reference"));
  assert.deepEqual(identity.bindings.referenceImages, [
    {
      role: "canonical-identity",
      nodeId: "5",
      input: "image",
    },
  ]);
  assert.equal(identity.limits.maximumReferenceImages, 1);
});

test("Kontext models get capability-honest direction and temporal reference profiles", () => {
  const kontextInventory = inventory({
    model: {
      name: "Fixture XL",
      file: "fixture_xl.safetensors",
      version: "sdxl",
      prefix: "",
      modifier: "kontext",
    },
  });
  const { draft } = buildDrawThingsCatalogDraft({
    inventory: kontextInventory,
    governance: governance({ priority: 220 }),
    install: install(),
  });
  assert.equal(draft.profiles.length, 4);

  const base = draft.profiles.find(
    (profile) => profile.profileId === "dt-fixture-xl-generate",
  );
  const identity = draft.profiles.find(
    (profile) => profile.profileId === "dt-fixture-xl-generate-identity-ref",
  );
  const direction = draft.profiles.find(
    (profile) => profile.profileId === "dt-fixture-xl-generate-direction-ref",
  );
  const temporal = draft.profiles.find(
    (profile) => profile.profileId === "dt-fixture-xl-generate-temporal-ref",
  );
  assert.ok(base);
  assert.ok(identity);
  assert.ok(direction);
  assert.ok(temporal);
  assert.equal(base.priority, 220);
  assert.equal(identity.priority, 219);
  assert.equal(direction.priority, 218);
  assert.equal(temporal.priority, 217);

  assert.equal(identity.workflow["3"].inputs.strength, 1);
  assert.ok(direction.capabilities.includes("multiple-reference-images"));
  assert.ok(direction.capabilities.includes("direction-reference"));
  assert.ok(!direction.capabilities.includes("temporal-reference"));
  assert.equal(direction.workflow["8"].class_type, "DrawThingsHints");
  assert.equal(direction.workflow["8"].inputs.type, "Shuffle (Moodboard)");
  assert.equal(direction.workflow["8"].inputs.weight, 0.85);
  assert.deepEqual(direction.workflow["8"].inputs.image, ["6", 0]);
  assert.deepEqual(direction.workflow["3"].inputs.hints, ["8", 0]);
  assert.deepEqual(
    direction.bindings.referenceImages.map((reference) => reference.role),
    ["canonical-identity", "direction-master"],
  );

  assert.ok(temporal.capabilities.includes("multiple-reference-images"));
  assert.ok(temporal.capabilities.includes("temporal-reference"));
  assert.ok(!temporal.capabilities.includes("direction-reference"));
  assert.equal(temporal.workflow["8"].inputs.type, "Shuffle (Moodboard)");
  assert.equal(temporal.workflow["8"].inputs.type_2, "Shuffle (Moodboard)");
  assert.equal(temporal.workflow["8"].inputs.weight, 0.8);
  assert.equal(temporal.workflow["8"].inputs.weight_2, 0.8);
  assert.deepEqual(temporal.workflow["8"].inputs.image, ["6", 0]);
  assert.deepEqual(temporal.workflow["8"].inputs.image_2, ["7", 0]);
  assert.deepEqual(temporal.workflow["3"].inputs.hints, ["8", 0]);
  assert.deepEqual(
    temporal.bindings.referenceImages.map((reference) => reference.role),
    ["canonical-identity", "previous-key-pose", "next-key-pose"],
  );
  assert.ok(temporal.continuityPhases.includes("in-between"));
  assert.equal(temporal.limits.maximumReferenceImages, 3);
});

test("non-Kontext fallback never advertises direction or temporal reference capabilities", () => {
  const { draft } = buildDrawThingsCatalogDraft({
    inventory: inventory(),
    governance: governance({ priority: 140 }),
    install: install(),
  });
  assert.equal(draft.profiles.length, 2);
  for (const profile of draft.profiles) {
    assert.ok(!profile.capabilities.includes("direction-reference"));
    assert.ok(!profile.capabilities.includes("temporal-reference"));
    assert.ok(!profile.capabilities.includes("multiple-reference-images"));
  }
});

test("reference profiles stay below their no-reference base route priority", () => {
  const kontextInventory = inventory({
    model: {
      name: "Fixture XL",
      file: "fixture_xl.safetensors",
      version: "sdxl",
      prefix: "",
      modifier: "kontext_kv",
    },
  });
  const { draft } = buildDrawThingsCatalogDraft({
    inventory: kontextInventory,
    governance: governance({ priority: 50 }),
    install: install(),
  });
  const byId = new Map(draft.profiles.map((profile) => [profile.profileId, profile]));
  assert.equal(byId.get("dt-fixture-xl-generate").priority, 50);
  assert.equal(byId.get("dt-fixture-xl-generate-identity-ref").priority, 49);
  assert.equal(byId.get("dt-fixture-xl-generate-direction-ref").priority, 48);
  assert.equal(byId.get("dt-fixture-xl-generate-temporal-ref").priority, 47);
});


test("generated Kontext reference profiles compile through the real governed catalog validator", () => {
  const kontextInventory = inventory({
    model: {
      name: "Fixture XL",
      file: "fixture_xl.safetensors",
      version: "sdxl",
      prefix: "",
      modifier: "kontext",
    },
  });
  const { draft } = buildDrawThingsCatalogDraft({
    inventory: kontextInventory,
    governance: governance({
      priority: 220,
      generationDefaults: policy().models[0].generationDefaults,
    }),
    install: install(),
  });
  const compiled = compileComfyUIWorkflowCatalog(draft);
  assert.equal(compiled.profiles.length, 4);
  const temporal = compiled.profiles.find(
    (profile) => profile.profileId === "dt-fixture-xl-generate-temporal-ref",
  );
  assert.ok(temporal);
  assert.ok(temporal.capabilities.includes("identity-reference"));
  assert.ok(temporal.capabilities.includes("temporal-reference"));
  assert.ok(temporal.capabilities.includes("multiple-reference-images"));
  assert.deepEqual(
    temporal.bindings.referenceImages.map((reference) => reference.role),
    ["canonical-identity", "previous-key-pose", "next-key-pose"],
  );
  assert.ok(
    temporal.nodeInventory.some(
      (node) => node.classType === "DrawThingsHints",
    ),
  );
  assert.ok(
    temporal.nodeInventory.filter((node) => node.classType === "LoadImage").length === 3,
  );
});
