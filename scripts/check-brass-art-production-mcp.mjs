#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paths = Object.freeze({
  source: "apps/mcp/src/production.ts",
  contract: "apps/mcp/src/production-contract.ts",
  manifest: "apps/mcp/src/production-manifest.ts",
  tests: "apps/mcp/test/brass-production-mcp.test.mjs",
  package: "apps/mcp/package.json",
  rootPackage: "package.json",
  tsconfig: "apps/mcp/tsconfig.json",
  docs: "docs/brass-art-production-mcp.md",
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

const runtime = [source.source, source.contract, source.manifest].join("\n");

requireTokens("source", runtime, [
  "evavo_brass_art_production_mcp_v1",
  '"staging-only"',
  "EVAVO_ART_PRODUCTION_SOURCE_ROOTS",
  "EVAVO_ART_PRODUCTION_EVIDENCE_ROOT",
  "EVAVO_ART_PRODUCTION_MODE",
  "art_production_capabilities",
  "validate_art_delivery_batch",
  "stage_art_delivery_batch",
  "validateDeliveryBatchManifest",
  "executeDeliveryBatch",
  "deliveryBatchSha256",
  "deliveryProfileSha256",
  "duplicate JSON key",
  "byte-order mark",
  "ART_PRODUCTION_MANIFEST_BOM_FORBIDDEN",
  "bytes[0] === 0xef",
  "bytes[1] === 0xbb",
  "bytes[2] === 0xbf",
  '"preserve"',
  '"remove-border-matte"',
  '"luminance-alpha"',
  "stagingWritesEnabled: true",
  "createOnlyOutputs: true",
  "atomicOutputPublication: true",
  "BRASS_ART_PRODUCTION_MAXIMUM_MANIFEST_BYTES",
  "descriptorBoundManifestReads: true",
  "manifestIdentityRecheckedAfterRead: true",
  "descriptorBoundManifestRead: loaded.descriptorBoundRead",
  "manifestIdentityRechecked: loaded.manifestIdentityRechecked",
  "ART_PRODUCTION_MANIFEST_CHANGED_DURING_READ",
  "ART_PRODUCTION_MANIFEST_CHANGED_DURING_RESOLUTION",
  "fs.openSync",
  "fs.fstatSync",
  "fs.readSync",
  "sameBrassArtProductionFileIdentity",
  "sourceMutationAllowed: false",
  "targetRepositoryMutationAllowed: false",
  "deletionAuthority: false",
  "providerExecutionAllowed: false",
  "runtimeJobSubmissionAllowed: false",
  "artifactReferenceMutationAllowed: false",
  "promotionAuthority: false",
  "publicationAuthority: false",
  "arbitraryShellAllowed: false",
  "arbitraryGitArgumentsAllowed: false",
  "arbitraryExecutablePathsAllowed: false",
  "startBrassArtProductionServer",
]);
forbidTokens("source", runtime, [
  "registerRuntimeTools",
  "registerProviderTools",
  "registerBookArtTools",
  "registerSelectionTools",
  "registerSpriteFamilyTools",
  "LocalRuntimeRepository",
  "LocalArtifactStore",
  "writeGodotSpriteFramesImporter",
  "node:child_process",
  "git push",
  "git commit",
  "shell: true",
  "unlinkSync",
  "rmSync",
  "fs.readFileSync(manifestFile.path)",
]);
requireTokens("tests", source.tests ?? "", [
  'test("production roots are explicit, canonical and disjoint"',
  'test("production profile exposes exactly three bounded staging tools"',
  'test("strict manifest loading rejects duplicate keys and UTF-8 BOM"',
  'test("manifest identity swaps after resolution fail before parsing"',
  'test("manifest growth and truncation during descriptor reads fail closed"',
  'test("validation rechecks source bytes without writing output"',
  'test("staging creates one atomic batch and receipt outside the source root"',
  'test("changed source identity and unconfigured roots fail closed"',
  'test("production source registers no provider, runtime, deletion or publication surface"',
  'test("symlinked production roots fail closed"',
]);
requireTokens("docs", source.docs ?? "", [
  "Brass & Brine Art Production MCP",
  "EVAVO_ART_PRODUCTION_SOURCE_ROOTS",
  "EVAVO_ART_PRODUCTION_EVIDENCE_ROOT",
  "art_production_capabilities",
  "validate_art_delivery_batch",
  "stage_art_delivery_batch",
  "preserve",
  "remove-border-matte",
  "luminance-alpha",
  "create-only",
  "descriptor-bound",
  "path replacement",
  "Development Studio",
]);

try {
  const packageDocument = JSON.parse(source.package ?? "");
  if (packageDocument.scripts?.["start:production"] !== "node dist/production.js") {
    errors.push("package:start-production");
  }
  if (
    packageDocument.dependencies?.["@evavo/art-delivery-optimizer"] !==
    "workspace:*"
  ) {
    errors.push("package:delivery-optimizer-dependency");
  }
} catch {
  errors.push("package:invalid-json");
}
try {
  const rootPackage = JSON.parse(source.rootPackage ?? "");
  const expectedScripts = {
    "dev:mcp:production":
      "pnpm run mcp:production:build && pnpm --filter @evavo/art-studio-mcp start:production",
    "brass:production:mcp:check":
      "node scripts/check-brass-art-production-mcp.mjs",
    "mcp:production:build":
      "pnpm run build:domain && pnpm --filter @evavo/art-studio-mcp build",
    "mcp:production:start":
      "pnpm --filter @evavo/art-studio-mcp start:production",
  };
  for (const [name, expected] of Object.entries(expectedScripts)) {
    if (rootPackage.scripts?.[name] !== expected) {
      errors.push(`root-package:${name}`);
    }
  }
  if (
    !String(rootPackage.scripts?.check ?? "").includes(
      "pnpm run brass:production:mcp:check",
    )
  ) {
    errors.push("root-package:check-chain");
  }
} catch {
  errors.push("root-package:invalid-json");
}
try {
  const tsconfig = JSON.parse(source.tsconfig ?? "");
  if (
    !Array.isArray(tsconfig.references) ||
    !tsconfig.references.some(
      (entry) => entry?.path === "../../packages/delivery-optimizer",
    )
  ) {
    errors.push("tsconfig:delivery-optimizer-reference");
  }
} catch {
  errors.push("tsconfig:invalid-json");
}

const registrations = [
  ...runtime.matchAll(/server\.registerTool\(\s*"([^"]+)"/gu),
].map((match) => match[1]);
const expectedTools = [
  "art_production_capabilities",
  "validate_art_delivery_batch",
  "stage_art_delivery_batch",
];
if (registrations.join("|") !== expectedTools.join("|")) {
  errors.push(`source:tool-inventory:${registrations.join(",")}`);
}

if (errors.length > 0) {
  console.error("Brass art production MCP contract failed.");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Brass art production MCP contract passed.");
console.log("- exactly three staging-only tools remain exposed");
console.log("- exact source bytes and strict manifests are revalidated before optimization");
console.log("- UTF-8 BOM is rejected from raw bytes before TextDecoder normalization");
console.log("- descriptor-bound reads reject path replacement, rewrite, growth and truncation");
console.log("- outputs are atomic, create-only and external to source repositories");
console.log("- provider, runtime, target, deletion, promotion and publication authority remain absent");
