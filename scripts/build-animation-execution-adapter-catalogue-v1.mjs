#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  sealAnimationExecutionAdapterCatalogue,
} from "../tools/animation_execution_supervisor_v1.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function parseArguments(argv) {
  const command = argv[0];
  if (!['write', 'check', 'print'].includes(command)) {
    fail(
      'ANIMATION_EXECUTION_CATALOGUE_USAGE',
      'node scripts/build-animation-execution-adapter-catalogue-v1.mjs <write|check|print> [--art-root path] [--cel-root path] [--output path]',
    );
  }
  const result = { command };
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!value || !['--art-root', '--cel-root', '--output'].includes(name)) {
      fail('ANIMATION_EXECUTION_CATALOGUE_ARGUMENT_INVALID', String(name));
    }
    result[{ '--art-root': 'artRoot', '--cel-root': 'celRoot', '--output': 'output' }[name]] = value;
  }
  return result;
}

async function defaultRoots() {
  const ownRoot = await realpath(resolve(HERE, '..'));
  const name = basename(ownRoot).toLowerCase();
  if (name === 'evavo-art-studio') {
    return {
      artRoot: ownRoot,
      celRoot: resolve(ownRoot, '..', 'cel-animation-studio'),
      output: resolve(ownRoot, 'config', 'animation-execution-adapter-catalogue-v1.json'),
    };
  }
  if (name === 'cel-animation-studio') {
    return {
      artRoot: resolve(ownRoot, '..', 'evavo-art-studio'),
      celRoot: ownRoot,
      output: resolve(ownRoot, 'config', 'animation-execution-adapter-catalogue-v1.json'),
    };
  }
  return {
    artRoot: resolve(ownRoot, '..', 'art-studio'),
    celRoot: resolve(ownRoot, '..', 'cel-animation-studio'),
    output: resolve(ownRoot, 'config', 'animation-execution-adapter-catalogue-v1.json'),
  };
}

async function root(value, fallback, label) {
  const candidate = value ?? fallback;
  if (typeof candidate !== 'string') fail(label);
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(process.cwd(), candidate);
  try {
    return await realpath(absolute);
  } catch {
    fail(label, absolute);
  }
}

async function sha256(path) {
  return `sha256:${createHash('sha256').update(await readFile(path)).digest('hex')}`;
}

export async function buildAnimationExecutionAdapterCatalogue(options = {}) {
  const defaults = await defaultRoots();
  const artRoot = await root(
    options.artRoot,
    defaults.artRoot,
    'ANIMATION_EXECUTION_CATALOGUE_ART_ROOT_INVALID',
  );
  const celRoot = await root(
    options.celRoot,
    defaults.celRoot,
    'ANIMATION_EXECUTION_CATALOGUE_CEL_ROOT_INVALID',
  );
  const paths = {
    provider: resolve(
      artRoot,
      'scripts/animation-execution-adapters/art-provider-bridge-v1.mjs',
    ),
    drawingInspector: resolve(
      artRoot,
      'scripts/animation-execution-adapters/art-drawing-inspection-bridge-v1.mjs',
    ),
    sequenceReviewer: resolve(
      celRoot,
      'scripts/animation-execution-adapters/cel-sequence-review-bridge-v1.mjs',
    ),
  };
  const [providerSha, drawingSha, sequenceSha] = await Promise.all([
    sha256(paths.provider),
    sha256(paths.drawingInspector),
    sha256(paths.sequenceReviewer),
  ]);
  return sealAnimationExecutionAdapterCatalogue({
    catalogueId: 'evavo.animation.local-production.v1',
    revision: 1,
    adapters: [
      {
        id: 'evavo.art.local-frame-provider.v1',
        phase: 'frame-provider',
        ownerRole: 'art-studio',
        kind: 'command',
        entrypoint:
          'scripts/animation-execution-adapters/art-provider-bridge-v1.mjs',
        workingDirectory: '.',
        implementationSha256: providerSha,
        timeoutMs: 900_000,
        maximumOutputBytes: 1_048_576,
        networkPolicy: 'loopback-only',
        environmentVariables: [
          'EVAVO_ANIMATION_ALLOWED_PROVIDER_ADAPTERS',
          'EVAVO_ART_ARTIFACT_ROOT',
          'EVAVO_ART_COMFYUI_ALLOW_REMOTE',
          'EVAVO_ART_COMFYUI_BASE_URL',
          'EVAVO_ART_COMFYUI_CATALOG',
          'EVAVO_ART_COMFYUI_CATALOG_ROOT',
          'EVAVO_ART_COMFYUI_DEDICATED_INSTANCE',
          'EVAVO_ART_COMFYUI_EXECUTION_TIMEOUT_MS',
          'EVAVO_ART_COMFYUI_MAX_JSON_BYTES',
          'EVAVO_ART_COMFYUI_MAX_OUTPUT_BYTES',
          'EVAVO_ART_COMFYUI_MAX_UPLOAD_BYTES',
          'EVAVO_ART_COMFYUI_POLL_INTERVAL_MS',
          'EVAVO_ART_PROVIDER_MAX_RESPONSE_BYTES',
        ],
        capabilities: [
          'candidate-png-output',
          'exact-work-order-binding',
          'local-comfyui-routing',
          'native-alpha-validation',
          'provider-evidence-artifact',
        ],
        candidateOnly: true,
        enabled: true,
        priority: 100,
        selector: {},
      },
      {
        id: 'evavo.art.drawing-evidence-consumer.v1',
        phase: 'drawing-inspector',
        ownerRole: 'art-studio',
        kind: 'module',
        entrypoint:
          'scripts/animation-execution-adapters/art-drawing-inspection-bridge-v1.mjs',
        workingDirectory: '.',
        implementationSha256: drawingSha,
        exportName: 'consumeArtDrawingInspectionEvidence',
        timeoutMs: 30_000,
        maximumOutputBytes: 4_194_304,
        networkPolicy: 'disabled',
        environmentVariables: [],
        capabilities: [
          'digest-sealed-drawing-evidence',
          'exact-candidate-lineage',
          'no-fabricated-visual-scores',
        ],
        candidateOnly: true,
        enabled: true,
        priority: 100,
        selector: {},
      },
      {
        id: 'evavo.cel.independent-sequence-evidence-consumer.v1',
        phase: 'sequence-reviewer',
        ownerRole: 'cel-animation-studio',
        kind: 'module',
        entrypoint:
          'scripts/animation-execution-adapters/cel-sequence-review-bridge-v1.mjs',
        workingDirectory: '.',
        implementationSha256: sequenceSha,
        exportName: 'consumeCelIndependentSequenceEvidence',
        timeoutMs: 30_000,
        maximumOutputBytes: 16_777_216,
        networkPolicy: 'disabled',
        environmentVariables: [],
        capabilities: [
          'digest-sealed-sequence-evidence',
          'frame-by-frame-review',
          'independent-cel-review',
          'normal-speed-review',
          'targeted-repair-identification',
        ],
        candidateOnly: true,
        enabled: true,
        priority: 100,
        selector: {},
      },
    ],
  });
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const defaults = await defaultRoots();
  const catalogue = await buildAnimationExecutionAdapterCatalogue(args);
  const output = resolve(process.cwd(), args.output ?? defaults.output);
  const body = `${JSON.stringify(catalogue, null, 2)}\n`;
  if (args.command === 'print') {
    process.stdout.write(body);
    return;
  }
  if (args.command === 'write') {
    await writeFile(output, body, { encoding: 'utf8' });
    process.stdout.write(
      `${JSON.stringify({ status: 'written', output, catalogueDigest: catalogue.catalogueDigest })}\n`,
    );
    return;
  }
  const current = await readFile(output, 'utf8');
  if (current !== body) {
    fail('ANIMATION_EXECUTION_ADAPTER_CATALOGUE_DRIFT', output);
  }
  process.stdout.write(
    `${JSON.stringify({ status: 'verified', output, catalogueDigest: catalogue.catalogueDigest })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exitCode = 1;
});
