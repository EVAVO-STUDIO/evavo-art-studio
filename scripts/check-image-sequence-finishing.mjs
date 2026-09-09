#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "packages/media/src/image-sequence-finishing-review.ts",
  "packages/media/test/image-sequence-finishing-review.test.mjs",
  "tools/image_sequence_finishing_mcp.mjs",
  "tools/image_sequence_finishing_mcp.test.mjs",
  "config/image-sequence-finishing.capabilities.json",
  "docs/IMAGE_SEQUENCE_FINISHING_AGENT.md",
];
for (const relative of requiredFiles) await access(path.join(root, relative));

const manifest = JSON.parse(await readFile(path.join(root, "config/image-sequence-finishing.capabilities.json"), "utf8"));
if (manifest.schemaVersion !== "1.0" || manifest.entrypoint !== "tools/image_sequence_finishing_mcp.mjs") {
  throw new Error("Image sequence finishing capability manifest is invalid.");
}
const entrypoint = path.join(root, manifest.entrypoint);
const syntax = spawnSync(process.execPath, ["--check", entrypoint], { cwd: root, encoding: "utf8" });
if (syntax.status !== 0) throw new Error(`Image sequence finishing MCP failed node --check:\n${syntax.stderr || syntax.stdout}`);
const mcpSource = await readFile(entrypoint, "utf8");
for (const tool of manifest.tools ?? []) {
  if (!mcpSource.includes(`name: "${tool}"`) && !mcpSource.includes(`name: '${tool}'`)) {
    throw new Error(`Sequence finishing manifest advertises ${tool}, but the MCP does not expose it.`);
  }
}
const core = await readFile(path.join(root, "packages/media/src/image-sequence-finishing-review.ts"), "utf8");
for (const requiredSignal of [
  "createImageSequenceFinishingReview",
  "canvas-size-outlier",
  "near-duplicate-neighbor",
  "intentional animation holds",
  "automaticPromotionAllowed",
]) {
  if (!core.includes(requiredSignal)) throw new Error(`Sequence finishing core is missing ${requiredSignal}.`);
}

process.stdout.write(`${JSON.stringify({
  contract: "evavo.image-sequence-finishing.check.v1",
  ok: true,
  tools: manifest.tools,
  maximumFrames: manifest.limits?.frames,
  maximumApprovedReferences: manifest.limits?.approvedReferences,
  checks: manifest.continuitySignals,
  boundaries: [
    "read-only",
    "duplicates-are-review-evidence-not-automatic-failure",
    "semantic-motion-quality-remains-visual-review",
    "no-ai-origin-claim",
    "no-automatic-promotion",
  ],
}, null, 2)}\n`);
