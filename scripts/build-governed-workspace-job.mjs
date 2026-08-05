#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function fail(message) {
  throw new Error(message);
}
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
function safeRelative(value, label = 'path') {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\\') ||
    path.posix.isAbsolute(value)
  ) {
    fail(`${label} must be a forward-slash relative path`);
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    value === '.' ||
    value === '..' ||
    value.startsWith('../')
  ) {
    fail(`${label} is not canonical`);
  }
  return value;
}
function exactSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    fail(`${label} must be lowercase SHA-256`);
  }
  return value;
}
function expectedOutput(value, itemId, index) {
  if (typeof value === 'string') {
    return { path: safeRelative(value, `${itemId}.expectedOutputs[${index}]`), kind: 'file' };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${itemId}.expectedOutputs[${index}] is invalid`);
  }
  return {
    ...value,
    path: safeRelative(value.path, `${itemId}.expectedOutputs[${index}].path`),
    kind: value.kind || 'file',
  };
}

const inputArg = process.argv[2];
const outputArg = process.argv[3];
if (!inputArg || !outputArg) {
  fail(
    'usage: build-governed-workspace-job.mjs <art-delivery.json> <workspace-job.json>',
  );
}
const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);
const bytes = await readFile(inputPath);
const delivery = JSON.parse(bytes.toString('utf8'));
if (
  delivery.schema !== 'evavo.art-studio.delivery.v2' &&
  delivery.schema !== 'evavo.art-studio.delivery.v1'
) {
  fail('unexpected delivery schema');
}
if (!Array.isArray(delivery.items) || delivery.items.length === 0) {
  fail('delivery requires items');
}
if (
  typeof delivery.workspaceRoot !== 'string' ||
  typeof delivery.evidenceRoot !== 'string'
) {
  fail('delivery requires workspaceRoot and evidenceRoot');
}
const operations = [];
const seenDestinations = new Set();
for (let itemIndex = 0; itemIndex < delivery.items.length; itemIndex += 1) {
  const item = delivery.items[itemIndex];
  const itemId = String(item.id || `item-${itemIndex + 1}`);
  const source = safeRelative(item.source, `${itemId}.source`);
  const sourceSha256 = exactSha(item.sourceSha256, `${itemId}.sourceSha256`);
  const stagedInput = safeRelative(
    item.stagedInput || item.staged,
    `${itemId}.stagedInput`,
  );
  const destination = safeRelative(item.destination, `${itemId}.destination`);
  const destinationKey = destination.normalize('NFC').toLocaleLowerCase('en-US');
  if (seenDestinations.has(destinationKey)) {
    fail(`duplicate delivery destination: ${destination}`);
  }
  seenDestinations.add(destinationKey);
  operations.push({
    type: 'copy',
    from: source,
    to: stagedInput,
    overwrite: false,
    expectedSha256: sourceSha256,
  });

  if (!item.processor) {
    operations.push({
      type: 'move',
      from: stagedInput,
      to: destination,
      expectedSha256: sourceSha256,
    });
    continue;
  }

  const processor = item.processor;
  const script = safeRelative(processor.script, `${itemId}.processor.script`);
  const type = processor.type === 'powershell' ? 'run-powershell' : 'run-python';
  const outputs = Array.isArray(processor.expectedOutputs)
    ? processor.expectedOutputs.map((value, index) =>
        expectedOutput(value, itemId, index),
      )
    : [];
  if (outputs.length === 0) {
    fail(`${itemId}.processor must declare create-only expectedOutputs`);
  }
  const processed = safeRelative(
    item.processed || processor.processed,
    `${itemId}.processed`,
  );
  const processedDescriptor = outputs.find(
    (candidate) =>
      candidate.path === processed && (candidate.kind || 'file') === 'file',
  );
  if (!processedDescriptor) {
    fail(`${itemId}.processed must name a declared file output`);
  }
  const executableCandidates = Array.isArray(processor.executableCandidates)
    ? processor.executableCandidates.map(String)
    : type === 'run-python'
      ? ['py', 'python', 'python3']
      : ['pwsh', 'powershell'];
  operations.push({
    type,
    executableCandidates,
    script,
    cwd: processor.cwd ? safeRelative(processor.cwd, `${itemId}.processor.cwd`) : '.',
    args: Array.isArray(processor.args) ? processor.args.map(String) : [],
    env: processor.env || {},
    expectedOutputs: outputs,
    ...(processor.timeoutMs === undefined ? {} : { timeoutMs: processor.timeoutMs }),
    ...(processor.outputLimitBytes === undefined
      ? {}
      : { outputLimitBytes: processor.outputLimitBytes }),
  });
  if (processed !== destination) {
    operations.push({ type: 'move', from: processed, to: destination });
  }
  operations.push({
    type: 'delete-file',
    path: stagedInput,
    expectedSha256: sourceSha256,
  });
}
for (let index = 0; index < (delivery.cleanup || []).length; index += 1) {
  const cleanup = delivery.cleanup[index];
  if (!cleanup || typeof cleanup !== 'object' || Array.isArray(cleanup)) {
    fail(`cleanup[${index}] must bind a path and SHA-256`);
  }
  operations.push({
    type: 'delete-file',
    path: safeRelative(cleanup.path, `cleanup[${index}].path`),
    expectedSha256: exactSha(
      cleanup.expectedSha256 || cleanup.sha256,
      `cleanup[${index}].sha256`,
    ),
  });
}
const job = {
  schema: 'evavo.governed-workspace-job.v1',
  runId: delivery.runId || `art-${sha256(bytes).slice(0, 16)}`,
  root: delivery.workspaceRoot,
  evidenceRoot: delivery.evidenceRoot,
  sourceDeliverySha256: sha256(bytes),
  stagingOnly: delivery.stagingOnly !== false,
  operations,
};
await writeFile(outputPath, `${JSON.stringify(job, null, 2)}\n`, {
  flag: 'wx',
});
console.log(
  JSON.stringify({
    status: 'passed',
    output: outputPath,
    operations: operations.length,
    jobSha256: sha256(Buffer.from(JSON.stringify(job))),
  }),
);
