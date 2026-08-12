#!/usr/bin/env node
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(root, "scripts", "pixel-typography.mjs");
const source = await readFile(cliPath, "utf8");

for (const relative of [
  "tools/pixel_font_universal.py",
  "tools/check_pixel_font_universal.py",
  "tools/pixel_text_studio.py",
  "tools/check_pixel_text_studio.py",
  "scripts/pixel-font-repository-delivery.mjs",
  "scripts/check-pixel-font-repository-delivery.mjs",
  "scripts/check-pixel-text-studio-mcp.mjs",
  "scripts/check-pixel-font-automation-suite.mjs",
  "config/pixel-font-automation-suite.v1.json",
  "docs/PIXEL_TYPOGRAPHY_AUTOMATION.md",
  "docs/PIXEL_TEXT_STUDIO.md",
  "docs/PIXEL_FONT_REPOSITORY_DELIVERY.md",
]) await access(path.join(root, relative));

assert.equal(source.includes("shell: true"), false);
assert.equal(source.includes("execSync("), false);
assert.equal(source.includes("exec("), false);
assert.equal(source.includes("callerSelectedExecutable: false"), true);
assert.equal(source.includes("forcePush: automation.publication.forcePush"), true);

const catalogResult = spawnSync(process.execPath, [cliPath, "catalog"], {
  cwd: root,
  env: process.env,
  encoding: "utf8",
  shell: false,
});
assert.equal(catalogResult.status, 0, catalogResult.stderr);
const catalog = JSON.parse(catalogResult.stdout);
assert.equal(catalog.schema, "evavo.pixel-typography-cli.catalog.v1");
assert.deepEqual(Object.keys(catalog.commands), ["catalog", "font", "text", "delivery", "check"]);
assert.deepEqual(catalog.mcp.map((entry) => entry.id), [
  "evavo-pixel-font-universal",
  "evavo-pixel-text-studio",
  "evavo-pixel-font-repository-delivery",
]);
assert.equal(catalog.policy.arbitraryShell, false);
assert.equal(catalog.policy.callerSelectedExecutable, false);
assert.equal(catalog.policy.publicationEnabledByDefault, false);
assert.equal(catalog.policy.exactTargetHeadRequired, true);
assert.equal(catalog.policy.normalPushOnly, true);
assert.equal(catalog.policy.forcePush, false);

for (const [command, expected] of [
  ["font", "tools/pixel_font_universal.py"],
  ["text", "tools/pixel_text_studio.py"],
  ["delivery", "scripts/pixel-font-repository-delivery.mjs"],
]) assert.equal(catalog.commands[command].entrypoint, expected);

const badCommand = spawnSync(process.execPath, [cliPath, "not-a-command"], {
  cwd: root,
  env: process.env,
  encoding: "utf8",
  shell: false,
});
assert.equal(badCommand.status, 2);
assert.match(badCommand.stderr, /unknown pixel-typography command/u);

process.stdout.write("Pixel Typography unified CLI checks passed.\n");
