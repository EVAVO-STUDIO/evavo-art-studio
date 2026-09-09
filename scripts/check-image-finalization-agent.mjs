#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "config/image-finalization.capabilities.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.schemaVersion !== "1.0") throw new Error("Image finalization capability schema must be 1.0.");
if (manifest.entrypoint !== "tools/image_finalization_mcp.mjs") throw new Error("Image finalization entrypoint is not canonical.");
if (!Array.isArray(manifest.tools) || manifest.tools.length !== 2) throw new Error("Image finalization manifest must advertise exactly two tools.");

const entrypoint = path.join(root, manifest.entrypoint);
await access(entrypoint);
const syntax = spawnSync(process.execPath, ["--check", entrypoint], { cwd: root, encoding: "utf8" });
if (syntax.status !== 0) throw new Error(`${manifest.entrypoint} failed node --check:\n${syntax.stderr || syntax.stdout}`);
const source = await readFile(entrypoint, "utf8");
for (const tool of manifest.tools) {
  if (!source.includes(`name: "${tool}"`) && !source.includes(`name: '${tool}'`)) {
    throw new Error(`Image finalization manifest advertises ${tool}, but the MCP does not expose it.`);
  }
}
for (const requiredGuard of [
  "EVAVO_IMAGE_FINALIZATION_ALLOWED_ROOTS",
  "automaticPromotionAllowed",
  "readyMeansReadyForApprovalReviewNotApproved",
  "maximumBytes",
]) {
  if (!source.includes(requiredGuard)) throw new Error(`Image finalization MCP is missing ${requiredGuard}.`);
}

const mediaIndex = await readFile(path.join(root, "packages/media/src/index.ts"), "utf8");
for (const requiredExport of ["image-finishing-review-packet", "image-delivery-integrity", "image-finalization-review"]) {
  if (!mediaIndex.includes(`export * from "./${requiredExport}.js";`)) {
    throw new Error(`@evavo/art-media does not publicly export ${requiredExport}.`);
  }
}
const core = await readFile(path.join(root, "packages/media/src/image-finalization-review.ts"), "utf8");
for (const requiredCoreFeature of [
  "reviewImageFinalization",
  "needs-image-finishing",
  "needs-delivery-review",
  "ready-for-approval-review",
  "automaticPromotionAllowed: false",
]) {
  if (!core.includes(requiredCoreFeature)) throw new Error(`Image finalization core is missing ${requiredCoreFeature}.`);
}

for (const requiredTest of [
  "packages/media/test/image-finalization-review.test.mjs",
  "tools/image_finalization_mcp.test.mjs",
]) await access(path.join(root, requiredTest));

process.stdout.write(`${JSON.stringify({
  contract: "evavo.image-finalization-agent.check.v1",
  ok: true,
  entrypoint: manifest.entrypoint,
  tools: manifest.tools,
  decisions: manifest.decisions,
  targets: manifest.deliveryTargets,
  guarantees: manifest.guarantees,
  tests: [
    "packages/media/test/image-finalization-review.test.mjs",
    "tools/image_finalization_mcp.test.mjs",
  ],
}, null, 2)}\n`);
