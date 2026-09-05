import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import sharp from "../packages/media/node_modules/sharp/lib/index.js";

const serverPath = fileURLToPath(new URL("./raster_finishing_mcp.mjs", import.meta.url));

async function call(root, name, args) {
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      EVAVO_RASTER_FINISH_ALLOWED_ROOTS: root,
      EVAVO_RASTER_FINISH_ALLOW_WRITES: "true",
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

test("masters a declared matte to create-only real-alpha output with proof and receipt", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-raster-master-"));
  const inputPath = path.join(root, "source.png");
  const outputPath = path.join(root, "sprite.png");
  const source = await sharp({
    create: { width: 64, height: 64, channels: 4, background: "#00ff00" },
  })
    .composite([{ input: { create: { width: 28, height: 40, channels: 4, background: "#bb2838" } }, left: 18, top: 12 }])
    .png()
    .toBuffer();
  await writeFile(inputPath, source);

  const response = await call(root, "evavo_master_transparent_asset", {
    inputPath,
    outputPath,
    matteColour: "#00ff00",
    pixelArt: true,
    confirmLocalWrite: true,
  });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.recoveryStrategy, "declared-chroma-key");
  const metadata = await sharp(await readFile(outputPath)).metadata();
  assert.equal(metadata.hasAlpha, true);
  const receipt = JSON.parse(await readFile(`${outputPath}.receipt.json`, "utf8"));
  assert.equal(receipt.approvalState, "unapproved");
  assert.equal(receipt.finalAdmission.strategy, "native-alpha-preserved");
  assert.equal(receipt.transparencyProof.checkerboardUsed, false);
  assert.equal(receipt.transparencyProof.includesAlphaMask, true);

  const repeated = await call(root, "evavo_master_transparent_asset", {
    inputPath,
    outputPath,
    matteColour: "#00ff00",
    confirmLocalWrite: true,
  });
  assert.equal(repeated.isError, true);
  assert.match(repeated.structuredContent.message, /Create-only output already exists/);
});

test("refuses to overwrite the source during transparent mastering", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-raster-source-"));
  const inputPath = path.join(root, "source.png");
  await writeFile(
    inputPath,
    await sharp({ create: { width: 16, height: 16, channels: 4, background: "#00ff00" } }).png().toBuffer(),
  );
  const response = await call(root, "evavo_master_transparent_asset", {
    inputPath,
    outputPath: inputPath,
    matteColour: "#00ff00",
    confirmLocalWrite: true,
  });
  assert.equal(response.isError, true);
  assert.match(response.structuredContent.message, /non-destructive/);
});
