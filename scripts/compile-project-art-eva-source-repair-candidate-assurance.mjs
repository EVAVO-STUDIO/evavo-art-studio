#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  inspectEvaSourceRepairCandidateFile,
  inspectEvaSourceRepairMaskFile,
} from './project-art/eva-source-repair-candidate-assurance.mjs';

const COMMON = [
  '--frame-id',
  '--intake',
  '--source',
  '--mask',
  '--mask-path',
  '--mask-sha256',
  '--output',
];
const CANDIDATE = [
  '--candidate',
  '--candidate-path',
  '--candidate-sha256',
];

function argumentsFor(argv) {
  const [command, ...rest] = argv;
  if (!['mask', 'candidate'].includes(command) || rest.length % 2 !== 0) {
    throw new Error('Use mask or candidate followed by --name value pairs.');
  }
  const allowed = new Set([
    ...COMMON,
    ...(command === 'candidate' ? CANDIDATE : []),
    '--inspected-at',
  ]);
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index];
    const value = rest[index + 1];
    if (!allowed.has(name) || !value || value.startsWith('--') || values.has(name)) {
      throw new Error(`Invalid argument ${name ?? ''}.`);
    }
    values.set(name, value);
  }
  for (const required of [...COMMON, ...(command === 'candidate' ? CANDIDATE : [])]) {
    if (!values.has(required)) throw new Error(`Missing ${required}.`);
  }
  return { command, values };
}

export function runProjectArtEvaSourceRepairCandidateAssuranceCli(
  argv = process.argv.slice(2),
) {
  const { command, values } = argumentsFor(argv);
  const common = {
    frameId: values.get('--frame-id'),
    intakeFile: values.get('--intake'),
    sourceFile: values.get('--source'),
    maskFile: values.get('--mask'),
    maskPath: values.get('--mask-path'),
    expectedMaskSha256: values.get('--mask-sha256'),
    outputPath: values.get('--output'),
    ...(values.has('--inspected-at')
      ? { inspectedAt: values.get('--inspected-at') }
      : {}),
  };
  const result = command === 'mask'
    ? inspectEvaSourceRepairMaskFile(common)
    : inspectEvaSourceRepairCandidateFile({
        ...common,
        candidateFile: values.get('--candidate'),
        candidatePath: values.get('--candidate-path'),
        expectedCandidateSha256: values.get('--candidate-sha256'),
      });
  return Object.freeze({
    status: 'passed',
    phase: result.assurance.phase,
    frameId: result.assurance.frameId,
    assuranceSha256: result.assurance.assuranceSha256,
    providerDispatchMaskReady:
      result.assurance.gates.providerDispatchMaskReady ?? true,
    sourceSpaceAssurancePassed:
      result.assurance.gates.sourceSpaceAssurancePassed ?? false,
    candidateApproval: false,
    productionAlphaReady:
      result.assurance.gates.productionAlphaReady,
    runtimeActivationAllowed: false,
    output: result.outputPath,
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.stdout.write(
      `${JSON.stringify(runProjectArtEvaSourceRepairCandidateAssuranceCli())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'failed',
        code: error?.code ?? 'EVA_SOURCE_REPAIR_ASSURANCE_CLI_FAILED',
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}
