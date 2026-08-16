#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileEvaSourceRepairAlphaMasteringFiles,
} from './project-art/eva-source-repair-alpha-mastering.mjs';

const OPTIONS = Object.freeze([
  '--workspace-root',
  '--frame-id',
  '--candidate-assurance',
  '--provider-materialization',
  '--provider-finisher-request',
  '--candidate',
  '--candidate-path',
  '--alpha-matte',
  '--alpha-matte-path',
  '--alpha-matte-sha256',
  '--output',
  '--actor-id',
  '--authorization-evidence-sha256',
]);

function usage() {
  return [
    'Project Art EVA source-repair alpha mastering',
    '',
    'Usage:',
    '  node scripts/compile-project-art-eva-source-repair-alpha-mastering.mjs \\',
    '    --workspace-root <workspace> \\',
    '    --frame-id <frame-id> \\',
    '    --candidate-assurance <candidate-assurance.json> \\',
    '    --provider-materialization <provider-materialization.json> \\',
    '    --provider-finisher-request <provider-finisher-request.json> \\',
    '    --candidate <source-space-candidate.png> \\',
    '    --candidate-path <workspace-relative-candidate-path> \\',
    '    --alpha-matte <alpha-matte.png> \\',
    '    --alpha-matte-path <workspace-relative-matte-path> \\',
    '    --alpha-matte-sha256 <sha256> \\',
    '    --output <workspace-relative-path-ending-.alpha-mastered.png> \\',
    '    --actor-id <named-human-id> \\',
    '    --authorization-evidence-sha256 <sha256> \\',
    '    [--mastered-at <canonical-utc>]',
    '',
    'This command performs deterministic alpha mastering only. It does not execute a provider, approve creative work, mutate a source image, publish, deploy or activate the runtime.',
  ].join('\n');
}

function parseOptions(argv) {
  if (argv.length % 2 !== 0) throw new Error(usage());
  const allowed = new Set([...OPTIONS, '--mastered-at']);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !allowed.has(name) ||
      !value ||
      value.startsWith('--') ||
      values.has(name)
    ) {
      throw new Error(usage());
    }
    values.set(name, value);
  }
  for (const name of OPTIONS) {
    if (!values.has(name)) throw new Error(`Missing ${name}.\n\n${usage()}`);
  }
  return values;
}

export function runProjectArtEvaSourceRepairAlphaMasteringCli(
  argv = process.argv.slice(2),
) {
  const values = parseOptions(argv);
  const masteredAt = values.get('--mastered-at') ?? new Date().toISOString();
  const frameId = values.get('--frame-id');
  const result = compileEvaSourceRepairAlphaMasteringFiles({
    workspaceRoot: values.get('--workspace-root'),
    frameId,
    candidateAssuranceFile: values.get('--candidate-assurance'),
    providerMaterializationReceiptFile:
      values.get('--provider-materialization'),
    providerFinisherRequestFile:
      values.get('--provider-finisher-request'),
    sourceSpaceCandidateFile: values.get('--candidate'),
    sourceSpaceCandidatePath: values.get('--candidate-path'),
    alphaMatteFile: values.get('--alpha-matte'),
    alphaMattePath: values.get('--alpha-matte-path'),
    expectedAlphaMatteSha256: values.get('--alpha-matte-sha256'),
    outputPath: values.get('--output'),
    authorization: {
      action: 'apply-production-alpha-once',
      actorClass: 'human',
      actorId: values.get('--actor-id'),
      occurredAt: masteredAt,
      evidenceSha256: values.get('--authorization-evidence-sha256'),
    },
    masteredAt,
  });
  return Object.freeze({
    status: result.status,
    phase: result.report.phase,
    frameId: result.report.frameId,
    alphaMasteringSha256: result.report.alphaMasteringSha256,
    productionAlphaReady: result.report.gates.productionAlphaReady,
    frameFinisherRequired: result.report.gates.frameFinisherRequired,
    candidateApproval: false,
    sequenceReleaseAllowed: false,
    runtimeActivationAllowed: false,
    outputFiles: result.outputFiles,
  });
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.stdout.write(
      `${JSON.stringify(runProjectArtEvaSourceRepairAlphaMasteringCli())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'failed',
        code: error?.code ?? 'EVA_SOURCE_REPAIR_ALPHA_CLI_FAILED',
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}
