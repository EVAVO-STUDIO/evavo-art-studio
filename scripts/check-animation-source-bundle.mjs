#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ANIMATION_SOURCE_BUNDLE_SCHEMA_SHA256,
  assertAnimationSourceBundle,
} from "./lib/animation-source-bundle.mjs";

const failures = [];
const read = (path) => readFile(resolve(path), "utf8");

function requireCondition(condition, message) {
  if (!condition) failures.push(message);
}

function requireIncludes(value, token, label) {
  requireCondition(
    value.includes(token),
    `${label}: missing ${JSON.stringify(token)}`,
  );
}

const [
  schema,
  fixtureText,
  library,
  cli,
  documentation,
] = await Promise.all([
  read("contracts/animation-source-bundle-v1.schema.json"),
  read("contracts/fixtures/animation-source-bundle-v1.json"),
  read("scripts/lib/animation-source-bundle.mjs"),
  read("scripts/animation-source-bundle.mjs"),
  read("docs/ANIMATION_SOURCE_BUNDLE.md"),
]);

const schemaDigest = createHash("sha256")
  .update(schema)
  .digest("hex");
requireCondition(
  schemaDigest === ANIMATION_SOURCE_BUNDLE_SCHEMA_SHA256,
  `schema fingerprint mismatch: ${schemaDigest}`,
);
try {
  assertAnimationSourceBundle(JSON.parse(fixtureText));
} catch (error) {
  failures.push(
    `fixture integrity failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

for (const token of [
  "ANIMATION_SOURCE_BUNDLE_PATH_INVALID",
  "ANIMATION_SOURCE_BUNDLE_REALPATH_ESCAPES_ROOT",
  "ANIMATION_SOURCE_BUNDLE_SYMLINK_FORBIDDEN",
  "ANIMATION_SOURCE_BUNDLE_ASSET_DIGEST_MISMATCH",
  "ANIMATION_SOURCE_BUNDLE_STALE_APPROVAL",
  "writeJsonAtomic",
  "probePng",
  "mapBounded",
]) {
  requireIncludes(library, token, "contract library");
}
for (const token of [
  'commands: ["compile", "verify", "manifest"]',
  "compileAnimationSourceBundle",
  "verifyAnimationSourceBundleFiles",
]) {
  requireIncludes(cli, token, "Art Studio CLI");
}
for (const token of [
  "Animation Source Bundle",
  "node scripts/animation-source-bundle.mjs compile",
  "node scripts/animation-source-bundle.mjs verify",
  "does not grant provider, render, publication or repository authority",
]) {
  requireIncludes(documentation, token, "documentation");
}

for (const source of [library, cli]) {
  for (const forbidden of [
    "git push",
    "git commit",
    "shell: true",
    "process.env.GITHUB_TOKEN",
    "--force-with-lease",
  ]) {
    requireCondition(
      !source.includes(forbidden),
      `runtime boundary contains forbidden token: ${forbidden}`,
    );
  }
}

if (failures.length > 0) {
  console.error(
    [
      "Animation Source Bundle governance check failed:",
      ...failures.map((failure) => `- ${failure}`),
    ].join("\n"),
  );
  process.exitCode = 1;
} else {
  console.log(
    "Animation Source Bundle governance check passed.",
  );
}
