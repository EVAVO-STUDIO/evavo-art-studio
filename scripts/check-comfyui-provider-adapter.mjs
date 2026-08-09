#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const files = new Map(
  await Promise.all(
    [
      "packages/providers/src/adapters/comfyui.ts",
      "packages/providers/src/index.ts",
      "apps/worker/src/provider-handlers.ts",
      "packages/providers/test/comfyui.test.mjs",
      "apps/worker/test/comfyui-provider-registry.test.mjs",
      "scripts/compile-comfyui-workflow-catalog.mjs",
      "docs/COMFYUI_PROVIDER_ADAPTER.md",
      "docs/RAW_ART_PROVIDER_RUNTIME_EXECUTION.md",
      ".env.example",
      ".github/workflows/comfyui-provider-adapter.yml",
      "package.json",
    ].map(async (file) => [file, await readFile(file, "utf8")]),
  ),
);

const errors = [];
function requireTokens(file, tokens) {
  const source = files.get(file) ?? "";
  for (const token of tokens) {
    if (!source.includes(token)) errors.push(`${file} is missing ${token}`);
  }
}
function forbidTokens(file, tokens) {
  const source = files.get(file) ?? "";
  for (const token of tokens) {
    if (source.includes(token)) errors.push(`${file} must not contain ${token}`);
  }
}

requireTokens("packages/providers/src/adapters/comfyui.ts", [
  "evavo.comfyui-workflow-catalog-draft.v1",
  "evavo.comfyui-workflow-catalog.v1",
  "evavo.comfyui-provider-evidence.v1",
  "compileComfyUIWorkflowCatalog",
  "validateComfyUIWorkflowCatalog",
  "loadComfyUIWorkflowCatalogFromFile",
  "createComfyUIProviderAdapters",
  "loadComfyUIProviderAdaptersFromCatalogFile",
  "workflowSha256",
  "nodeInventorySha256",
  "modelInventorySha256",
  "runtimeInventorySha256",
  "runtimeNodeDefinitionsSha256",
  "retainedByProvider: true",
  "/object_info",
  "/upload/image",
  "/prompt",
  "/history/",
  "/view?",
  "/interrupt",
  "COMFYUI_REFERENCE_IDENTITY_MISMATCH",
  "COMFYUI_UPLOAD_IDENTITY_MISMATCH",
  "stored bytes do not match the exact uploaded image identity",
  "COMFYUI_RUNTIME_NODE_MISSING",
  "COMFYUI_REMOTE_TLS_REQUIRED",
  "reuse mutable input",
  "dedicatedInstance",
  "candidateApprovalPerformed: false",
  "candidatePromotionPerformed: false",
  "repositoryMutationPerformed: false",
  "publicationPerformed: false",
]);
forbidTokens("packages/providers/src/adapters/comfyui.ts", [
  "node:child_process",
  "exec(",
  "execFile(",
  "spawn(",
  "eval(",
  "git push",
  "forcePush: true",
  "candidateApprovalPerformed: true",
  "candidatePromotionPerformed: true",
  "repositoryMutationPerformed: true",
  "publicationPerformed: true",
]);

requireTokens("apps/worker/src/provider-handlers.ts", [
  "EVAVO_ART_COMFYUI_CATALOG",
  "EVAVO_ART_COMFYUI_CATALOG_ROOT",
  "EVAVO_ART_COMFYUI_BASE_URL",
  "EVAVO_ART_COMFYUI_DEDICATED_INSTANCE",
  "EVAVO_ART_COMFYUI_ALLOW_REMOTE",
  "EVAVO_ART_COMFYUI_API_TOKEN",
  "loadComfyUIProviderAdaptersFromCatalogFile",
  "must be exactly true or false",
]);
requireTokens("scripts/compile-comfyui-workflow-catalog.mjs", [
  "flag: \"wx\"",
  "arbitraryWorkflowSubmission: false",
  "providerExecution: false",
  "candidateApproval: false",
  "repositoryMutation: false",
  "publication: false",
  "forcePush: false",
]);
requireTokens("docs/COMFYUI_PROVIDER_ADAPTER.md", [
  "API-format workflow",
  "exact workflow SHA-256",
  "dedicated instance",
  "fresh durable admission",
  "fresh execution authorisation",
  "fixture-only",
  "does not accept arbitrary workflow JSON",
  "matching animation frames",
  "retainedByProvider: true",
  "uploaded `input` object back through `view`",
]);
requireTokens(".github/workflows/comfyui-provider-adapter.yml", [
  "pnpm install --frozen-lockfile",
  "Run governed ComfyUI adapter regressions",
  "Run complete Art Studio validation",
  "Verify immutable lockfile and clean source",
]);
requireTokens("package.json", [
  "provider:comfyui:catalog:compile",
  "provider:comfyui:check",
]);

if (errors.length) {
  process.stderr.write(`Governed ComfyUI provider-adapter contract failed:\n\n${errors.map((entry) => `- ${entry}`).join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Governed ComfyUI provider-adapter contract passed.\n");
