#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { compileProviderRequestBatch } from './raw-art-provider/compile.mjs';
import { finalizeBindingsTemplate } from './raw-art-provider/finalize.mjs';
import {
  readJsonRecord,
  writeCreateOnly,
} from './raw-art-provider/shared.mjs';
import { buildBindingsTemplate } from './raw-art-provider/template.mjs';

const COMMANDS = new Set(['template', 'finalize', 'compile']);

function parseArguments(argv) {
  const command = argv[0];
  if (!COMMANDS.has(command)) {
    throw new Error('first argument must be template, finalize or compile');
  }
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !name?.startsWith('--') ||
      !value ||
      value.startsWith('--') ||
      values.has(name)
    ) {
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

async function loadInputs(values, options = {}) {
  const [queue, campaign, bridge, providerMap, direction, styleBank, template, bindings] =
    await Promise.all([
      readJsonRecord(required(values, '--queue'), 'queue'),
      readJsonRecord(required(values, '--campaign'), 'campaign'),
      readJsonRecord(required(values, '--bridge'), 'bridge'),
      readJsonRecord(required(values, '--provider-map'), 'provider map'),
      readJsonRecord(required(values, '--direction'), 'direction'),
      readJsonRecord(required(values, '--style-bank'), 'style bank'),
      options.includeTemplate
        ? readJsonRecord(
            required(values, '--completed-template'),
            'completed template',
          )
        : null,
      options.includeBindings
        ? readJsonRecord(
            required(values, '--artifact-bindings'),
            'artifact bindings',
          )
        : null,
    ]);
  return {
    queue,
    campaign,
    bridge,
    providerMap,
    direction,
    styleBank,
    ...(template ? { template } : {}),
    ...(bindings ? { bindings } : {}),
  };
}

export async function runRawArtProviderRequestCli(argv = process.argv.slice(2)) {
  const { command, values } = parseArguments(argv);
  const output = required(values, '--output');
  if (command === 'template') {
    const template = buildBindingsTemplate(
      await loadInputs(values),
      required(values, '--game-head'),
    );
    await writeCreateOnly(output, template);
    return {
      status: template.status,
      output: path.resolve(output),
      providerRequiredTotal: template.counts.providerRequiredTotal,
      campaignNextBatchEligible: template.counts.campaignNextBatchEligible,
      blocked: template.counts.blocked,
      deferred: template.counts.deferred,
      styleReferences: template.styleReferenceArtifacts.length,
      queueSha256: template.queueSha256,
      campaignSha256: template.campaignSha256,
    };
  }

  if (command === 'finalize') {
    const records = await loadInputs(values, { includeTemplate: true });
    const bindings = finalizeBindingsTemplate(records, records.template);
    await writeCreateOnly(output, bindings);
    return {
      status: bindings.status,
      output: path.resolve(output),
      runId: bindings.runId,
      bindingsSha256: bindings.bindingsSha256,
      completeness: bindings.completeness,
      queueSha256: bindings.queueSha256,
      campaignSha256: bindings.campaignSha256,
    };
  }

  const maximumOrders = Number(values.get('--maximum-orders') ?? 25);
  if (
    !Number.isSafeInteger(maximumOrders) ||
    maximumOrders < 1 ||
    maximumOrders > 100
  ) {
    throw new Error('--maximum-orders must be 1..100');
  }
  const batch = compileProviderRequestBatch(
    await loadInputs(values, { includeBindings: true }),
    maximumOrders,
  );
  await writeCreateOnly(output, batch);
  return {
    status: batch.status,
    output: path.resolve(output),
    runId: batch.runId,
    batchSha256: batch.batchSha256,
    counts: batch.counts,
    queueSha256: batch.queueSha256,
    campaignSha256: batch.campaignSha256,
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
        `${JSON.stringify({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        })}\n`,
      );
      process.exitCode = 2;
    });
}

export { compileProviderRequestBatch } from './raw-art-provider/compile.mjs';
export { finalizeBindingsTemplate } from './raw-art-provider/finalize.mjs';
export { hashObject } from './raw-art-provider/shared.mjs';
export { buildBindingsTemplate } from './raw-art-provider/template.mjs';
