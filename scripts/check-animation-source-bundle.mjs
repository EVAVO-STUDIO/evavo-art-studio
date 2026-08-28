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
  observationCommon,
  imageProbes,
  fileObserver,
  stableObservation,
  controlDocument,
  outputWriter,
  cli,
  stableTest,
  controlBoundaryTest,
  cliSafetyTest,
  documentation,
  safetyDocumentation,
] = await Promise.all([
  read("contracts/animation-source-bundle-v1.schema.json"),
  read("contracts/fixtures/animation-source-bundle-v1.json"),
  read("scripts/lib/animation-source-bundle.mjs"),
  read("scripts/lib/animation-source-observation-common.mjs"),
  read("scripts/lib/animation-source-image-probes.mjs"),
  read("scripts/lib/animation-source-file-observer.mjs"),
  read("scripts/lib/animation-source-stable-observation.mjs"),
  read("scripts/lib/animation-source-control-document.mjs"),
  read("scripts/lib/animation-source-output.mjs"),
  read("scripts/animation-source-bundle.mjs"),
  read("scripts/test-ci-media-tool-animation-source-stable-observation.mjs"),
  read("scripts/test-ci-media-tool-animation-source-control-boundary.mjs"),
  read("scripts/test-ci-media-tool-animation-source-cli-safety.mjs"),
  read("docs/ANIMATION_SOURCE_BUNDLE.md"),
  read("docs/ANIMATION_SOURCE_CONTROL_AND_OUTPUT_SAFETY.md"),
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

const stableBoundary = [
  observationCommon,
  imageProbes,
  fileObserver,
  stableObservation,
].join("\n");
for (const token of [
  "ANIMATION_SOURCE_BUNDLE_OBSERVATION_FILE_CHANGED_WHILE_READING",
  "ANIMATION_SOURCE_BUNDLE_SOURCE_CHANGED_DURING_OPERATION",
  "ANIMATION_SOURCE_BUNDLE_OBSERVATION_PATH_REPLACED",
  "ANIMATION_SOURCE_BUNDLE_OBSERVATION_IMAGE_TYPE_UNSUPPORTED",
  "handle.read(",
  "verifyPathStillMatches",
  "compileAnimationSourceBundleStable",
  "verifyAnimationSourceBundleFilesStable",
  "SUPPORTED_ANIMATION_SOURCE_IMAGE_MEDIA_TYPES",
  '"image/png"',
  '"image/jpeg"',
  '"image/gif"',
  '"image/webp"',
]) {
  requireIncludes(stableBoundary, token, "stable observation boundary");
}

for (const token of [
  "ANIMATION_SOURCE_CONTROL_DOCUMENT_CHANGED_DURING_READ",
  "ANIMATION_SOURCE_CONTROL_DOCUMENT_HARDLINK_FORBIDDEN",
  "ANIMATION_SOURCE_CONTROL_DOCUMENT_TOO_LARGE",
  'new TextDecoder("utf-8", { fatal: true })',
  "stableDoubleRead: true",
  "singleLink: true",
]) {
  requireIncludes(controlDocument, token, "control-document boundary");
}

for (const token of [
  "ANIMATION_SOURCE_OUTPUT_PROTECTED_PATH_COLLISION",
  "ANIMATION_SOURCE_OUTPUT_HARDLINK_FORBIDDEN",
  "ANIMATION_SOURCE_OUTPUT_EXISTS",
  "ANIMATION_SOURCE_OUTPUT_LOCKED",
  "ANIMATION_SOURCE_OUTPUT_ATOMIC_REPLACE_UNAVAILABLE",
  "await link(temporary, destination)",
  "await rename(temporary, destination)",
  "verifyPublished",
]) {
  requireIncludes(outputWriter, token, "generated-output boundary");
}
requireCondition(
  !outputWriter.includes("unlink(destination"),
  "generated-output boundary must never delete the destination before replacement",
);

for (const token of [
  'commands: ["compile", "verify", "manifest"]',
  "compileAnimationSourceBundleStable",
  "verifyAnimationSourceBundleFilesStable",
  "readAnimationSourceControlDocument",
  "writeAnimationSourceJson",
  '"--replace-output"',
  '"stable-before-after-observation"',
  '"single-handle-sha256"',
  "controlDocumentEvidence",
  "outputEvidence",
  "sourceCopyRequired: false",
]) {
  requireIncludes(cli, token, "Art Studio CLI");
}
requireCondition(
  !cli.includes("compileAnimationSourceBundle,"),
  "Art Studio CLI must not bypass stable compilation",
);
requireCondition(
  !cli.includes("verifyAnimationSourceBundleFiles,"),
  "Art Studio CLI must not bypass stable verification",
);
requireCondition(
  !cli.includes("readJson,"),
  "Art Studio CLI must not use the legacy unbounded control-document reader",
);
requireCondition(
  !cli.includes("writeJsonAtomic,"),
  "Art Studio CLI must not use the legacy replacement-capable JSON writer",
);

for (const token of [
  "stable observation binds exact bytes",
  "stable compile rejects a source replacement",
  "PNG, JPEG, GIF and WebP dimensions",
  "unsupported and spoofed images fail closed",
]) {
  requireIncludes(stableTest, token, "stable observation regression");
}

for (const token of [
  "control documents are bounded, digest-bound and BOM aware",
  "control documents reject symlink and hard-link aliases",
  "generated JSON is create-only by default",
  "explicit replacement is atomic",
  "concurrent create-only writers never overwrite one another",
  "output destinations reject hard links",
]) {
  requireIncludes(
    controlBoundaryTest,
    token,
    "control and output boundary regression",
  );
}

for (const token of [
  "CLI compile and verify emit control and output evidence",
  "CLI output is create-only unless replacement is explicit",
  "CLI refuses to overwrite control documents or source media",
  "CLI rejects ambiguous and unsafe byte-limit options",
]) {
  requireIncludes(
    cliSafetyTest,
    token,
    "CLI safety integration regression",
  );
}

for (const token of [
  "Animation Source Bundle",
  "node scripts/animation-source-bundle.mjs compile",
  "node scripts/animation-source-bundle.mjs verify",
  "does not grant provider, render, publication or repository authority",
  "one opened file handle",
  "PNG, JPEG, GIF and WebP",
  "does not duplicate source media",
]) {
  requireIncludes(documentation, token, "documentation");
}

for (const token of [
  "Stable control-document reads",
  "Collision-safe JSON output",
  "--replace-output",
  "create-only by default",
  "single filesystem link",
  "GitHub Actions",
  "Vercel",
]) {
  requireIncludes(
    safetyDocumentation,
    token,
    "control and output safety documentation",
  );
}

for (const source of [
  library,
  observationCommon,
  imageProbes,
  fileObserver,
  stableObservation,
  controlDocument,
  outputWriter,
  cli,
]) {
  for (const forbidden of [
    "git push",
    "git commit",
    "shell: true",
    "process.env.GITHUB_TOKEN",
    "process.env.VERCEL_TOKEN",
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
