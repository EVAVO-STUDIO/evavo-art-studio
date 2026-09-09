import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import sharp from "../packages/media/node_modules/sharp/lib/index.js";

const serverPath = fileURLToPath(new URL("./texture_review_mcp.mjs", import.meta.url));

async function call(root, name, args, { writes = true } = {}) {
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      EVAVO_TEXTURE_REVIEW_ALLOWED_ROOTS: root,
      EVAVO_TEXTURE_REVIEW_ALLOW_WRITES: writes ? "true" : "false",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  child.stdin.end(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })}\n`);
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(exitCode, 0, Buffer.concat(stderr).toString("utf8"));
  return JSON.parse(Buffer.concat(stdout).toString("utf8").trim()).result;
}

async function grayscale(width, height, values) {
  const raw = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const value = values[pixel % values.length];
    const offset = pixel * 4;
    raw[offset] = value;
    raw[offset + 1] = value;
    raw[offset + 2] = value;
    raw[offset + 3] = 255;
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("reviews a coherent texture set through the MCP without writing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-texture-review-"));
  const roughnessPath = path.join(root, "roughness.png");
  const metallicPath = path.join(root, "metallic.png");
  await writeFile(roughnessPath, await grayscale(4, 4, [80, 120, 160, 200]));
  await writeFile(metallicPath, await grayscale(4, 4, [0, 0, 255, 255]));

  const response = await call(root, "evavo_review_texture_set", {
    maps: [
      { id: "roughness", path: roughnessPath, kind: "roughness" },
      { id: "metallic", path: metallicPath, kind: "metallic" },
    ],
    expectedKinds: ["roughness", "metallic"],
  }, { writes: false });

  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.sourcesModified, false);
  assert.equal(response.structuredContent.evidence.width, 4);
  assert.equal(response.structuredContent.evidence.godot.preferredMaterial, "StandardMaterial3D");
});

test("reviews topology-aware UV triangle data without enabling writes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-uv-contract-"));
  const response = await call(root, "evavo_review_uv_layout", {
    triangles: [
      {
        id: "a",
        uv: [{ u: 0.1, v: 0.1 }, { u: 0.9, v: 0.1 }, { u: 0.9, v: 0.9 }],
        position: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }],
        vertexKeys: ["v1", "v2", "v3"],
      },
      {
        id: "b",
        uv: [{ u: 0.1, v: 0.1 }, { u: 0.9, v: 0.9 }, { u: 0.1, v: 0.9 }],
        position: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }],
        vertexKeys: ["v1", "v3", "v4"],
      },
    ],
    textureWidth: 1024,
    textureHeight: 1024,
    minimumAtlasBoundaryPaddingTexels: 32,
    orientationConvention: "positive",
  }, { writes: false });

  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.sourceModified, false);
  assert.equal(response.structuredContent.evidence.grade, "pass");
  assert.equal(response.structuredContent.evidence.islandCount, 1);
  assert.equal(response.structuredContent.evidence.connectivity.mode, "mesh-aware");
});

test("raw UV review keeps unrelated coincident topology separate and enforces island padding", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-uv-overlap-"));
  const response = await call(root, "evavo_review_uv_layout", {
    triangles: [
      {
        id: "a",
        uv: [{ u: 0.1, v: 0.1 }, { u: 0.4, v: 0.1 }, { u: 0.1, v: 0.4 }],
        vertexKeys: ["v1", "v2", "v3"],
      },
      {
        id: "b",
        uv: [{ u: 0.1, v: 0.1 }, { u: 0.4, v: 0.1 }, { u: 0.1, v: 0.4 }],
        vertexKeys: ["v4", "v5", "v6"],
      },
    ],
    textureWidth: 1024,
    textureHeight: 1024,
    minimumIslandPaddingTexels: 4,
  }, { writes: false });

  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.evidence.islandCount, 2);
  assert.equal(response.structuredContent.evidence.grade, "fail");
  assert.equal(response.structuredContent.evidence.islandSpacing.minimumPaddingTexels, 0);
  assert.ok(response.structuredContent.evidence.blockers.includes("unapproved-uv-overlaps:1"));
});

test("reviews a local OBJ directly and reports faces with missing UVs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-obj-uv-"));
  const objPath = path.join(root, "wall.obj");
  await writeFile(objPath, `
o wall
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
v 2 0 0
v 2 1 0
vt 0.1 0.1
vt 0.9 0.1
vt 0.9 0.9
vt 0.1 0.9
f 1/1 2/2 3/3 4/4
f 2 5 6
`, "utf8");

  const response = await call(root, "evavo_review_obj_uv_layout", {
    inputPath: objPath,
    textureWidth: 1024,
    textureHeight: 1024,
    orientationConvention: "positive",
  }, { writes: false });

  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.sourceModified, false);
  assert.equal(response.structuredContent.extraction.faceCount, 2);
  assert.equal(response.structuredContent.extraction.skippedFacesWithoutUv, 1);
  assert.equal(response.structuredContent.extraction.triangleCount, 2);
  assert.equal(response.structuredContent.evidence.connectivity.mode, "mesh-aware");
  assert.equal("triangles" in response.structuredContent.extraction, false);
});

test("packs ORM create-only and preserves exact scalar texels", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-texture-orm-"));
  const aoPath = path.join(root, "ao.png");
  const roughnessPath = path.join(root, "roughness.png");
  const metallicPath = path.join(root, "metallic.png");
  const outputPath = path.join(root, "material_orm.png");
  await writeFile(aoPath, await grayscale(2, 2, [1, 2, 3, 4]));
  await writeFile(roughnessPath, await grayscale(2, 2, [10, 11, 12, 13]));
  await writeFile(metallicPath, await grayscale(2, 2, [20, 21, 22, 23]));

  const args = {
    ambientOcclusion: { path: aoPath },
    roughness: { path: roughnessPath },
    metallic: { path: metallicPath },
    outputPath,
    confirmLocalWrite: true,
  };
  const response = await call(root, "evavo_pack_godot_orm_texture", args);
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.sourcesModified, false);
  assert.equal(response.structuredContent.packing.channelContract, "R=ambient-occlusion,G=roughness,B=metallic,A=255");

  const decoded = await sharp(await readFile(outputPath)).ensureAlpha().raw().toBuffer();
  assert.deepEqual([...decoded], [
    1, 10, 20, 255,
    2, 11, 21, 255,
    3, 12, 22, 255,
    4, 13, 23, 255,
  ]);

  const repeated = await call(root, "evavo_pack_godot_orm_texture", args);
  assert.equal(repeated.isError, true);
  assert.match(repeated.structuredContent.message, /Create-only texture review target already exists/);
});

test("creates a 3x3 tile proof but refuses writes without explicit admission", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-texture-proof-"));
  const inputPath = path.join(root, "tile.png");
  const outputPath = path.join(root, "tile-proof.png");
  await writeFile(inputPath, await grayscale(8, 8, [40, 80, 120, 160]));

  const denied = await call(root, "evavo_create_texture_tile_proof", {
    inputPath,
    kind: "roughness",
    outputPath,
    confirmLocalWrite: true,
  }, { writes: false });
  assert.equal(denied.isError, true);
  assert.match(denied.structuredContent.message, /writes are disabled/);

  const response = await call(root, "evavo_create_texture_tile_proof", {
    inputPath,
    kind: "roughness",
    outputPath,
    maximumTileDimension: 64,
    sampling: "nearest",
    confirmLocalWrite: true,
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.proof.proofWidth, 24);
  assert.equal(response.structuredContent.proof.proofHeight, 24);
  assert.equal(response.structuredContent.approvalState, "diagnostic-only");
});
