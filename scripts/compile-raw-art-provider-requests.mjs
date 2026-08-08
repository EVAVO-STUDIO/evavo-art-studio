#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { compileProviderRequestBatch } from './raw-art-provider/compile.mjs';
import {
  readJsonRecord,
  writeCreateOnly,
} from './raw-art-provider/shared.mjs';
import { buildBindingsTemplate } from './raw-art-provider/template.mjs';

function parseArguments(argv) {
  const command = argv[0];
  if (!['template', 'compile'].includes(command)) {
    throw new Error('first argument must be template or compile');
  }
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--') || values.has(name)) {
      throw new Error('arguments must be unique --name value pairs');
    }
    values.set(name, value);
  }
  return { command, values };
}

function required(values, name) {
  const value = values.get(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

async function loadInputs(values, includeBindings) {
  const [queue, bridge, providerMap, direction, styleBank, bindings] = await Promise.all([
    readJsonRecord(required(values, '--queue'), 'queue'),
    readJsonRecord(required(values, '--bridge'), 'bridge'),
    readJsonRecord(required(values, '--provider-map'), 'provider map'),
    readJsonRecord(required(values, '--direction'), 'direction'),
    readJsonRecord(required(values, '--style-bank'), 'style bank'),
    includeBindings
      ? readJsonRecord(required(values, '--artifact-bindings'), 'artifact bindings')
      : null,
  ]);
  return {
    queue,
    bridge,
    providerMap,
    direction,
    styleBank,
    ...(bindings ? { bindings } : {}),
  };
}

export async function runRawArtProviderRequestCli(argv = process.argv.slice(2)) {
  const { command, values } = parseArguments(argv);
  const output = required(values, '--output');
  if (command === 'template') {
    const template = buildBindingsTemplate(
      await loadInputs(values, false),
      required(values, '--game-head'),
    );
    await writeCreateOnly(output, template);
    return {
      status: template.status,
      output: path.resolve(output),
      providerRequired: template.bindings.length,
      styleReferences: template.styleReferenceArtifacts.length,
      queueSha256: template.queueSha256,
    };
  }

  const maximumOrders = Number(values.get('--maximum-orders') ?? 25);
  if (!Number.isSafeInteger(maximumOrders) || maximumOrders < 1 || maximumOrders > 100) {
    throw new Error('--maximum-orders must be 1..100');
  }
  const batch = compileProviderRequestBatch(
    await loadInputs(values, true),
    maximumOrders,
  );
  await writeCreateOnly(output, batch);
  return {
    status: batch.status,
    output: path.resolve(output),
    runId: batch.runId,
    batchSha256: batch.batchSha256,
    counts: batch.counts,
  };
}

const directlyInvoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (directlyInvoked) {
  runRawArtProviderRequestCli()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(
        `${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`,
      );
      process.exitCode = 2;
    });
}

export { compileProviderRequestBatch } from './raw-art-provider/compile.mjs';
export { hashObject } from './raw-art-provider/shared.mjs';
export { buildBindingsTemplate } from './raw-art-provider/template.mjs';
