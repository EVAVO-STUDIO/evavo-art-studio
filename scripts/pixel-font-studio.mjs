#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';

import {
  FACE_ROLES,
  PRESETS,
  buildFamily,
  planFamily,
  validateFamily,
} from './pixel-font/builder.mjs';
import { CHARACTER_SETS } from './pixel-font/glyph-library.mjs';
import { writeJsonCreateOnly } from './pixel-font/common.mjs';

function parse(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument ${token}.`);
    const key = token.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

const usage = `EVAVO Pixel Font Studio

  catalog
  plan    --request <family-request.json> --output <output-root> [--plan-output <plan.json>]
  build   --request <family-request.json> --output <empty-output-root> [--plan <plan.json>]
  validate --family <pixel-font-family.json> [--output <validation.json>]
`;

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || ['help', '--help', '-h'].includes(command)) {
    process.stdout.write(usage);
    return;
  }
  const args = parse(rest);
  if (command === 'catalog') {
    process.stdout.write(`${JSON.stringify({
      schema: 'evavo.pixel-font-studio-catalog.v1',
      presets: Object.keys(PRESETS).sort(),
      characterSets: Object.fromEntries(Object.entries(CHARACTER_SETS).map(([id, values]) => [id, values.length])),
      roles: FACE_ROLES,
      outputs: ['AngelCode BMFont .fnt', 'RGBA PNG atlas', 'Godot FontVariation .tres', 'specimen PNG', 'self-hashed family/face/validation/receipt JSON'],
      externalFontBinaryRequired: false,
      authority: { providerExecution: false, gameRepositoryMutation: false, gitPush: false, publication: false },
    }, null, 2)}\n`);
    return;
  }
  if (command === 'plan') {
    if (!args.request || !args.output) throw new Error('--request and --output are required.');
    const plan = await planFamily({ requestPath: args.request, outputRoot: args.output });
    if (args['plan-output']) {
      const target = path.resolve(args['plan-output']);
      await writeJsonCreateOnly(target, plan, path.dirname(target));
    }
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  if (command === 'build') {
    if (!args.request || !args.output) throw new Error('--request and --output are required.');
    const result = await buildFamily({
      requestPath: args.request,
      outputRoot: args.output,
      ...(args.plan ? { planPath: args.plan } : {}),
    });
    process.stdout.write(`${JSON.stringify({
      status: result.validation.status,
      familyId: result.family.familyId,
      familySha256: result.family.familySha256,
      validationSha256: result.validation.validationSha256,
      receiptSha256: result.receipt.receiptSha256,
      familyPath: result.familyPath,
      validationPath: result.validationPath,
      receiptPath: result.receiptPath,
    })}\n`);
    process.exitCode = result.validation.status === 'passed' ? 0 : 3;
    return;
  }
  if (command === 'validate') {
    if (!args.family) throw new Error('--family is required.');
    const validation = await validateFamily({ familyPath: args.family });
    if (args.output) {
      const target = path.resolve(args.output);
      await writeJsonCreateOnly(target, validation, path.dirname(target));
    }
    process.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
    process.exitCode = validation.status === 'passed' ? 0 : 3;
    return;
  }
  throw new Error(`Unknown command ${command}.\n\n${usage}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
