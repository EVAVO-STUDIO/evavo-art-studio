import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";

import {
  cloudinaryContextString,
  cloudinaryMetadataString,
  parseCloudinaryUrl,
  pipelineCapabilities,
  prepareWebAssets,
  publishWebAssets,
  searchCloudinaryAssets,
  stageWebAssetSource,
  uploadCloudinaryAsset,
  validateWebAssetManifest,
  WebAssetPipelineError,
} from "../tools/web_asset_pipeline.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MCP_PATH = path.resolve(HERE, "../tools/web_asset_pipeline_mcp.mjs");
const EXAMPLE_MANIFEST_PATH = path.resolve(
  HERE,
  "../config/web-asset-pipeline.example.json",
);
const EXAMPLE_MCP_PATH = path.resolve(
  HERE,
  "../config/mcp.web-asset-pipeline.windows.example.json",
);

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function manifestFor(sourceBytes = Buffer.from("source-image")) {
  return {
    contract: "evavo_web_asset_pipeline_v1",
    schemaVersion: "1.0",
    batchId: "portfolio-assets-2026-08-16",
    createdAt: "2026-08-16T00:00:00.000Z",
    assets: [
      {
        id: "react-commerce-control-plane",
        source: {
          surface: "chatgpt-library",
          path: "incoming/react-commerce-control-plane.png",
          originalName: "React Commerce Control Plane.png",
          sha256: digest(sourceBytes),
          bytes: sourceBytes.byteLength,
          mediaType: "image/png",
          originRef: "library-item:opaque-reference",
        },
        naming: {
          fileStem: "react-commerce-control-plane-2026",
          publicId:
            "evavo/work/react-commerce/react-commerce-control-plane-2026",
          assetFolder: "evavo/work/react-commerce",
          displayName: "React Commerce Control Plane 2026",
        },
        content: {
          alt: "React Commerce control plane on a transparent canvas.",
          accessibilityAlt:
            "Interface illustration representing the React Commerce control plane.",
          caption: "Commerce operations, content and deployment control plane.",
          title: "React Commerce Control Plane",
          project: "React Commerce",
          assetRole: "active Work page support image",
          usage: "react_commerce_support_image",
          usageNote: "Use beside the platform architecture section.",
          siteArea: "work/react-commerce",
          reviewDate: "2026-08-16",
          reviewStatus: "approved",
          reviewedBy: "pipeline-test-reviewer",
        },
        background: { mode: "preserve" },
        delivery: {
          objectFit: "contain",
          publishVariants: ["master", "web"],
        },
        cloudinary: {
          tags: ["portfolio", "react-commerce"],
          context: { campaign: "portfolio-refresh" },
          metadata: {},
          indexForVisualSearch: false,
        },
      },
    ],
  };
}

function expectPipelineCode(code) {
  return (error) => {
    assert.ok(error instanceof WebAssetPipelineError);
    assert.equal(error.code, code);
    return true;
  };
}

test("validates a ChatGPT Library raster manifest with deterministic IDs", () => {
  const result = validateWebAssetManifest(manifestFor());
  assert.equal(result.assets[0].source.surface, "chatgpt-library");
  assert.deepEqual(result.assets[0].delivery.publishVariants, ["master", "web"]);
  assert.equal(
    result.assets[0].naming.publicId,
    "evavo/work/react-commerce/react-commerce-control-plane-2026",
  );
});

test("committed manifest and MCP examples remain valid JSON contracts", async () => {
  const example = JSON.parse(await readFile(EXAMPLE_MANIFEST_PATH, "utf8"));
  const normalized = validateWebAssetManifest(example);
  assert.equal(normalized.assets[0].content.reviewStatus, "review-required");
  assert.equal(normalized.assets[0].cloudinary.indexForVisualSearch, false);
  const mcp = JSON.parse(await readFile(EXAMPLE_MCP_PATH, "utf8"));
  assert.equal(
    mcp.mcpServers["evavo-web-assets"].args[0].endsWith(
      "web_asset_pipeline_mcp.mjs",
    ),
    true,
  );
  assert.equal(JSON.stringify(mcp).includes("CLOUDINARY_URL"), false);
});

test("rejects SVG intake before any image processing", () => {
  const value = manifestFor();
  value.assets[0].source.path = "incoming/react-commerce-control-plane.svg";
  assert.throws(
    () => validateWebAssetManifest(value),
    expectPipelineCode("WEB_ASSET_RASTER_REQUIRED"),
  );
});

test("rejects incomplete content metadata", () => {
  const value = manifestFor();
  delete value.assets[0].content.alt;
  assert.throws(
    () => validateWebAssetManifest(value),
    expectPipelineCode("WEB_ASSET_MANIFEST_INVALID"),
  );
});

test("rejects nondeterministic Cloudinary public IDs", () => {
  const value = manifestFor();
  value.assets[0].naming.publicId = "evavo/work/react-commerce/something-else";
  assert.throws(
    () => validateWebAssetManifest(value),
    expectPipelineCode("WEB_ASSET_MANIFEST_INVALID"),
  );
});

test("escapes and sorts Cloudinary context values", () => {
  assert.equal(
    cloudinaryContextString({ z: "last", a: "x=y|z\\q" }),
    "a=x\\=y\\|z\\\\q|z=last",
  );
  assert.equal(
    cloudinaryMetadataString({ title_id: 'A "quoted" value' }),
    'title_id=A \\"quoted\\" value',
  );
});

test("parses CLOUDINARY_URL without returning it from capabilities", () => {
  const credentials = parseCloudinaryUrl(
    "cloudinary://api-key:super%2Fsecret@evavo-cloud",
  );
  assert.deepEqual(credentials, {
    apiKey: "api-key",
    apiSecret: "super/secret",
    cloudName: "evavo-cloud",
  });
  const serialized = JSON.stringify(pipelineCapabilities());
  assert.equal(serialized.includes("super/secret"), false);
  assert.equal(pipelineCapabilities().credentialsReturned, false);
  assert.equal(pipelineCapabilities().sourceBytesFlowThroughMcp, false);
  assert.equal(pipelineCapabilities().svgAccepted, false);
});

test("forms a create-only authenticated Cloudinary upload and sanitizes its result", async () => {
  const credentials = {
    apiKey: "key-123",
    apiSecret: "secret-456",
    cloudName: "example-cloud",
  };
  const bytes = Buffer.from([1, 2, 3]);
  const descriptor = {
    mediaType: "image/webp",
    fileName: "asset.web.webp",
    publicId: "evavo/work/example/asset",
    assetFolder: "evavo/work/example",
    displayName: "Example asset — web delivery",
    tags: ["evavo", "production"],
    context: { alt: "Example" },
    metadata: {},
    format: "webp",
    width: 2,
    height: 1,
  };
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return new Response(
      JSON.stringify({
        asset_id: "asset-id",
        public_id: descriptor.publicId,
        version: 123,
        version_id: "version-id",
        format: "webp",
        resource_type: "image",
        bytes: bytes.byteLength,
        width: 2,
        height: 1,
        secure_url: "https://res.cloudinary.com/example/image/upload/asset.webp",
        created_at: "2026-08-16T00:00:00Z",
        etag: "etag",
        tags: descriptor.tags,
        context: descriptor.context,
        existing: false,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const result = await uploadCloudinaryAsset({
    credentials,
    descriptor,
    bytes,
    fetchImpl,
  });
  assert.equal(
    captured.url,
    "https://api.cloudinary.com/v1_1/example-cloud/image/upload",
  );
  assert.equal(
    captured.options.headers.Authorization,
    `Basic ${Buffer.from("key-123:secret-456").toString("base64")}`,
  );
  assert.equal(captured.options.body.get("overwrite"), "false");
  assert.equal(captured.options.body.get("unique_filename"), "false");
  assert.equal(captured.options.body.get("backup"), "true");
  assert.equal(captured.options.body.has("visual_search"), false);
  assert.equal(captured.options.body.get("public_id"), descriptor.publicId);
  assert.equal(captured.options.body.get("asset_folder"), descriptor.assetFolder);
  assert.equal(JSON.stringify(result).includes("secret-456"), false);
  assert.equal(JSON.stringify(result).includes("Authorization"), false);
  assert.equal(result.publicId, descriptor.publicId);
});

test("redacts Cloudinary credentials even when a provider error echoes them", async () => {
  const credentials = {
    apiKey: "echoed-key",
    apiSecret: "echoed-secret",
    cloudName: "example-cloud",
  };
  let failure;
  try {
    await uploadCloudinaryAsset({
      credentials,
      descriptor: {
        mediaType: "image/webp",
        fileName: "asset.web.webp",
        publicId: "evavo/work/example/asset",
        assetFolder: "evavo/work/example",
        displayName: "Example asset",
        tags: ["evavo"],
        context: { alt: "Example" },
        metadata: {},
        indexForVisualSearch: false,
        format: "webp",
        width: 2,
        height: 1,
      },
      bytes: Buffer.from([1, 2, 3]),
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "bad echoed-key echoed-secret ZWNob2VkLWtleTplY2hvZWQtc2VjcmV0",
            },
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
    });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof WebAssetPipelineError);
  assert.equal(failure.code, "WEB_ASSET_CLOUDINARY_UPLOAD_REJECTED");
  assert.equal(failure.message.includes("echoed-key"), false);
  assert.equal(failure.message.includes("echoed-secret"), false);
  assert.equal(failure.message.includes("ZWNob2VkLWtleTplY2hvZWQtc2VjcmV0"), false);
});

test("searches bounded Cloudinary inventory without returning credentials", async () => {
  let captured;
  const result = await searchCloudinaryAssets({
    cloudinaryUrl: "cloudinary://inventory-key:inventory-secret@example-cloud",
    expression: "resource_type:image AND tags=react-commerce",
    maxResults: 5,
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(
        JSON.stringify({
          total_count: 1,
          resources: [
            {
              asset_id: "asset-1",
              public_id: "evavo/work/react-commerce/control-plane",
              asset_folder: "evavo/work/react-commerce",
              display_name: "React Commerce control plane",
              filename: "control-plane",
              format: "webp",
              resource_type: "image",
              type: "upload",
              bytes: 12345,
              width: 1920,
              height: 1080,
              created_at: "2026-08-16T00:00:00Z",
              secure_url: "https://res.cloudinary.com/example/image/upload/control-plane.webp",
              status: "active",
              tags: ["react-commerce"],
              context: { alt: "Control plane" },
              metadata: {},
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  assert.equal(captured.options.method, "GET");
  assert.equal(
    captured.url.searchParams.get("expression"),
    "resource_type:image AND tags=react-commerce",
  );
  assert.equal(captured.url.searchParams.get("max_results"), "5");
  assert.equal(
    captured.options.headers.Authorization,
    `Basic ${Buffer.from("inventory-key:inventory-secret").toString("base64")}`,
  );
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].publicId, "evavo/work/react-commerce/control-plane");
  assert.equal(result.readOnly, true);
  assert.equal(JSON.stringify(result).includes("inventory-secret"), false);
});

test("stages an exact chat raster and returns a manifest-ready source block", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-web-stage-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const connectorRoot = path.join(root, "connector");
  const workspace = path.join(root, "workspace");
  await mkdir(connectorRoot);
  await mkdir(workspace);
  await mkdir(path.join(workspace, "incoming"));
  const bytes = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("exact-chat-image-bytes"),
  ]);
  await writeFile(path.join(connectorRoot, "generated.png"), bytes);
  const result = await stageWebAssetSource({
    sourceRoot: connectorRoot,
    sourcePath: "generated.png",
    workspaceRoot: workspace,
    destinationPath: "incoming/react-commerce-control-plane.png",
    surface: "chatgpt-conversation",
    originalName: "generated.png",
    originRef: "conversation:opaque-reference",
    allowedRoots: [root],
    allowWrites: true,
    confirmLocalWrite: true,
  });
  assert.equal(result.source.sha256, digest(bytes));
  assert.equal(result.source.bytes, bytes.byteLength);
  assert.equal(result.source.mediaType, "image/png");
  assert.equal(result.source.path, "incoming/react-commerce-control-plane.png");
  assert.equal(result.sourceBytesReturned, false);
  assert.deepEqual(
    await readFile(path.join(workspace, result.source.path)),
    bytes,
  );
  await writeFile(
    path.join(connectorRoot, "renamed-svg.png"),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
  );
  await assert.rejects(
    stageWebAssetSource({
      sourceRoot: connectorRoot,
      sourcePath: "renamed-svg.png",
      workspaceRoot: workspace,
      destinationPath: "incoming/renamed-svg.png",
      surface: "attachment",
      originalName: "renamed-svg.png",
      allowedRoots: [root],
      allowWrites: true,
      confirmLocalWrite: true,
    }),
    expectPipelineCode("WEB_ASSET_STAGE_MEDIA_MISMATCH"),
  );
});

test("prepares exact create-only outputs and publishes only the reverified plan", async (t) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "evavo-web-asset-"));
  t.after(async () => rm(workspace, { recursive: true, force: true }));
  const sourceBytes = Buffer.from("immutable-source-image");
  await mkdir(path.join(workspace, "incoming"));
  await writeFile(
    path.join(workspace, "incoming", "react-commerce-control-plane.png"),
    sourceBytes,
  );
  const manifest = manifestFor(sourceBytes);
  await writeFile(
    path.join(workspace, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await mkdir(path.join(workspace, "prepared"));
  const processors = {
    recoverBackgroundAlpha: async () => {
      throw new Error("preserve mode must not call alpha recovery");
    },
    suppressChromaSpill: async () => {
      throw new Error("preserve mode must not call spill suppression");
    },
    optimizeDeliveryImage: async (_input, request) => {
      const master = request.profileId === "source-master-lossless";
      const output = Buffer.from(master ? "lossless-png" : "optimized-webp");
      return {
        bytes: output,
        evidence: {
          prepared: {
            width: master ? 2400 : 1920,
            height: master ? 1600 : 1080,
            hasAlpha: true,
          },
          profileId: request.profileId,
        },
      };
    },
  };
  const prepared = await prepareWebAssets({
    workspaceRoot: workspace,
    manifestPath: "manifest.json",
    outputRoot: "prepared/batch-001",
    allowedRoots: [workspace],
    allowWrites: true,
    processors,
  });
  assert.equal(prepared.cloudinaryMutationPerformed, false);
  assert.equal(
    await readFile(
      path.join(workspace, "prepared/batch-001/assets/react-commerce-control-plane/react-commerce-control-plane-2026.master.png"),
      "utf8",
    ),
    "lossless-png",
  );
  assert.deepEqual(
    await readFile(
      path.join(workspace, "incoming", "react-commerce-control-plane.png"),
    ),
    sourceBytes,
  );

  const uploadCalls = [];
  const fetchImpl = async (_url, options) => {
    const form = options.body;
    const file = form.get("file");
    const publicId = form.get("public_id");
    const fileBytes = Buffer.from(await file.arrayBuffer());
    const isMaster = String(publicId).endsWith("-master");
    uploadCalls.push({ publicId, sha256: digest(fileBytes) });
    return new Response(
      JSON.stringify({
        asset_id: `provider-${uploadCalls.length}`,
        public_id: publicId,
        version: uploadCalls.length,
        version_id: `version-${uploadCalls.length}`,
        format: isMaster ? "png" : "webp",
        resource_type: "image",
        bytes: fileBytes.byteLength,
        width: isMaster ? 2400 : 1920,
        height: isMaster ? 1600 : 1080,
        secure_url: `https://res.cloudinary.com/example/image/upload/${publicId}`,
        created_at: "2026-08-16T00:00:00Z",
        etag: `etag-${uploadCalls.length}`,
        existing: false,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const published = await publishWebAssets({
    workspaceRoot: workspace,
    planPath: prepared.planPath,
    allowedRoots: [workspace],
    allowWrites: true,
    allowCloudinaryWrites: true,
    confirmCloudinaryWrite: true,
    cloudinaryUrl: "cloudinary://key:never-return-this@example-cloud",
    fetchImpl,
  });
  assert.equal(published.uploads, 2);
  assert.equal(uploadCalls.length, 2);
  assert.equal(JSON.stringify(published).includes("never-return-this"), false);
  const publicationReceipt = JSON.parse(
    await readFile(
      path.join(workspace, "prepared/batch-001/publication-receipt.json"),
      "utf8",
    ),
  );
  assert.equal(publicationReceipt.status, "published");
  assert.equal(publicationReceipt.mutation.cloudinaryAssetsCreated, 2);
});

function runMcp(messages, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MCP_PATH], {
      env: environment,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const output = [];
    let stderr = "";
    let buffered = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdout.on("data", (chunk) => {
      buffered += chunk;
      const lines = buffered.split("\n");
      buffered = lines.pop();
      for (const line of lines) {
        if (line.trim()) output.push(JSON.parse(line));
      }
      if (output.length === messages.length) child.stdin.end();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`MCP exited ${code}: ${stderr}`));
      } else {
        resolve(output);
      }
    });
    for (const message of messages) child.stdin.write(`${JSON.stringify(message)}\n`);
  });
}

test("MCP advertises bounded tools and fails closed when writes are disabled", async () => {
  const root = path.resolve(HERE, "..");
  const responses = await runMcp(
    [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "evavo_web_asset_capabilities", arguments: {} },
      },
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "evavo_web_asset_prepare",
          arguments: {
            workspaceRoot: root,
            manifestPath: "missing.json",
            outputRoot: "unused-output",
            confirmLocalWrite: true,
          },
        },
      },
    ],
    {
      ...process.env,
      EVAVO_WEB_ASSET_ALLOWED_ROOTS: root,
      EVAVO_WEB_ASSET_ALLOW_WRITES: "false",
      EVAVO_WEB_ASSET_ALLOW_CLOUDINARY_WRITES: "false",
      CLOUDINARY_URL: "",
    },
  );
  assert.equal(responses[0].result.serverInfo.name, "evavo-web-asset-pipeline");
  assert.equal(responses[1].result.tools.length, 6);
  assert.equal(
    responses[2].result.structuredContent.sourceBytesFlowThroughMcp,
    false,
  );
  assert.equal(responses[2].result.structuredContent.credentialsReturned, false);
  assert.equal(responses[3].result.isError, true);
  assert.equal(
    responses[3].result.structuredContent.code,
    "WEB_ASSET_WRITES_DISABLED",
  );
});
