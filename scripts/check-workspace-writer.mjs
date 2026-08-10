#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const files = {
  types: "packages/repo-inspector/src/workspace-writer-types.ts",
  foundation: "packages/repo-inspector/src/workspace-writer-foundation.ts",
  filesystem: "packages/repo-inspector/src/workspace-writer-filesystem.ts",
  media: "packages/repo-inspector/src/workspace-writer-media.ts",
  intakeSource: "packages/repo-inspector/src/workspace-writer-intake-source.ts",
  preview: "packages/repo-inspector/src/workspace-writer-preview.ts",
  requests: "packages/repo-inspector/src/workspace-writer-requests.ts",
  intakeRequests: "packages/repo-inspector/src/workspace-writer-intake-requests.ts",
  planRequest: "packages/repo-inspector/src/workspace-writer-plan-request.ts",
  planParser: "packages/repo-inspector/src/workspace-writer-plan-parser.ts",
  storageRequest: "packages/repo-inspector/src/workspace-writer-storage-request.ts",
  intake: "packages/repo-inspector/src/workspace-writer-intake.ts",
  plan: "packages/repo-inspector/src/workspace-writer-plan.ts",
  operations: "packages/repo-inspector/src/workspace-writer-operations.ts",
  rollback: "packages/repo-inspector/src/workspace-writer-rollback.ts",
  apply: "packages/repo-inspector/src/workspace-writer-apply.ts",
  policy: "packages/repo-inspector/src/workspace-writer-policy.ts",
  storage: "packages/repo-inspector/src/workspace-writer-storage.ts",
  transfer: "packages/repo-inspector/src/workspace-writer-transfer.ts",
  index: "packages/repo-inspector/src/workspace-writer.ts",
  package: "packages/repo-inspector/package.json",
  mcp: "apps/mcp/src/workspace-writer.ts",
  transferMcp: "apps/mcp/src/asset-transfer.ts",
  mcpPackage: "apps/mcp/package.json",
  cli: "apps/cli/src/workspace-writer-cli.ts",
  cliPackage: "apps/cli/package.json",
  intakeTests: "packages/repo-inspector/test/workspace-writer-intake.test.mjs",
  fileOperationTests: "packages/repo-inspector/test/workspace-writer-file-operations.test.mjs",
  policyStorageTests: "packages/repo-inspector/test/workspace-writer-policy-storage.test.mjs",
  transferTests: "packages/repo-inspector/test/workspace-writer-transfer.test.mjs",
  docs: "docs/ART_WORKSPACE_WRITER.md",
  operationsDocs: "docs/ART_WORKSPACE_WRITER_OPERATIONS.md",
  transferDocs: "docs/ART_ASSET_TRANSFER.md",
  rootPackage: "package.json",
  environment: ".env.example",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([name, file]) => [
      name,
      await readFile(new URL(`../${file}`, import.meta.url), "utf8"),
    ]),
  ),
);
const implementation = [
  source.types,
  source.foundation,
  source.filesystem,
  source.media,
  source.intakeSource,
  source.preview,
  source.requests,
  source.intakeRequests,
  source.planRequest,
  source.planParser,
  source.storageRequest,
  source.intake,
  source.plan,
  source.operations,
  source.rollback,
  source.apply,
  source.policy,
  source.storage,
  source.transfer,
  source.index,
].join("\n");
const errors = [];

function requireTokens(label, content, tokens) {
  for (const token of tokens) {
    if (!content.includes(token)) errors.push(`${label} is missing ${token}`);
  }
}

function forbidTokens(label, content, tokens) {
  for (const token of tokens) {
    if (content.includes(token)) errors.push(`${label} contains forbidden ${token}`);
  }
}

requireTokens("workspace writer", implementation, [
  "evavo_art_workspace_intake_receipt_v1",
  "evavo_art_workspace_file_plan_v1",
  "evavo_art_workspace_file_receipt_v1",
  "evavo_art_workspace_storage_receipt_v1",
  "evavo_art_workspace_transfer_bundle_v1",
  "evavo_art_workspace_transfer_receipt_v1",
  "evavo.storage-art-ingest-request.v1",
  "evavo.repository-asset-write-request.v1",
  "intakeArtWorkspaceFiles",
  "readArtWorkspaceMediaPreview",
  "compileArtWorkspaceFilePlan",
  "applyArtWorkspaceFilePlan",
  "archiveArtWorkspaceFileToStorage",
  "compileArtWorkspaceTransferBundle",
  "writeArtWorkspaceTransferBundle",
  "COPYFILE_EXCL",
  "expectedTargetSha256",
  "reversible-trash",
  "ART_WORKSPACE_INTAKE_IMMUTABLE",
  "ART_WORKSPACE_TRANSFER_REPOSITORY_FILE_TOO_LARGE",
  "rollback-required",
  "shell: false",
  "EVAVO_STORAGE_",
  "bytesFlowThroughMcp: false",
  "providerCredentialExposed: false",
  "gitCommitCreated: false",
  "gitPushPerformed: false",
  "publicationAuthority: false",
]);
requireTokens("repo package", source.package, [
  '"./workspace-writer"',
  '"./dist/workspace-writer.js"',
]);
requireTokens("workspace MCP", source.mcp, [
  "art_workspace_writer_capabilities",
  "art_workspace_preview_image",
  "art_workspace_intake_files",
  "art_workspace_compile_file_plan",
  "art_workspace_apply_file_plan",
  "art_workspace_archive_to_evavo_storage",
  'type: "image" as const',
]);
requireTokens("asset transfer MCP", source.transferMcp, [
  "art_workspace_transfer_capabilities",
  "art_workspace_compile_transfer_bundle",
  "art_workspace_write_transfer_bundle",
  "storage_verify_art_handoff then storage_ingest_art_handoff",
  "evavo_git_compile_asset_write then evavo_git_apply_asset_write",
  "bytesFlowThroughMcp: false",
  "repositoryWritePerformed: false",
  "storageWritePerformed: false",
  "publicationAuthority: false",
]);
requireTokens("MCP package", source.mcpPackage, [
  '"start:workspace-writer"',
  "dist/workspace-writer.js",
  '"start:asset-transfer"',
  "dist/asset-transfer.js",
]);
requireTokens("workspace CLI", source.cli, [
  "evavo-art-workspace intake",
  "evavo-art-workspace plan",
  "evavo-art-workspace apply",
  "evavo-art-workspace archive",
]);
requireTokens("CLI package", source.cliPackage, [
  '"evavo-art-workspace"',
  "dist/workspace-writer-cli.js",
]);
requireTokens(
  "workspace tests",
  `${source.intakeTests}\n${source.fileOperationTests}\n${source.policyStorageTests}\n${source.transferTests}`,
  [
    "base64 intake is create-only",
    "intake originals are immutable",
    "copy is no-overwrite and detects a target race",
    "reversible trash and exact restore",
    "replace retains exact previous bytes",
    "excludes provider credentials",
    "small reviewed assets compile to a path-only governed repository request",
    "automatic routing sends oversized ordinary Git assets to EVAVO Storage",
    "explicit repository routing never silently bypasses Git size limits",
  ],
);
requireTokens(
  "workspace documentation",
  `${source.docs}\n${source.operationsDocs}\n${source.transferDocs}`,
  [
    "ChatGPT and Claude attachment intake",
    "EVAVO Storage",
    "Development Studio",
    "Sprite sheets, atlases and animation sequences",
    "No arbitrary shell",
    "Art workspace transfer orchestration",
    "evavo.repository-asset-write-request.v1",
    "evavo.storage-art-ingest-request.v1",
    "image bytes through Chat, Claude or MCP payloads",
  ],
);
requireTokens("root scripts", source.rootPackage, [
  '"dev:mcp:workspace-writer"',
  '"workspace-writer:check"',
  '"workspace-writer"',
]);
requireTokens("environment", source.environment, [
  "EVAVO_ART_IMPORT_ROOTS",
  "EVAVO_ART_ALLOW_STORAGE_WRITES",
  "EVAVO_STORAGE_OPERATOR_COMMAND_JSON",
]);

forbidTokens("workspace writer", implementation, [
  "git push",
  "git commit",
  "--force",
  "shell: true",
  "eval(",
  "new Function(",
]);
forbidTokens("workspace MCP", source.mcp, [
  "child_process",
  "process.env.OPENAI_API_KEY",
  "git push",
]);
forbidTokens("asset transfer MCP", source.transferMcp, [
  "child_process",
  "process.env.OPENAI_API_KEY",
  "git push",
  "git commit",
  "fetch(",
]);
forbidTokens("workspace CLI", source.cli, ["child_process", "git push"]);

if (errors.length) {
  console.error("EVAVO Art Studio callable workspace writer contract failed:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("EVAVO Art Studio callable workspace writer contract passed.");
console.log("- mounted and bounded base64 art intake is create-only and SHA-256 bound");
console.log("- intake originals remain immutable while working files stay fully organisable");
console.log("- image preview returns exact MCP image content without mutation");
console.log("- copy, move, replace, reversible trash and restore are stale-detecting and no-overwrite");
console.log("- Storage and repository transfer manifests are path-only, self-hashed and create-only");
console.log("- oversized ordinary Git payloads route to EVAVO Storage without silent Git bloat");
console.log("- downstream storage, repository publication and mainline mutation remain separately authorised");
