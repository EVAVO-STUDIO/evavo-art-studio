#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'scripts/project-art/review-studio.mjs',
  'scripts/compile-project-art-review.mjs',
  'scripts/build-project-art-review.mjs',
  'scripts/finalize-project-art-review.mjs',
  'scripts/test-project-art-review.mjs',
  'tools/project_art_review_mcp.mjs',
  'config/mcp.project-art-review.windows.example.json',
  'docs/PROJECT_ART_REVIEW_STUDIO.md',
  '.github/workflows/project-art-review-studio.yml',
  'package.json',
];
const source = {};
for (const relative of files) {
  const target = path.join(root, relative);
  const state = await lstat(target);
  assert.equal(state.isFile(), true, `${relative} must be a regular file`);
  assert.equal(state.isSymbolicLink(), false, `${relative} must not be a symlink`);
  assert.ok(state.size > 0 && state.size < 2_000_000, `${relative} has invalid size`);
  source[relative] = await readFile(target, 'utf8');
  if (relative.endsWith('.mjs')) {
    const syntax = spawnSync(process.execPath, ['--check', target], {
      cwd: root,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    });
    assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
  }
}

const core = source['scripts/project-art/review-studio.mjs'];
for (const token of [
  'evavo.project-art-review-request.v1',
  'evavo.project-art-review-plan.v1',
  'evavo.project-art-review-bundle.v1',
  'evavo.project-art-review-decisions-draft.v1',
  'evavo.project-art-review-decisions.v1',
  'evavo.project-art-review-receipt.v1',
  'grid',
  'split',
  'overlay',
  'difference',
  'flicker',
  'animation',
  "connect-src 'none'",
  'decisionOutputIsDraftOnly: true',
  'PROJECT_ART_REVIEW_SOURCE_CHANGED',
  'PROJECT_ART_REVIEW_PATH_SYMLINK',
  'PROJECT_ART_REVIEW_PLAN_AUTHORITY_INVALID',
  'PROJECT_ART_REVIEW_KEEP_INVALID',
  'PROJECT_ART_REVIEW_REPAIR_INVALID',
  'independentApprovalPerformed: false',
  'candidatePromotionPerformed: false',
  'repositoryMutationPerformed: false',
  'publicationPerformed: false',
]) {
  assert.equal(core.includes(token), true, `review core lost ${token}`);
}
for (const forbidden of [
  'fetch(',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'eval(',
  'new Function',
  'shell: true',
  'git push',
  'git commit',
  'forcePush: true',
  'candidateApproval: true',
  'candidatePromotion: true',
  'repositoryMutationPerformed: true',
]) {
  assert.equal(core.includes(forbidden), false, `review core contains forbidden ${forbidden}`);
}

const mcp = source['tools/project_art_review_mcp.mjs'];
for (const token of [
  'evavo_art_review_capabilities',
  'evavo_art_compile_review',
  'evavo_art_build_review',
  'evavo_art_finalize_review',
  'EVAVO_ART_REVIEW_ROOTS',
  'EVAVO_ART_REVIEW_MCP_ALLOW_WRITE',
  'bytesFlowThroughMcp: false',
  'candidateApproval: false',
  'candidatePromotion: false',
  'repositoryMutation: false',
  'publication: false',
]) {
  assert.equal(mcp.includes(token), true, `review MCP lost ${token}`);
}
for (const forbidden of ['child_process', 'shell: true', 'exec(', 'spawn(', 'git push', 'forcePush: true']) {
  assert.equal(mcp.includes(forbidden), false, `review MCP contains forbidden ${forbidden}`);
}

const configuration = JSON.parse(source['config/mcp.project-art-review.windows.example.json']);
assert.equal(configuration.mcpServers['evavo-project-art-review'].command, 'node');
assert.equal(
  configuration.mcpServers['evavo-project-art-review'].env.EVAVO_ART_REVIEW_MCP_ALLOW_WRITE,
  'false',
);
assert.ok(
  configuration.mcpServers['evavo-project-art-review'].args[0].endsWith('tools\\project_art_review_mcp.mjs'),
);

const workflow = source['.github/workflows/project-art-review-studio.yml'];
for (const token of [
  'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd',
  'actions/setup-python@a309ff8b426b58ec0e2a45f0f869d46889d02405',
  'pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320',
  'actions/setup-node@6044e13b5dc448c55e2357c09f80417699197238',
  'persist-credentials: false',
  'python-version: "3.13.5"',
  'node-version: "22.14.0"',
  'version: 10.13.1',
  'pnpm install --frozen-lockfile',
  'pnpm run project-art:review:check',
  'pnpm check',
  'git diff --exit-code',
]) {
  assert.equal(workflow.includes(token), true, `review workflow lost ${token}`);
}

const packageDocument = JSON.parse(source['package.json']);
for (const name of [
  'project-art:review:compile',
  'project-art:review:build',
  'project-art:review:finalize',
  'project-art:review:mcp',
  'project-art:review:check',
]) {
  assert.ok(packageDocument.scripts?.[name], `package.json missing ${name}`);
}
assert.match(packageDocument.scripts.check, /project-art:review:check/u);

console.log('Project Art Review Studio contract passed.');
console.log('- exact source-bound offline comparison, candidate, animation and atlas review surfaces retained');
console.log('- exported browser decisions remain drafts until governed identity and gate validation seals them');
console.log('- MCP bytes, provider execution, approval, promotion, repository mutation and publication remain absent');
console.log('- permanent workflow runs focused attacks and complete Art Studio validation');
