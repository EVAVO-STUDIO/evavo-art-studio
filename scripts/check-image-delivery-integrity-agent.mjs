#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "config/image-delivery-integrity.capabilities.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.schemaVersion !== "1.0") throw new Error("Delivery integrity capability schema must be 1.0.");
if (manifest.entrypoint !== "tools/image_delivery_integrity_mcp.mjs") throw new Error("Delivery integrity entrypoint is not canonical.");
if (!Array.isArray(manifest.tools) || manifest.tools.length !== 3) throw new Error("Delivery integrity manifest must advertise exactly three tools.");

const entrypoint = path.join(root, manifest.entrypoint);
await access(entrypoint);
const syntax = spawnSync(process.execPath, ["--check", entrypoint], { cwd: root, encoding: "utf8" });
if (syntax.status !== 0) throw new Error(`${manifest.entrypoint} failed node --check:\n${syntax.stderr || syntax.stdout}`);
const source = await readFile(entrypoint, "utf8");
for (const tool of manifest.tools) {
  if (!source.includes(`name: "${tool}"`) && !source.includes(`name: '${tool}'`)) {
    throw new Error(`Delivery integrity manifest advertises ${tool}, but the MCP does not expose it.`);
  }
}
for (const requiredGuard of [
  "EVAVO_IMAGE_DELIVERY_ALLOWED_ROOTS",
  "sourceModified: false",
  "bytesReturned: false",
  "MAX_BATCH = 128",
]) {
  if (!source.includes(requiredGuard)) throw new Error(`Delivery integrity MCP is missing ${requiredGuard}.`);
}

const mediaIndex = await readFile(path.join(root, "packages/media/src/index.ts"), "utf8");
if (!mediaIndex.includes('export * from "./image-delivery-integrity.js";')) {
  throw new Error("@evavo/art-media does not publicly export image-delivery-integrity.");
}
const core = await readFile(path.join(root, "packages/media/src/image-delivery-integrity.ts"), "utf8");
for (const requiredCoreFeature of [
  "reviewImageDeliveryIntegrity",
  "jpeg-delivery-cannot-preserve-alpha",
  "print-effective-dpi-below-minimum",
  "game-data-map",
  "sourceMutationAllowed: false",
]) {
  if (!core.includes(requiredCoreFeature)) throw new Error(`Delivery integrity core is missing ${requiredCoreFeature}.`);
}

for (const requiredTest of [
  "packages/media/test/image-delivery-integrity.test.mjs",
  "tools/image_delivery_integrity_mcp.test.mjs",
]) await access(path.join(root, requiredTest));

process.stdout.write(`${JSON.stringify({
  contract: "evavo.image-delivery-integrity-agent.check.v1",
  ok: true,
  entrypoint: manifest.entrypoint,
  tools: manifest.tools,
  targets: manifest.targets,
  maximumBatchSize: manifest.limits?.batchImages ?? null,
  guarantees: manifest.guarantees,
  tests: [
    "packages/media/test/image-delivery-integrity.test.mjs",
    "tools/image_delivery_integrity_mcp.test.mjs",
  ],
}, null, 2)}\n`);
