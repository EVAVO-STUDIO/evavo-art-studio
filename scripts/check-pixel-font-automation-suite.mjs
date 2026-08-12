#!/usr/bin/env node
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = "config/pixel-font-automation-suite.v1.json";
const configPath = "config/mcp.pixel-font-automation.windows.example.json";
const manifest = JSON.parse(await readFile(path.join(root, manifestPath), "utf8"));
const config = JSON.parse(await readFile(path.join(root, configPath), "utf8"));

assert.equal(manifest.schema, "evavo.pixel-font-automation-suite.v1");
assert.equal(manifest.version, 1);
assert.equal(manifest.configuration, configPath);
assert.deepEqual(manifest.servers.map((entry) => entry.id), [
  "evavo-pixel-font-universal",
  "evavo-pixel-text-studio",
  "evavo-pixel-font-repository-delivery",
]);
assert.equal(manifest.servers.every((entry) => entry.defaultWriteEnabled === false), true);
assert.equal(manifest.servers[2].defaultGitPublishEnabled, false);
assert.ok(manifest.supportedBuildInputs.some((entry) => entry.includes("Pixel Font Studio v2")));
assert.ok(manifest.supportedBuildInputs.some((entry) => entry.includes("Pixel Text Studio")));
assert.equal(manifest.publication.manualOrReusableWorkflowOnly, true);
assert.equal(manifest.publication.normalPushOnly, true);
assert.equal(manifest.publication.forcePush, false);
for (const value of Object.values(manifest.authority)) assert.equal(value, false);

const universal = config.mcpServers?.["evavo-pixel-font-universal"];
const pixelText = config.mcpServers?.["evavo-pixel-text-studio"];
const delivery = config.mcpServers?.["evavo-pixel-font-repository-delivery"];
assert.ok(universal);
assert.ok(pixelText);
assert.ok(delivery);
assert.equal(universal.env.EVAVO_PIXEL_FONT_UNIVERSAL_MODE, "read-only");
assert.equal(universal.env.EVAVO_PIXEL_FONT_UNIVERSAL_ALLOW_WRITES, "false");
assert.equal(pixelText.env.EVAVO_PIXEL_TEXT_STUDIO_MODE, "read-only");
assert.equal(pixelText.env.EVAVO_PIXEL_TEXT_STUDIO_ALLOW_WRITES, "false");
assert.equal(delivery.env.EVAVO_PIXEL_FONT_DELIVERY_MODE, "read-only");
assert.equal(delivery.env.EVAVO_PIXEL_FONT_DELIVERY_ALLOW_WRITES, "false");
assert.equal(delivery.env.EVAVO_PIXEL_FONT_DELIVERY_ALLOW_GIT_PUBLISH, "false");
assert.ok(delivery.env.EVAVO_PIXEL_FONT_DELIVERY_TARGET_ROOTS.includes("GitRepos"));
assert.ok(delivery.env.EVAVO_PIXEL_FONT_DELIVERY_ALLOWLIST.endsWith("pixel-font-repository-allowlist.v1.json"));
assert.ok(delivery.env.EVAVO_PIXEL_FONT_DELIVERY_TEXT_COMPILER.endsWith("pixel_text_studio.py"));

for (const relative of [
  manifestPath,
  configPath,
  "scripts/pixel-font-studio-universal-mcp.mjs",
  "scripts/pixel-text-studio-mcp.mjs",
  "scripts/check-pixel-text-studio-mcp.mjs",
  "tools/pixel_text_studio.py",
  "tools/pixel_text_studio_engine.py",
  "config/pixel-text-studio.v1.json",
  "docs/PIXEL_TEXT_STUDIO.md",
  "scripts/pixel-font-repository-delivery-mcp.mjs",
  "scripts/pixel-font-repository-delivery.mjs",
  "config/pixel-font-repository-allowlist.v1.json",
  "docs/PIXEL_FONT_REPOSITORY_DELIVERY.md",
  ".github/workflows/pixel-font-repository-delivery-contract.yml",
  ".github/workflows/pixel-font-repository-publish.yml",
]) await access(path.join(root, relative));

process.stdout.write("Pixel-font automation suite checks passed.\n");
