#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function fail(message) { throw new Error(message); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function safeRelative(value) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || value.split(/[\\/]+/).includes('..')) fail(`unsafe relative path: ${value}`);
  return value.replaceAll('\\', '/');
}

const inputArg = process.argv[2];
const outputArg = process.argv[3];
if (!inputArg || !outputArg) fail('usage: build-governed-workspace-job.mjs <art-delivery.json> <workspace-job.json>');
const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);
const bytes = await readFile(inputPath);
const delivery = JSON.parse(bytes.toString('utf8'));
if (delivery.schema !== 'evavo.art-studio.delivery.v1') fail('unexpected delivery schema');
if (!Array.isArray(delivery.items) || delivery.items.length === 0) fail('delivery requires items');
if (typeof delivery.workspaceRoot !== 'string' || typeof delivery.evidenceRoot !== 'string') fail('delivery requires workspaceRoot and evidenceRoot');
const operations = [];
for (const item of delivery.items) {
  const source = safeRelative(item.source);
  const staged = safeRelative(item.staged);
  const destination = safeRelative(item.destination);
  operations.push({ type: 'mkdir', path: path.posix.dirname(staged) });
  operations.push({ type: 'copy', from: source, to: staged, overwrite: false });
  if (item.processor) {
    const processor = safeRelative(item.processor.script);
    const type = item.processor.type === 'powershell' ? 'run-powershell' : 'run-python';
    operations.push({ type, script: processor, cwd: item.processor.cwd ? safeRelative(item.processor.cwd) : '.', args: Array.isArray(item.processor.args) ? item.processor.args.map(String) : [], env: item.processor.env || {} });
  }
  operations.push({ type: 'mkdir', path: path.posix.dirname(destination) });
  operations.push({ type: 'move', from: staged, to: destination });
}
for (const cleanup of delivery.cleanup || []) operations.push({ type: 'delete-file', path: safeRelative(cleanup) });
const job = {
  schema: 'evavo.governed-workspace-job.v1',
  runId: delivery.runId || `art-${sha256(bytes).slice(0, 16)}`,
  root: delivery.workspaceRoot,
  evidenceRoot: delivery.evidenceRoot,
  sourceDeliverySha256: sha256(bytes),
  operations,
};
await writeFile(outputPath, `${JSON.stringify(job, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: 'passed', output: outputPath, operations: operations.length, jobSha256: sha256(Buffer.from(JSON.stringify(job))) }));
