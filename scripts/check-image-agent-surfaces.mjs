#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifests = [
  "config/image-finishing-artist.capabilities.json",
  "config/image-repair-agent.capabilities.json",
  "config/texture-review-agent.capabilities.json",
  "config/image-effects-agent.capabilities.json",
  "config/image-agent-router.capabilities.json",
];

function supportedCapabilitySchema(value) {
  return typeof value === "string" && /^1\.\d+$/u.test(value);
}

const parsed = [];
for (const relative of manifests) {
  const filePath = path.join(root, relative);
  const manifest = JSON.parse(await readFile(filePath, "utf8"));
  if (!supportedCapabilitySchema(manifest.schemaVersion) || typeof manifest.entrypoint !== "string") {
    throw new Error(`${relative} is missing a supported 1.x capability contract.`);
  }
  const entrypoint = path.join(root, manifest.entrypoint);
  await access(entrypoint);
  const syntax = spawnSync(process.execPath, ["--check", entrypoint], {
    cwd: root,
    encoding: "utf8",
  });
  if (syntax.status !== 0) {
    throw new Error(`${manifest.entrypoint} failed node --check:\n${syntax.stderr || syntax.stdout}`);
  }
  const source = await readFile(entrypoint, "utf8");
  for (const tool of manifest.tools ?? []) {
    if (!source.includes(`name: "${tool}"`) && !source.includes(`name: '${tool}'`)) {
      throw new Error(`${relative} advertises ${tool}, but ${manifest.entrypoint} does not expose it.`);
    }
  }
  parsed.push({
    id: manifest.id,
    schemaVersion: manifest.schemaVersion,
    entrypoint: manifest.entrypoint,
    tools: manifest.tools?.length ?? 0,
  });
}

const mediaIndex = await readFile(path.join(root, "packages/media/src/index.ts"), "utf8");
const mediaExports = [
  "image-repair-routing",
  "image-agent-routing",
  "texture-map-review",
  "texture-tile-proof",
  "texture-set-review",
  "texture-channel-pack",
  "uv-layout-review",
  "wavefront-obj-uv",
  "enhancement-structure-risk",
];
for (const requiredExport of mediaExports) {
  if (!mediaIndex.includes(`export * from "./${requiredExport}.js";`)) {
    throw new Error(`packages/media/src/index.ts does not export ${requiredExport}.`);
  }
}

const enhancementSession = await readFile(
  path.join(root, "packages/media/src/enhancement-review-session.ts"),
  "utf8",
);
if (!enhancementSession.includes("reviewEnhancementStructureRisk")) {
  throw new Error("Enhancement review session does not enforce macro structure preservation.");
}

const spriteEffectsIndex = await readFile(
  path.join(root, "packages/godot-sprite-effects/src/index.ts"),
  "utf8",
);
if (!spriteEffectsIndex.includes('export * from "./agent-planner.js";')) {
  throw new Error("godot-sprite-effects index does not export the agent planner.");
}

for (const requiredTest of [
  "packages/media/test/image-repair-routing.test.mjs",
  "packages/media/test/image-agent-routing.test.mjs",
  "packages/media/test/texture-map-review.test.mjs",
  "packages/media/test/texture-tile-proof.test.mjs",
  "packages/media/test/texture-set-review.test.mjs",
  "packages/media/test/texture-channel-pack.test.mjs",
  "packages/media/test/uv-layout-review.test.mjs",
  "packages/media/test/wavefront-obj-uv.test.mjs",
  "packages/media/test/enhancement-structure-risk.test.mjs",
  "packages/godot-sprite-effects/test/agent-planner.test.mjs",
  "tools/texture_review_mcp.test.mjs",
]) {
  await access(path.join(root, requiredTest));
}

process.stdout.write(`${JSON.stringify({
  contract: "evavo.image-agent-surfaces.check.v1",
  ok: true,
  surfaces: parsed,
  mediaExports,
  enhancementIntegrity: ["local-detail-risk", "macro-structure-risk"],
  textureProofSampling: ["continuous", "nearest"],
  textureMaterialReview: ["single-map", "material-set", "godot-orm-pack", "uv-layout", "wavefront-obj-uv"],
  unifiedRouting: true,
  spriteEffectExports: ["agent-planner"],
}, null, 2)}\n`);
