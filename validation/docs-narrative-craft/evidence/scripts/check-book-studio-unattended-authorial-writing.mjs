#!/usr/bin/env node

import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const files = Object.freeze({
  bridgeTypes: "packages/core/src/book-studio-authorial-writing-bridge-types.ts",
  bridge: "packages/core/src/book-studio-authorial-writing-bridge.ts",
  narrativeFacade: "packages/core/src/book-studio-narrative-craft.ts",
  coordinator: "packages/core/src/book-studio-unattended-authorial-writing.ts",
  barrel: "packages/core/src/index.ts",
  coreTest: "packages/core/test/book-studio-unattended-authorial-writing.test.mjs",
  service: "apps/web/src/lib/book-studio-unattended-authorial-writing-service.ts",
  route: "apps/web/src/app/api/v1/book-studio/unattended-production/authorial-writing/route.ts",
  cli: "apps/web/scripts/evavo-docs-book-unattended-authorial-writing-cli.mjs",
  mcp: "apps/web/scripts/evavo-docs-book-unattended-authorial-writing-mcp.mjs",
  adapterTest: "apps/web/scripts/test-book-studio-unattended-authorial-writing-adapters.mjs",
  apiClient: "apps/web/scripts/docs-suite-api-client.mjs",
  workflow: ".github/workflows/book-studio-unattended-authorial-writing.yml",
  documentation: "docs/migrations/book-studio/BOOK_STUDIO_UNATTENDED_AUTHORIAL_WRITING.md",
});

function fail(message) { failures.push(message); }
function expect(source, token, label) {
  if (!source.includes(token)) fail(`${label} is missing ${JSON.stringify(token)}.`);
}
function reject(source, token, label) {
  if (source.includes(token)) fail(`${label} contains prohibited token ${JSON.stringify(token)}.`);
}
async function exists(absolute) {
  try { await access(absolute); return true; }
  catch { return false; }
}
async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(absolute));
    else output.push(absolute);
  }
  return output;
}

const sourceByName = new Map();
for (const [name, relative] of Object.entries(files)) {
  const absolute = path.join(root, relative);
  if (!(await exists(absolute))) {
    fail(`Required file is missing: ${relative}.`);
    continue;
  }
  sourceByName.set(name, await readFile(absolute, "utf8"));
}

if (!failures.length) {
  const source = Object.fromEntries(sourceByName);
  expect(source.bridgeTypes, "BOOK_AUTHORIAL_WRITING_BRIDGE_CONTRACT", "authorial bridge types");
  expect(source.bridge, 'from "./book-studio-authorial-writing-bridge-types"', "authorial bridge");
  expect(source.narrativeFacade, 'export * from "./book-studio-authorial-writing-bridge-types"', "narrative facade");
  expect(source.narrativeFacade, 'export * from "./book-studio-authorial-writing-bridge"', "narrative facade");
  expect(source.barrel, 'export * from "./book-studio-narrative-craft"', "core barrel");
  expect(source.barrel, 'export * from "./book-studio-unattended-authorial-writing"', "core barrel");

  for (const token of [
    "expectedUnattendedResultFingerprint",
    "requiredWritingHandoffEvidenceIds",
    "revisionCycleEvidenceId",
    "priorRevisionReceiptFingerprint",
    "bridgeInputContainsEvidence",
    "dependencyReceipts",
    "requestFingerprint",
    "readinessFingerprint",
    "planFingerprint",
    "oneBoundedStagePerAutomationCallRequired",
    "oneProviderAttemptPerRevisionCycleRequired",
    "providerFallbackAllowed: false",
    "automaticCanonicalAdmissionAllowed: false",
    '"/api/v1/book-studio/writing-candidate/authorial"',
  ]) expect(source.coordinator, token, "unattended authorial coordinator");
  reject(source.coordinator, "providerCallPerformed: true", "unattended authorial coordinator");
  reject(source.coordinator, "canonicalManuscriptMutationPerformed: true", "unattended authorial coordinator");
  reject(source.coordinator, "publicationPerformed: true", "unattended authorial coordinator");

  expect(source.service, "expectedRuntimeRequestFingerprint", "server coordinator");
  expect(source.service, "coordinationFingerprint", "server coordinator");
  const providerCalls = [...source.service.matchAll(/coordinateBookWritingCandidate\s*\(/gu)].length;
  if (providerCalls !== 1) fail(`Server coordinator must contain exactly one Writing coordination call, found ${providerCalls}.`);

  for (const token of [
    "readDocsSuiteRequestContext",
    'scopes.includes("documents:write")',
    "privateHeaders",
    "export const maxDuration = 300",
    "MAXIMUM_BODY_BYTES = 4_400_000",
    "coordinateBookUnattendedAuthorialWriting",
  ]) expect(source.route, token, "protected route");
  reject(source.route, "authenticateRequest", "protected route");
  reject(source.route, "../../../../../../../../packages", "protected route");

  expect(source.cli, 'flag: "wx"', "CLI");
  expect(source.cli, "/api/v1/book-studio/unattended-production/authorial-writing", "CLI");
  for (const token of [
    'const MODERN_PROTOCOL = "2026-07-28"',
    'const LEGACY_PROTOCOL = "2025-11-25"',
    'message.method === "server/discover"',
    '"io.modelcontextprotocol/protocolVersion"',
    '"io.modelcontextprotocol/serverInfo"',
    'resultType: "complete"',
    'message.method === "initialize"',
    "one no-fallback Writing Studio attempt",
  ]) expect(source.mcp, token, "MCP adapter");
  expect(source.adapterTest, "modern MCP is sessionless", "adapter tests");
  expect(source.adapterTest, "legacy MCP retains initialize compatibility", "adapter tests");

  for (const endpoint of [
    '"/api/v1/book-studio/writing-candidate"',
    '"/api/v1/book-studio/writing-candidate/authorial"',
    '"/api/v1/book-studio/unattended-production/authorial-writing"',
  ]) expect(source.apiClient, endpoint, "long-running timeout policy");
  expect(source.apiClient, "LONG_RUNNING_BOOK_ENDPOINTS.has(pathname)", "long-running timeout policy");

  expect(source.workflow, "corepack pnpm install --frozen-lockfile", "workflow");
  expect(source.workflow, "@evavo-docs/core typecheck", "workflow");
  expect(source.workflow, "@evavo-docs/web typecheck", "workflow");
  expect(source.workflow, "corepack pnpm verify", "workflow");
  expect(source.workflow, "corepack pnpm build", "workflow");
  expect(source.documentation, "The provider request is therefore directly bound to the unattended plan.", "documentation");
  expect(source.coreTest, "authority escalation attacks", "core attacks");

  const coreDirectory = path.join(root, "packages/core/src");
  const relevant = (await walk(coreDirectory)).filter((absolute) => {
    const name = path.basename(absolute);
    return absolute.endsWith(".ts") && (
      name.startsWith("book-studio-authorial-")
      || name.startsWith("book-studio-narrative-")
      || name.startsWith("book-studio-idea-lab")
      || name.startsWith("book-studio-unattended-")
    );
  });
  const relativeImport = /(?:from\s+|export\s+\*\s+from\s+|import\s*\(\s*)["'](\.[^"']+)["']/gu;
  for (const absolute of relevant) {
    const moduleSource = await readFile(absolute, "utf8");
    for (const match of moduleSource.matchAll(relativeImport)) {
      const specifier = match[1];
      const resolved = path.resolve(path.dirname(absolute), specifier);
      const candidates = path.extname(resolved)
        ? [resolved, ...(resolved.endsWith(".js") ? [`${resolved.slice(0, -3)}.ts`] : [])]
        : [`${resolved}.ts`, `${resolved}.tsx`, path.join(resolved, "index.ts")];
      const checks = await Promise.all(candidates.map(exists));
      if (!checks.some(Boolean)) {
        fail(`${path.relative(root, absolute)} imports missing relative module ${specifier}.`);
      }
    }
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`book_studio_unattended_authorial_check_failure: ${failure}`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    contract: "evavo_docs_book_unattended_authorial_writing_v1",
    actualCoreImportGraphChecked: true,
    actualCoreBarrelChecked: true,
    exactPlanAndStageEvidenceBound: true,
    revisionReceiptDoubleBound: true,
    oneProviderAttemptPerCycle: true,
    providerFallbackAllowed: false,
    modernMcpProtocol: "2026-07-28",
    legacyMcpCompatibility: true,
    canonicalMutationPerformed: false,
    publicationPerformed: false,
  })}\n`);
}
