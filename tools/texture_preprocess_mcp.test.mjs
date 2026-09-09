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

async function rgba(width, height, bytes) {
  return sharp(Buffer.from(bytes), { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("converts normal Y convention create-only and changes green only", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-normal-y-"));
  const inputPath = path.join(root, "normal_dx.png");
  const outputPath = path.join(root, "normal_gl.png");
  await writeFile(inputPath, await rgba(2, 1, [100, 40, 240, 255, 120, 80, 250, 128]));

  const denied = await call(root, "evavo_convert_tangent_normal_y_convention", {
    inputPath,
    sourceConvention: "directx",
    targetConvention: "opengl",
    outputPath,
    confirmLocalWrite: true,
  }, { writes: false });
  assert.equal(denied.isError, true);
  assert.match(denied.structuredContent.message, /writes are disabled/);

  const response = await call(root, "evavo_convert_tangent_normal_y_convention", {
    inputPath,
    sourceConvention: "directx",
    targetConvention: "opengl",
    outputPath,
    confirmLocalWrite: true,
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.conversion.transformation, "G=255-G");
  const decoded = await sharp(await readFile(outputPath)).ensureAlpha().raw().toBuffer();
  assert.deepEqual([...decoded], [100, 215, 240, 255, 120, 175, 250, 128]);

  const receipt = JSON.parse(await readFile(`${outputPath}.receipt.json`, "utf8"));
  assert.equal(receipt.approvalState, "unapproved");
  assert.equal(receipt.conversion.sourceMutationAllowed, false);
});

test("composes opacity into albedo alpha without changing RGB", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-opacity-alpha-"));
  const albedoPath = path.join(root, "albedo.png");
  const opacityPath = path.join(root, "opacity.png");
  const outputPath = path.join(root, "albedo_alpha.png");
  await writeFile(albedoPath, await rgba(2, 1, [10, 20, 30, 40, 50, 60, 70, 80]));
  await writeFile(opacityPath, await rgba(2, 1, [5, 5, 5, 255, 200, 200, 200, 255]));

  const response = await call(root, "evavo_compose_opacity_into_albedo_alpha", {
    albedoPath,
    opacityPath,
    outputPath,
    confirmLocalWrite: true,
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.composition.albedoRgbPreservedExactly, true);
  const decoded = await sharp(await readFile(outputPath)).ensureAlpha().raw().toBuffer();
  assert.deepEqual([...decoded], [10, 20, 30, 5, 50, 60, 70, 200]);

  const repeated = await call(root, "evavo_compose_opacity_into_albedo_alpha", {
    albedoPath,
    opacityPath,
    outputPath,
    confirmLocalWrite: true,
  });
  assert.equal(repeated.isError, true);
  assert.match(repeated.structuredContent.message, /Create-only texture review target already exists/);
});

test("opacity composition fails closed on mismatched dimensions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-opacity-size-"));
  const albedoPath = path.join(root, "albedo.png");
  const opacityPath = path.join(root, "opacity.png");
  await writeFile(albedoPath, await rgba(2, 1, [1, 2, 3, 255, 4, 5, 6, 255]));
  await writeFile(opacityPath, await rgba(1, 1, [255, 255, 255, 255]));
  const response = await call(root, "evavo_compose_opacity_into_albedo_alpha", {
    albedoPath,
    opacityPath,
    outputPath: path.join(root, "out.png"),
    confirmLocalWrite: true,
  });
  assert.equal(response.isError, true);
  assert.match(response.structuredContent.message, /Opacity dimensions must match albedo exactly/);
});
