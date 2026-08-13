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
  "tools/pixel_font_universal.py", "tools/check_pixel_font_universal.py",
  "tools/pixel_text_studio.py", "tools/check_pixel_text_studio.py",
  "tools/pixel_typography_review.py", "tools/pixel_typography_review_engine.py", "tools/check_pixel_typography_review.py",
  "scripts/pixel-typography-review-mcp.mjs", "scripts/check-pixel-typography-review-mcp.mjs",
  "scripts/pixel-font-repository-delivery.mjs", "scripts/check-pixel-font-repository-delivery.mjs",
  "scripts/check-pixel-font-automation-suite.mjs", "config/pixel-font-automation-suite.v1.json",
  "config/pixel-typography-review.v1.json", "docs/PIXEL_TYPOGRAPHY_AUTOMATION.md", "docs/PIXEL_TYPOGRAPHY_REVIEW.md",
]) await access(path.join(root, relative));
assert.equal(source.includes("shell: true"), false);
assert.equal(source.includes("execSync("), false);
assert.equal(source.includes("callerSelectedExecutable: false"), true);
const catalogResult = spawnSync(process.execPath, [cliPath, "catalog"], { cwd: root, env: process.env, encoding: "utf8", shell: false });
assert.equal(catalogResult.status, 0, catalogResult.stderr);
const catalog = JSON.parse(catalogResult.stdout);
assert.equal(catalog.schema, "evavo.pixel-typography-cli.catalog.v1");
assert.equal(catalog.version, 2);
assert.deepEqual(Object.keys(catalog.commands), ["catalog", "font", "text", "review", "delivery", "check"]);
assert.deepEqual(catalog.mcp.map((entry) => entry.id), ["evavo-pixel-font-universal", "evavo-pixel-text-studio", "evavo-pixel-typography-review", "evavo-pixel-font-repository-delivery"]);
assert.equal(catalog.review.nativeResolutionPages, true);
assert.equal(catalog.review.paletteBudgetValidation, true);
assert.equal(catalog.review.integerScaleProof, true);
assert.equal(catalog.policy.arbitraryShell, false);
assert.equal(catalog.policy.callerSelectedExecutable, false);
assert.equal(catalog.policy.publicationEnabledByDefault, false);
assert.equal(catalog.policy.exactTargetHeadRequired, true);
assert.equal(catalog.policy.normalPushOnly, true);
assert.equal(catalog.policy.forcePush, false);
for (const [command, expected] of [["font", "tools/pixel_font_universal.py"], ["text", "tools/pixel_text_studio.py"], ["review", "tools/pixel_typography_review.py"], ["delivery", "scripts/pixel-font-repository-delivery.mjs"]]) assert.equal(catalog.commands[command].entrypoint, expected);
const reviewCatalog = spawnSync(process.execPath, [cliPath, "review", "catalog"], { cwd: root, env: process.env, encoding: "utf8", shell: false });
assert.equal(reviewCatalog.status, 0, reviewCatalog.stderr);
assert.equal(JSON.parse(reviewCatalog.stdout).schema, "evavo.pixel-typography-review-catalog.v1");
const badCommand = spawnSync(process.execPath, [cliPath, "not-a-command"], { cwd: root, env: process.env, encoding: "utf8", shell: false });
assert.equal(badCommand.status, 2);
assert.match(badCommand.stderr, /unknown pixel-typography command/u);
process.stdout.write("Pixel Typography unified CLI checks passed.\n");
