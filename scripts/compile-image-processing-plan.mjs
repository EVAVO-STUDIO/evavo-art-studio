#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [workOrderPath, outputPath] = process.argv.slice(2);
if (!workOrderPath || !outputPath) throw new Error('usage: compile-image-processing-plan.mjs <work-order.json> <output.json>');
const workBytes = await readFile(path.resolve(workOrderPath));
const work = JSON.parse(workBytes.toString('utf8'));
const registry = JSON.parse(await readFile(new URL('../config/image-processing-recipes.v1.json', import.meta.url), 'utf8'));
if (work.schema !== 'evavo.image-reference-work-order.v1') throw new Error('unexpected work order schema');
if (!/^[0-9a-f]{64}$/.test(work.sourceSha256 || '')) throw new Error('exact source hash required');
if (!Array.isArray(work.operations)) throw new Error('operations must be an array');
const supported = new Map();
for (const processor of registry.processors) for (const capability of processor.capabilities) {
  const current = supported.get(capability) || [];
  current.push(processor);
  supported.set(capability, current.sort((a,b)=>a.fallbackRank-b.fallbackRank));
}
const steps = [];
for (const operation of work.operations) {
  const candidates = supported.get(operation);
  if (!candidates?.length) throw new Error(`no deterministic processor supports ${operation}`);
  steps.push({
    operation,
    preferredProcessor: candidates[0].id,
    fallbackProcessors: candidates.slice(1).map(candidate=>candidate.id),
    preserveAlphaPolicy: work.alphaPolicy,
    targetCanvas: work.targetCanvas,
    runtimeFormat: work.runtimeFormat
  });
}
const plan = {
  schema: 'evavo.image-processing-plan.v1',
  sourcePath: work.sourcePath,
  sourceSha256: work.sourceSha256,
  decision: work.decision,
  steps,
  requiredEvidence: ['decoded-dimensions','alpha-usage','before-sha256','after-sha256','output-byte-length','processor-identity'],
  sourceOverwrite: false,
  createOnlyOutput: true,
  providerExecution: false,
  publication: false,
  workOrderSha256: createHash('sha256').update(workBytes).digest('hex')
};
await writeFile(path.resolve(outputPath), `${JSON.stringify(plan,null,2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({status:'passed',steps:steps.length,output:path.resolve(outputPath)}));
