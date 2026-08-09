import assert from "node:assert/strict";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256 } from "@evavo/art-artifacts";

import {
  COMFYUI_PROVIDER_EVIDENCE_SCHEMA,
  COMFYUI_WORKFLOW_CATALOG_DRAFT_SCHEMA,
  ProviderError,
  compileComfyUIWorkflowCatalog,
  createComfyUIProviderAdapters,
  loadComfyUIWorkflowCatalogFromFile,
  validateComfyUIWorkflowCatalog,
  validateProviderCandidateRequest,
} from "../dist/index.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFklEQVR4nGNgoBo4YaPxHxkPhAKyAQDgPyKxKv0aXwAAAABJRU5ErkJggg==",
  "base64",
);

function workflow() {
  return {
    "1": { class_type: "CLIPTextEncode", inputs: { text: "positive", clip: ["20", 1] } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: "negative", clip: ["20", 1] } },
    "3": { class_type: "EmptyLatentImage", inputs: { width: 512, height: 512, batch_size: 1 } },
    "4": {
      class_type: "KSampler",
      inputs: {
        seed: 1,
        denoise: 1,
        positive: ["1", 0],
        negative: ["2", 0],
        latent_image: ["3", 0],
        model: ["20", 0],
      },
    },
    "5": { class_type: "VAEDecode", inputs: { samples: ["4", 0], vae: ["20", 2] } },
    "6": { class_type: "SaveImage", inputs: { filename_prefix: "evavo", images: ["5", 0] } },
    "7": { class_type: "LoadImage", inputs: { image: "base.png" } },
    "8": { class_type: "LoadImageMask", inputs: { image: "mask.png", channel: "alpha" } },
    "9": { class_type: "LoadImage", inputs: { image: "identity.png" } },
    "10": { class_type: "LoadImage", inputs: { image: "previous.png" } },
    "11": { class_type: "LoadImage", inputs: { image: "next.png" } },
    "20": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "evavo-test.safetensors" } },
  };
}

function draft(profileOverrides = {}) {
  return {
    schemaVersion: COMFYUI_WORKFLOW_CATALOG_DRAFT_SCHEMA,
    catalogId: "evavo-local-comfyui",
    catalogVersion: "1.0.0",
    profiles: [
      {
        profileId: "sprite-match",
        label: "Sprite match, edit and inpaint",
        description:
          "Pinned fixture workflow used to verify exact ComfyUI generation, editing, inpainting and matching-frame bindings.",
        version: "1.0.0",
        priority: 120,
        operations: ["generate", "edit", "inpaint"],
        assetKinds: ["sprite-frame", "sprite-layer", "illustration", "ui"],
        continuityPhases: [
          "identity-master",
          "direction-master",
          "key-pose",
          "in-between",
          "repair",
          "independent",
        ],
        capabilities: [
          "generate",
          "edit",
          "inpaint",
          "reference-images",
          "multiple-reference-images",
          "identity-reference",
          "temporal-reference",
          "mask",
          "seed",
          "custom-size",
          "candidate-count",
          "cancellation",
        ],
        modelId: "evavo-test-checkpoint",
        workflow: workflow(),
        bindings: {
          positivePrompt: { nodeId: "1", input: "text" },
          negativePrompt: { nodeId: "2", input: "text" },
          width: { nodeId: "3", input: "width" },
          height: { nodeId: "3", input: "height" },
          candidateCount: { nodeId: "3", input: "batch_size" },
          seed: { nodeId: "4", input: "seed" },
          filenamePrefix: { nodeId: "6", input: "filename_prefix" },
          referenceImages: [
            { role: "base-image", nodeId: "7", input: "image", strength: { nodeId: "4", input: "denoise" } },
            { role: "mask", nodeId: "8", input: "image" },
            { role: "canonical-identity", nodeId: "9", input: "image" },
            { role: "previous-key-pose", nodeId: "10", input: "image" },
            { role: "next-key-pose", nodeId: "11", input: "image" },
          ],
        },
        outputNodeIds: ["6"],
        modelInventory: [
          {
            id: "evavo-test-checkpoint",
            kind: "checkpoint",
            sha256: "a".repeat(64),
          },
        ],
        runtimeInventory: [
          { id: "comfyui", version: "0.4.0", sha256: "b".repeat(64) },
          { id: "comfy-core-nodes", version: "2026.08.01", sha256: "c".repeat(64) },
        ],
        limits: {
          maximumCandidates: 8,
          maximumReferenceImages: 8,
          maximumSourceBytes: 16 * 1024 * 1024,
        },
        ...profileOverrides,
      },
    ],
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function objectInfo(catalog) {
  const classes = catalog.profiles[0].nodeInventory.map((entry) => entry.classType);
  return Object.fromEntries(
    classes.map((classType) => [
      classType,
      {
        input: { required: {} },
        output: [],
        category: "EVAVO fixture",
        node_version: "1.0.0",
      },
    ]),
  );
}

function baseRequest(overrides = {}) {
  return validateProviderCandidateRequest({
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: "illustration",
    continuityPhase: "independent",
    assetId: "comfy-fixture",
    candidateFamilyId: "comfy-fixture-family",
    creativeIntent: "Create an exact governed fixture candidate.",
    negativeIntent: "No text, no crop and no unrelated detail.",
    style: {
      styleName: "EVAVO fixture",
      intent: "Stable local workflow verification.",
    },
    shot: { subject: "One bounded fixture subject." },
    target: {
      width: 512,
      height: 512,
      transparency: "opaque",
      outputFormat: "png",
    },
    background: { strategy: "opaque-source" },
    candidateCount: 2,
    seed: 42,
    selection: {
      preferredAdapterId: "comfyui:sprite-match",
      allowedAdapterIds: ["comfyui:sprite-match"],
      allowFallback: false,
      requireSeed: true,
    },
    references: [],
    ...overrides,
  });
}

function resolved(request, references = []) {
  return {
    request,
    requestSha256: sha256(JSON.stringify(request)),
    compiledPrompt: "Compiled EVAVO provider prompt.",
    compiledPromptSha256: sha256("Compiled EVAVO provider prompt."),
    references,
  };
}

function reference(role, overrides = {}) {
  const digest = sha256(PNG);
  return {
    artifactId: `artifact_${digest}`,
    role,
    strength: role === "base-image" ? 0.55 : 1,
    required: true,
    artifact: {
      schemaVersion: "1.0",
      protocolVersion: "2026-07-29.1",
      artifactId: `artifact_${digest}`,
      descriptorSha256: "d".repeat(64),
      contentHash: `sha256:${digest}`,
      contentSha256: digest,
      sizeBytes: PNG.length,
      mediaType: "image/png",
      storageClass: "source",
      fileName: `${role}.png`,
      sourceArtifacts: [],
      labels: {},
      objectRelativePath: `objects/${digest}`,
      descriptorRelativePath: `descriptors/${digest}.json`,
    },
    bytes: PNG,
    ...overrides,
  };
}

function adapter(catalog, fetchImpl, options = {}) {
  return createComfyUIProviderAdapters({
    catalog,
    dedicatedInstance: true,
    baseUrl: "http://127.0.0.1:8188",
    fetch: fetchImpl,
    pollIntervalMs: 50,
    executionTimeoutMs: 2_000,
    ...options,
  })[0];
}

test("ComfyUI workflow catalogs are canonical, self-hashed and tamper evident", () => {
  const catalog = compileComfyUIWorkflowCatalog(draft());
  assert.equal(catalog.schemaVersion, "evavo.comfyui-workflow-catalog.v1");
  assert.equal(catalog.catalogSha256.length, 64);
  assert.equal(catalog.profiles[0].workflowSha256.length, 64);
  assert.equal(catalog.profiles[0].nodeInventorySha256.length, 64);
  assert.equal(catalog.profiles[0].modelInventorySha256.length, 64);
  assert.equal(catalog.profiles[0].runtimeInventorySha256.length, 64);
  assert.equal(catalog.profiles[0].profileSha256.length, 64);
  assert.deepEqual(validateComfyUIWorkflowCatalog(catalog), catalog);

  const malformed = structuredClone(catalog);
  malformed.profiles = null;
  assert.throws(
    () => validateComfyUIWorkflowCatalog(malformed),
    (error) => error instanceof ProviderError && error.code === "COMFYUI_CATALOG_INVALID",
  );

  const changed = structuredClone(catalog);
  changed.profiles[0].workflow[1].inputs.text = "changed after compilation";
  assert.throws(
    () => validateComfyUIWorkflowCatalog(changed),
    (error) => error instanceof ProviderError && error.code === "COMFYUI_CATALOG_TAMPERED",
  );

  const collided = draft();
  collided.profiles[0].bindings.height = { nodeId: "3", input: "width" };
  assert.throws(
    () => compileComfyUIWorkflowCatalog(collided),
    (error) => error instanceof ProviderError && /reuse mutable input/.test(error.message),
  );

  const unknownNodeField = draft();
  unknownNodeField.profiles[0].workflow[1].hidden = "not part of API format";
  assert.throws(
    () => compileComfyUIWorkflowCatalog(unknownNodeField),
    (error) => error instanceof ProviderError && error.code === "COMFYUI_CATALOG_INVALID",
  );

  const unhashedRuntime = draft();
  delete unhashedRuntime.profiles[0].runtimeInventory[0].sha256;
  assert.throws(
    () => compileComfyUIWorkflowCatalog(unhashedRuntime),
    (error) => error instanceof ProviderError && error.code === "COMFYUI_CATALOG_INVALID",
  );
});

test("ComfyUI generation binds exact request fields and returns provenance-rich candidates", async () => {
  const catalog = compileComfyUIWorkflowCatalog(draft());
  let submitted;
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/object_info") return jsonResponse(objectInfo(catalog));
    if (url.pathname === "/prompt") {
      submitted = JSON.parse(String(init.body));
      return jsonResponse({ prompt_id: "prompt-001", number: 1, node_errors: {} });
    }
    if (url.pathname === "/history/prompt-001") {
      return jsonResponse({
        "prompt-001": {
          status: { status_str: "success", completed: true },
          outputs: {
            "6": {
              images: [
                { filename: "candidate-01.png", subfolder: "", type: "output" },
                { filename: "candidate-02.png", subfolder: "", type: "output" },
              ],
            },
          },
        },
      });
    }
    if (url.pathname === "/view") {
      return new Response(PNG, { headers: { "content-type": "image/png" } });
    }
    throw new Error(`unexpected URL ${url}`);
  };
  const request = baseRequest();
  const result = await adapter(catalog, fetchImpl).execute(resolved(request), {
    signal: new AbortController().signal,
    requestedAt: new Date("2026-08-10T00:00:00.000Z"),
  });
  assert.equal(result.adapterId, "comfyui:sprite-match");
  assert.equal(result.model, "evavo-test-checkpoint");
  assert.equal(result.externalId, "prompt-001");
  assert.equal(result.outputs.length, 2);
  assert.equal(submitted.prompt["1"].inputs.text, "Compiled EVAVO provider prompt.");
  assert.equal(submitted.prompt["2"].inputs.text, request.negativeIntent);
  assert.equal(submitted.prompt["3"].inputs.width, 512);
  assert.equal(submitted.prompt["3"].inputs.height, 512);
  assert.equal(submitted.prompt["3"].inputs.batch_size, 2);
  assert.equal(submitted.prompt["4"].inputs.seed, 42);
  assert.match(submitted.prompt["6"].inputs.filename_prefix, /^evavo\/provider_/);
  assert.equal(result.metadata.schemaVersion, COMFYUI_PROVIDER_EVIDENCE_SCHEMA);
  assert.equal(result.metadata.catalogSha256, catalog.catalogSha256);
  assert.equal(result.metadata.profileSha256, catalog.profiles[0].profileSha256);
  assert.equal(result.metadata.runtimeNodeDefinitionsSha256.length, 64);
  assert.deepEqual(
    result.metadata.runtimeClassTypes,
    [...new Set(catalog.profiles[0].nodeInventory.map((entry) => entry.classType))].sort(),
  );
  assert.equal(result.metadata.rawWorkflowReturned, false);
  assert.equal(result.metadata.credentialsReturned, false);
  assert.equal(result.metadata.candidateApprovalPerformed, false);
  assert.equal(adapter(catalog, fetchImpl).descriptor.dataPolicy.retainedByProvider, true);
});

test("ComfyUI edit uploads exact source bytes and binds the returned input path", async () => {
  const catalog = compileComfyUIWorkflowCatalog(draft());
  let uploadedBytes;
  let inputReadbacks = 0;
  let submitted;
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/object_info") return jsonResponse(objectInfo(catalog));
    if (url.pathname === "/upload/image") {
      const file = init.body.get("image");
      uploadedBytes = Buffer.from(await file.arrayBuffer());
      return jsonResponse({ name: file.name, subfolder: "", type: "input" });
    }
    if (url.pathname === "/prompt") {
      submitted = JSON.parse(String(init.body));
      return jsonResponse({ prompt_id: "prompt-edit", node_errors: {} });
    }
    if (url.pathname === "/history/prompt-edit") {
      return jsonResponse({
        "prompt-edit": {
          outputs: {
            "6": { images: [{ filename: "edited.png", subfolder: "", type: "output" }] },
          },
        },
      });
    }
    if (url.pathname === "/view") {
      if (url.searchParams.get("type") === "input") inputReadbacks += 1;
      return new Response(PNG);
    }
    throw new Error(`unexpected URL ${url}`);
  };
  const source = reference("base-image");
  const request = baseRequest({
    operation: "edit",
    continuityPhase: "repair",
    candidateCount: 1,
    references: [
      {
        artifactId: source.artifactId,
        role: "base-image",
        strength: 0.55,
        required: true,
      },
    ],
  });
  const result = await adapter(catalog, fetchImpl).execute(resolved(request, [source]), {
    signal: new AbortController().signal,
    requestedAt: new Date("2026-08-10T00:00:00.000Z"),
  });
  assert.deepEqual(uploadedBytes, PNG);
  assert.equal(inputReadbacks, 1);
  assert.equal(submitted.prompt["7"].inputs.image, `${source.artifact.contentSha256}.png`);
  assert.equal(submitted.prompt["4"].inputs.denoise, 0.55);
  assert.equal(result.metadata.referenceUploads[0].artifactId, source.artifactId);
  assert.equal(result.metadata.referenceUploads[0].contentSha256, source.artifact.contentSha256);

  const changed = reference("base-image", { bytes: Buffer.from(PNG).fill(0, 0, 1) });
  await assert.rejects(
    () => adapter(catalog, fetchImpl).execute(resolved(request, [changed]), {
      signal: new AbortController().signal,
      requestedAt: new Date(),
    }),
    (error) => error instanceof ProviderError && error.code === "COMFYUI_REFERENCE_IDENTITY_MISMATCH",
  );
});

test("ComfyUI fails closed on unsafe endpoints, changed uploads, traversal, missing nodes and cancellation", async () => {
  const catalog = compileComfyUIWorkflowCatalog(draft());
  assert.throws(
    () => createComfyUIProviderAdapters({
      catalog,
      dedicatedInstance: true,
      baseUrl: "http://gpu.example.com:8188",
      allowRemote: true,
    }),
    (error) => error instanceof ProviderError && error.code === "COMFYUI_REMOTE_TLS_REQUIRED",
  );
  assert.throws(
    () => createComfyUIProviderAdapters({
      catalog,
      dedicatedInstance: true,
      apiToken: "unsafe\nheader",
    }),
    (error) => error instanceof ProviderError && error.code === "COMFYUI_CONFIGURATION_INVALID",
  );

  const source = reference("base-image");
  const edit = baseRequest({
    operation: "edit",
    continuityPhase: "repair",
    candidateCount: 1,
    references: [{ artifactId: source.artifactId, role: "base-image", required: true }],
  });
  const changedUpload = adapter(catalog, async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/object_info") return jsonResponse(objectInfo(catalog));
    if (url.pathname === "/upload/image") return jsonResponse({ name: "changed.png", subfolder: "", type: "input" });
    throw new Error(`unexpected ${url} ${init.method}`);
  });
  await assert.rejects(
    () => changedUpload.execute(resolved(edit, [source]), {
      signal: new AbortController().signal,
      requestedAt: new Date(),
    }),
    (error) => error instanceof ProviderError && error.code === "COMFYUI_UPLOAD_IDENTITY_MISMATCH",
  );

  const changedStoredBytes = adapter(catalog, async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/object_info") return jsonResponse(objectInfo(catalog));
    if (url.pathname === "/upload/image") {
      const file = init.body.get("image");
      return jsonResponse({ name: file.name, subfolder: "", type: "input" });
    }
    if (url.pathname === "/view" && url.searchParams.get("type") === "input") {
      return new Response(Buffer.from(PNG).fill(0, 0, 1));
    }
    throw new Error(`unexpected ${url} ${init.method}`);
  });
  await assert.rejects(
    () => changedStoredBytes.execute(resolved(edit, [source]), {
      signal: new AbortController().signal,
      requestedAt: new Date(),
    }),
    (error) => error instanceof ProviderError && error.code === "COMFYUI_UPLOAD_IDENTITY_MISMATCH",
  );

  const missingNode = structuredClone(objectInfo(catalog));
  delete missingNode.SaveImage;
  await assert.rejects(
    () => adapter(catalog, async (input) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/object_info") return jsonResponse(missingNode);
      throw new Error(`unexpected ${url}`);
    }).execute(resolved(baseRequest()), {
      signal: new AbortController().signal,
      requestedAt: new Date(),
    }),
    (error) => error instanceof ProviderError && error.code === "COMFYUI_RUNTIME_NODE_MISSING",
  );

  const traversal = adapter(catalog, async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/object_info") return jsonResponse(objectInfo(catalog));
    if (url.pathname === "/prompt") return jsonResponse({ prompt_id: "traversal", node_errors: {} });
    if (url.pathname === "/history/traversal") {
      return jsonResponse({ traversal: { outputs: { "6": { images: [{ filename: "evil.png", subfolder: "../escape", type: "output" }] } } } });
    }
    throw new Error(`unexpected ${url}`);
  });
  await assert.rejects(
    () => traversal.execute(resolved(baseRequest({ candidateCount: 1 })), {
      signal: new AbortController().signal,
      requestedAt: new Date(),
    }),
    (error) => error instanceof ProviderError && error.code === "COMFYUI_PATH_INVALID",
  );

  const duplicateOutput = adapter(catalog, async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/object_info") return jsonResponse(objectInfo(catalog));
    if (url.pathname === "/prompt") return jsonResponse({ prompt_id: "duplicate-output", node_errors: {} });
    if (url.pathname === "/history/duplicate-output") {
      return jsonResponse({
        "duplicate-output": {
          outputs: {
            "6": {
              images: [
                { filename: "same.png", subfolder: "", type: "output" },
                { filename: "same.png", subfolder: "", type: "output" },
              ],
            },
          },
        },
      });
    }
    throw new Error(`unexpected ${url}`);
  });
  await assert.rejects(
    () => duplicateOutput.execute(resolved(baseRequest()), {
      signal: new AbortController().signal,
      requestedAt: new Date(),
    }),
    (error) => error instanceof ProviderError && error.code === "COMFYUI_OUTPUT_INVALID",
  );

  let interrupted = false;
  const controller = new AbortController();
  const cancellable = adapter(catalog, async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/object_info") return jsonResponse(objectInfo(catalog));
    if (url.pathname === "/prompt") {
      setTimeout(() => controller.abort(), 5);
      return jsonResponse({ prompt_id: "cancel-me", node_errors: {} });
    }
    if (url.pathname === "/history/cancel-me") return jsonResponse({});
    if (url.pathname === "/interrupt") {
      interrupted = true;
      return jsonResponse({ ok: true });
    }
    throw new Error(`unexpected ${url}`);
  });
  await assert.rejects(
    () => cancellable.execute(resolved(baseRequest({ candidateCount: 1 })), {
      signal: controller.signal,
      requestedAt: new Date(),
    }),
    (error) => error instanceof ProviderError && error.classification === "cancelled",
  );
  assert.equal(interrupted, true);
});

test("ComfyUI catalog loading is root confined and rejects symlink escapes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-comfy-root-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "evavo-comfy-outside-"));
  const catalog = compileComfyUIWorkflowCatalog(draft());
  const insidePath = path.join(root, "catalog.json");
  await writeFile(insidePath, `${JSON.stringify(catalog, null, 2)}\n`);
  assert.equal(loadComfyUIWorkflowCatalogFromFile(insidePath, root).catalogSha256, catalog.catalogSha256);

  const outsidePath = path.join(outside, "catalog.json");
  await writeFile(outsidePath, `${JSON.stringify(catalog)}\n`);
  assert.throws(
    () => loadComfyUIWorkflowCatalogFromFile(outsidePath, root),
    (error) => error instanceof ProviderError && error.code === "COMFYUI_CATALOG_PATH_FORBIDDEN",
  );
  const link = path.join(root, "linked.json");
  await symlink(outsidePath, link);
  assert.throws(
    () => loadComfyUIWorkflowCatalogFromFile(link, root),
    (error) => error instanceof ProviderError && error.code === "COMFYUI_CATALOG_PATH_FORBIDDEN",
  );

  const rootLink = `${root}-link`;
  await symlink(root, rootLink, "dir");
  assert.throws(
    () => loadComfyUIWorkflowCatalogFromFile(path.join(rootLink, "catalog.json"), rootLink),
    (error) => error instanceof ProviderError && error.code === "COMFYUI_CATALOG_PATH_FORBIDDEN",
  );
});
