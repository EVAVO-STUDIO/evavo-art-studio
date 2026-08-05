#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paths = Object.freeze({
  source: "apps/mcp/src/review.ts",
  contract: "apps/mcp/src/batch-review-contract.ts",
  files: "apps/mcp/src/batch-review-files.ts",
  gates: "apps/mcp/src/batch-review-gates.ts",
  batch: "apps/mcp/src/batch-review.ts",
  tests: "apps/mcp/test/brass-review-mcp.test.mjs",
  batchTests: "apps/mcp/test/brass-batch-review-mcp.test.mjs",
  package: "apps/mcp/package.json",
  rootPackage: "package.json",
  tsconfig: "apps/mcp/tsconfig.json",
  docs: "docs/brass-art-review-mcp.md",
});
const errors = [];
const source = {};
for (const [name, relative] of Object.entries(paths)) {
  const location = path.join(root, relative);
  if (!fs.existsSync(location)) {
    errors.push(`missing:${relative}`);
    continue;
  }
  const state = fs.lstatSync(location);
  if (!state.isFile() || state.isSymbolicLink()) {
    errors.push(`invalid:${relative}`);
    continue;
  }
  source[name] = fs.readFileSync(location, "utf8");
}
const requireTokens = (label, value, tokens) => {
  for (const token of tokens) {
    if (!value.includes(token)) errors.push(`${label}:missing:${token}`);
  }
};
const forbidTokens = (label, value, tokens) => {
  for (const token of tokens) {
    if (value.includes(token)) errors.push(`${label}:forbidden:${token}`);
  }
};

const batchSource = [source.contract, source.files, source.gates, source.batch].join("\n");
const testSource = [source.tests, source.batchTests].join("\n");

requireTokens("source", source.source ?? "", [
  "evavo_brass_art_review_mcp_v1",
  "EVAVO_ART_REVIEW_ALLOWED_ROOTS",
  "reviewAllowedRoots",
  "reviewCapabilityDocument",
  "art_review_capabilities",
  "validate_art_brief",
  "compile_art_production_plan",
  "inspect_art_repository",
  "inspect_sprite_frame_quality",
  "inspect_art_batch_quality",
  "inspect_sprite_sequence_quality",
  "assertPathWithinAllowedRoots",
  "analyseDecodedSpriteFrame",
  "reviewArtBatchDirectory",
  "analyseSpriteSequenceManifestFile",
  "gameOwnedRoleRequired: true",
  "writesEnabled: false",
  "providerExecutionAllowed: false",
  "runtimeJobSubmissionAllowed: false",
  "runtimeJobControlAllowed: false",
  "artifactMutationAllowed: false",
  "targetRepositoryMutationAllowed: false",
  "deletionAuthority: false",
  "promotionAuthority: false",
  "publicationAuthority: false",
  "arbitraryShellAllowed: false",
  "arbitraryGitArgumentsAllowed: false",
  "startBrassArtReviewServer",
]);
requireTokens("batch-source", batchSource, [
  "evavo_brass_art_batch_review_v1",
  "reviewArtBatchDirectory",
  "stableFileBytes",
  "roleId",
  "game-owned media role",
  "maximumFiles",
  "maximumDepth",
  "maximumTotalBytes",
  "ART_BATCH_SYMLINK_ENTRY",
  "ART_BATCH_PORTABLE_COLLISION",
  "ART_BATCH_FILE_CHANGED",
  "handle.readFile()",
  "exactSource",
  "decodedPixels",
  'scope: "complete-reviewed-batch"',
  "technical-pass-human-review-required",
  "background-mastering-required",
  "canvas-or-crop-rework-required",
  "edge-mastering-required",
  "humanCreativeApprovalRequired: true",
  "nativeGodotApprovalRequired: true",
  "mutationPerformed: false",
  "targetRepositoryMutationAllowed: false",
  "deletionAuthority: false",
  "promotionAuthority: false",
  "publicationAuthority: false",
]);
for (const [label, value] of [
  ["source", source.source ?? ""],
  ["batch-source", batchSource],
]) {
  forbidTokens(label, value, [
    "registerRuntimeTools",
    "registerProviderTools",
    "registerBookArtTools",
    "registerSelectionTools",
    "registerSpriteFamilyTools",
    "buildSpriteAtlasPackage",
    "writeGodotSpriteFramesImporter",
    "LocalRuntimeRepository",
    "LocalArtifactStore",
    "EVAVO_ART_ALLOW_WRITES",
    "EVAVO_ART_RUNTIME_ROOT",
    "EVAVO_ART_ARTIFACT_ROOT",
    "node:child_process",
    "writeFile",
    "unlink",
    "rm(",
    "git push",
    "git commit",
    "shell: true",
  ]);
}
requireTokens("tests", testSource, [
  'test("review roots are explicit, canonical and duplicate-free"',
  'test("review profile exposes exactly seven non-writing tools"',
  'test("batch review analyses complete stable bytes and groups duplicates"',
  'test("batch review retains exact source identity for decode failures"',
  'test("batch review fails closed on role, file limits and symbolic links"',
  'test("review source registers only the governed inspection and planning inventory"',
  'test("review source imports no provider, runtime, artifact or write implementation"',
  'test("symlinked review roots fail closed"',
]);
requireTokens("docs", source.docs ?? "", [
  "Brass & Brine Art Review MCP",
  "EVAVO_ART_REVIEW_ALLOWED_ROOTS",
  "art_review_capabilities",
  "inspect_sprite_frame_quality",
  "inspect_art_batch_quality",
  "evavo_brass_art_batch_review_v1",
  "roleId",
  "complete reviewed batch",
  "exact source-byte duplicates",
  "decoded-pixel duplicates",
  "writesEnabled = false",
  "Development Studio",
]);

try {
  const packageDocument = JSON.parse(source.package ?? "");
  if (packageDocument.scripts?.["start:review"] !== "node dist/review.js") {
    errors.push("package:start-review");
  }
} catch {
  errors.push("package:invalid-json");
}
try {
  const rootPackage = JSON.parse(source.rootPackage ?? "");
  if (
    rootPackage.scripts?.["brass:review:mcp:check"] !==
    "node scripts/check-brass-art-review-mcp.mjs"
  ) {
    errors.push("root-package:check-script");
  }
  if (
    !String(rootPackage.scripts?.check ?? "").includes(
      "pnpm run brass:review:mcp:check",
    )
  ) {
    errors.push("root-package:check-chain");
  }
} catch {
  errors.push("root-package:invalid-json");
}
try {
  const tsconfig = JSON.parse(source.tsconfig ?? "");
  if (!tsconfig.include?.includes("src/**/*.ts")) {
    errors.push("tsconfig:review-source-not-included");
  }
} catch {
  errors.push("tsconfig:invalid-json");
}

const registrations = [
  ...(source.source ?? "").matchAll(/server\.registerTool\(\s*"([^"]+)"/gu),
].map((match) => match[1]);
const expected = [
  "art_review_capabilities",
  "validate_art_brief",
  "compile_art_production_plan",
  "inspect_art_repository",
  "inspect_sprite_frame_quality",
  "inspect_art_batch_quality",
  "inspect_sprite_sequence_quality",
];
if (registrations.join("|") !== expected.join("|")) {
  errors.push(`source:tool-inventory:${registrations.join(",")}`);
}

if (errors.length > 0) {
  console.error("Brass art review MCP contract failed.");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Brass art review MCP contract passed.");
console.log("- exactly seven inspection and planning tools remain exposed");
console.log("- batch review binds one game-owned role, descriptor-stable bytes and complete-batch duplicate evidence");
console.log("- explicit canonical review roots are mandatory");
console.log("- provider, runtime, artifact, target and publication writes remain absent");
console.log("- build and behavioral tests remain part of the repository check chain");
