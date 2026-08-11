#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const artStudioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const operationRegistryPath = path.join(artStudioRoot, 'config', 'project-art-operations.v1.json');
const operationRegistry = JSON.parse(readFileSync(operationRegistryPath, 'utf8'));

function booleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`${name} must be true or false.`);
}

function configuredRoots() {
  const configured = process.env.EVAVO_ART_WORKSPACE_ROOTS;
  const lexicalRoots = configured
    ? configured
        .split(process.platform === 'win32' ? ';' : ':')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => path.resolve(entry))
    : [];
  const values = [...new Set([artStudioRoot, ...lexicalRoots])];
  if (values.length < 1) throw new Error('EVAVO_ART_WORKSPACE_ROOTS is empty.');
  return values.map((lexical) => {
    let metadata;
    try {
      metadata = lstatSync(lexical);
    } catch (error) {
      throw new Error(`Allowed workspace root does not exist: ${lexical}. ${error.message}`);
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(`Allowed workspace root must be a non-symbolic directory: ${lexical}.`);
    }
    return Object.freeze({ lexical, real: realpathSync(lexical) });
  });
}

const allowedRoots = configuredRoots();
const writeEnabled = booleanEnv('EVAVO_ART_WORKSPACE_MCP_ALLOW_WRITE', false);
const python = process.env.EVAVO_ART_WORKSPACE_PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
const pythonBaseName = path.basename(python).toLowerCase();
const pythonPrefix = process.platform === 'win32' && ['py', 'py.exe'].includes(pythonBaseName) ? ['-3'] : [];

function integerEnv(name, fallback, minimum, maximum) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

const commandTimeoutMs = integerEnv('EVAVO_ART_WORKSPACE_MCP_TIMEOUT_MS', 10 * 60 * 1000, 1_000, 30 * 60 * 1000);
const commandMaximumBufferBytes = 16 * 1024 * 1024;
const maximumDiagnosticCharacters = 8 * 1024;

const sensitiveEnvironmentNames = new Set([
  'BASH_ENV',
  'CLOUDINARY_URL',
  'DATABASE_URL',
  'DYLD_INSERT_LIBRARIES',
  'ENV',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'LD_PRELOAD',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NPM_TOKEN',
  'PNPM_HOME_TOKEN',
  'PYTHONHOME',
  'PYTHONINSPECT',
  'PYTHONPATH',
  'PYTHONSTARTUP',
]);
const sensitiveEnvironmentPattern = /(?:^|_)(?:ACCESS_KEY|API_KEY|AUTHORIZATION|CLIENT_SECRET|CONNECTION_STRING|CREDENTIALS?|PASSWORD|PRIVATE_KEY|SECRET|TOKEN)(?:_|$)/iu;

function subprocessEnvironment() {
  const output = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (sensitiveEnvironmentNames.has(name.toUpperCase()) || sensitiveEnvironmentPattern.test(name)) continue;
    output[name] = value;
  }
  return output;
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function confined(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error(`${label} is required and must contain no NUL.`);
  const candidate = path.resolve(value);
  const root = allowedRoots.find((entry) => inside(entry.lexical, candidate));
  if (!root) throw new Error(`${label} is outside EVAVO_ART_WORKSPACE_ROOTS.`);

  const relative = path.relative(root.lexical, candidate);
  const parts = relative === '' ? [] : relative.split(path.sep);
  let current = root.lexical;
  let existing = root.lexical;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    let metadata;
    try {
      metadata = lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      throw new Error(`${label} could not be inspected safely: ${error.message}`);
    }
    if (metadata.isSymbolicLink()) throw new Error(`${label} contains a symbolic-link component.`);
    if (index < parts.length - 1 && !metadata.isDirectory()) {
      throw new Error(`${label} contains a non-directory path component.`);
    }
    existing = current;
  }

  const existingReal = realpathSync(existing);
  if (!inside(root.real, existingReal)) throw new Error(`${label} escaped EVAVO_ART_WORKSPACE_ROOTS.`);
  return candidate;
}

function requireWrite() {
  if (!writeEnabled) {
    throw new Error(
      'Workspace writes are disabled. Set EVAVO_ART_WORKSPACE_MCP_ALLOW_WRITE=true on the trusted local MCP deployment.',
    );
  }
}

function safeBindingId(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value)) {
    throw new Error(`${label} must use lowercase letters, numbers, dot, underscore or hyphen.`);
  }
  return value;
}

function safeProjectId(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(value)) {
    throw new Error(`${label} must use letters, numbers, dot, underscore, colon or hyphen.`);
  }
  return value;
}

function optionalBoundedString(value, label, maximum = 1024) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || value.includes('\0')) {
    throw new Error(`${label} must be a non-empty bounded string containing no NUL.`);
  }
  return value;
}

function optionalArray(value, label, maximum) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`${label} must be an array containing at most ${maximum} entries.`);
  }
  return value;
}

function positiveInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${label} must be an integer between 1 and ${maximum}.`);
  }
  return value;
}

const objectSchema = (properties, required = []) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});
const pathField = { type: 'string', minLength: 1, maxLength: 32768 };
const timestampField = { type: 'string', minLength: 20, maxLength: 64 };
const integerField = { type: 'integer', minimum: 1 };
const artRootField = objectSchema(
  {
    id: { type: 'string', pattern: '^[a-z0-9][a-z0-9._-]{0,127}$' },
    path: pathField,
  },
  ['id', 'path'],
);

const tools = Object.freeze([
  {
    name: 'evavo_art_workspace_capabilities',
    description:
      'Describe the path-only project-art workbench, deterministic image operations, sprite tasks and reference-derived planning. Performs no project read or write.',
    inputSchema: objectSchema({}),
  },
  {
    name: 'evavo_art_compile_project_intelligence',
    description:
      'Inspect an exact project plus optional external art roots and create a self-hashed project-art intelligence document. Requires the explicit workspace write gate.',
    inputSchema: objectSchema(
      {
        projectRoot: pathField,
        artRoots: { type: 'array', maxItems: 128, items: artRootField },
        configPath: pathField,
        outputPath: pathField,
        projectId: { type: 'string', minLength: 1, maxLength: 128 },
        generatedAt: timestampField,
        maximumFiles: integerField,
        maximumTextBytes: integerField,
        maximumHashBytes: integerField,
      },
      ['projectRoot', 'outputPath'],
    ),
  },
  {
    name: 'evavo_art_compile_sandbox',
    description:
      'Bind exact source bytes and compile deterministic image, sprite-sheet or animation-review tasks into a self-hashed sandbox plan. Requires the explicit workspace write gate.',
    inputSchema: objectSchema(
      {
        workspaceRoot: pathField,
        requestPath: pathField,
        planPath: pathField,
        registryPath: pathField,
        compiledAt: timestampField,
      },
      ['workspaceRoot', 'requestPath', 'planPath'],
    ),
  },
  {
    name: 'evavo_art_run_sandbox',
    description:
      'Execute an exact create-only sandbox plan atomically with Pillow. Sources are revalidated and never overwritten. Requires the explicit workspace write gate.',
    inputSchema: objectSchema(
      {
        workspaceRoot: pathField,
        planPath: pathField,
        outputRoot: pathField,
      },
      ['workspaceRoot', 'planPath', 'outputRoot'],
    ),
  },
  {
    name: 'evavo_art_compile_reference_plan',
    description:
      'Compile exact local or immutable references into a provider-neutral plan for matching assets, matching frames, in-betweens, variations, recreations or sheet extensions. No provider is called.',
    inputSchema: objectSchema(
      {
        workspaceRoot: pathField,
        requestPath: pathField,
        planPath: pathField,
        bindingsPath: pathField,
        compiledAt: timestampField,
      },
      ['workspaceRoot', 'requestPath', 'planPath'],
    ),
  },
  {
    name: 'evavo_art_stage_reference_artifacts',
    description:
      'Stage only the exact local references named by a validated reference plan into the immutable Art Studio artifact store and write create-only bindings. No provider is called.',
    inputSchema: objectSchema(
      {
        workspaceRoot: pathField,
        planPath: pathField,
        artifactRoot: pathField,
        bindingsPath: pathField,
      },
      ['workspaceRoot', 'planPath', 'artifactRoot', 'bindingsPath'],
    ),
  },
  {
    name: 'evavo_art_compile_intake',
    description: 'Compile exact mounted/local image paths into a self-hashed Art Studio intake plan. Image bytes do not enter MCP.',
    inputSchema: objectSchema(
      { requestPath: pathField, planPath: pathField, compiledAt: timestampField },
      ['requestPath', 'planPath'],
    ),
  },
  {
    name: 'evavo_art_run_intake',
    description: 'Create an atomic temporary Art Studio workspace containing immutable originals, editable working copies and a storage handoff.',
    inputSchema: objectSchema(
      { planPath: pathField, outputRoot: pathField },
      ['planPath', 'outputRoot'],
    ),
  },
  {
    name: 'evavo_art_compile_atlas',
    description: 'Compile exact local sprite-frame paths into a deterministic variable-size sprite-atlas plan.',
    inputSchema: objectSchema(
      { requestPath: pathField, planPath: pathField, compiledAt: timestampField },
      ['requestPath', 'planPath'],
    ),
  },
  {
    name: 'evavo_art_run_atlas',
    description: 'Build a create-only PNG sprite atlas with EVAVO, TexturePacker, Phaser and Godot metadata.',
    inputSchema: objectSchema(
      { planPath: pathField, outputRoot: pathField },
      ['planPath', 'outputRoot'],
    ),
  },
  {
    name: 'evavo_art_compile_workspace_create',
    description:
      'Compile a create-only persistent Artist Workspace with immutable source, working, version, mask, review, master, export, manifest and journal areas.',
    inputSchema: objectSchema(
      {
        parentRoot: pathField,
        requestPath: pathField,
        planPath: pathField,
        compiledAt: timestampField,
      },
      ['parentRoot', 'requestPath', 'planPath'],
    ),
  },
  {
    name: 'evavo_art_run_workspace_create',
    description:
      'Atomically create an exact persistent Artist Workspace from a validated plan. No image bytes travel through MCP.',
    inputSchema: objectSchema({ planPath: pathField }, ['planPath']),
  },
  {
    name: 'evavo_art_compile_workspace_snapshot',
    description:
      'Compile an append-only exact working-file snapshot into a persistent Artist Workspace version plan.',
    inputSchema: objectSchema(
      {
        workspaceRoot: pathField,
        requestPath: pathField,
        planPath: pathField,
        compiledAt: timestampField,
      },
      ['workspaceRoot', 'requestPath', 'planPath'],
    ),
  },
  {
    name: 'evavo_art_run_workspace_snapshot',
    description:
      'Publish an exact append-only workspace version after revalidating source bytes before, during and after copying.',
    inputSchema: objectSchema(
      { workspaceRoot: pathField, planPath: pathField },
      ['workspaceRoot', 'planPath'],
    ),
  },
  {
    name: 'evavo_art_prepare_storage_handoff',
    description:
      'Prepare a self-hashed EVAVO Storage ingest request for exact workspace files. This does not authorise or perform the Storage write.',
    inputSchema: objectSchema(
      {
        workspaceRoot: pathField,
        requestPath: pathField,
        outputPath: pathField,
        compiledAt: timestampField,
      },
      ['workspaceRoot', 'requestPath', 'outputPath'],
    ),
  },
]);
const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

function summaryEnvelope(summary, effects = {}) {
  return {
    summary,
    effects: {
      workspaceWrite: effects.workspaceWrite === true,
      artifactWrite: effects.artifactWrite === true,
      storageWrite: false,
      sourceMutation: false,
      sourceDeletion: false,
      providerExecution: false,
      runtimeSubmission: false,
      candidateApproval: false,
      candidatePromotion: false,
      repositoryMutation: false,
      publication: false,
      deployment: false,
      forcePush: false,
    },
    bytesFlowThroughMcp: false,
    credentialsForwardedToSubprocess: false,
    rawCommandOutputReturned: false,
    repositoryMutation: false,
    storageWrite: false,
    providerExecution: false,
  };
}

function boundedDiagnostic(value) {
  const text = String(value || 'Workspace command failed.').trim();
  if (text.length <= maximumDiagnosticCharacters) return text;
  return `${text.slice(0, maximumDiagnosticCharacters)}\n[diagnostic truncated]`;
}

function run(executable, args, effects = {}) {
  const result = spawnSync(executable, args, {
    cwd: artStudioRoot,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: commandTimeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: commandMaximumBufferBytes,
    env: subprocessEnvironment(),
  });
  if (result.error) throw new Error(boundedDiagnostic(result.error.message));
  if (result.status !== 0) {
    throw new Error(boundedDiagnostic(result.stderr || result.stdout));
  }
  const lines = result.stdout.trim().split(/\r?\n/u).filter(Boolean);
  let summary;
  try {
    summary = JSON.parse(lines.at(-1) || 'null');
  } catch (error) {
    throw new Error(`Workspace command did not end with a JSON summary: ${boundedDiagnostic(error.message)}`);
  }
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    throw new Error('Workspace command JSON summary must be an object.');
  }
  return {
    ...summaryEnvelope(summary, effects),
    command: {
      executable: path.basename(executable),
      argumentCount: args.length,
      shell: false,
      timeoutMs: commandTimeoutMs,
      credentialsForwarded: false,
    },
  };
}

function capabilities() {
  return summaryEnvelope({
    schema: 'evavo.project-art-workspace-capabilities.v1',
    version: '2026-08-11.2',
    writeEnabled,
    allowedRootCount: allowedRoots.length,
    commandTimeoutMs,
    operations: operationRegistry.operations.map((entry) => entry.id),
    taskKinds: operationRegistry.taskKinds,
    referenceOperations: [
      'match-family',
      'matching-frame',
      'in-between-frame',
      'controlled-variation',
      'style-locked-recreate',
      'sheet-extension',
    ],
    workflow: [
      'persistent-artist-workspace',
      'project-intelligence',
      'chat-or-local-intake',
      'deterministic-sandbox',
      'professional-mastering',
      'keyframed-motion-sequence',
      'sprite-sheet-and-atlas',
      'reference-derived-planning',
      'offline-visual-review',
      'evavo-storage-handoff',
      'governed-repository-writer',
    ],
    relatedServers: {
      visualReview: 'tools/project_art_review_mcp.mjs',
      repositoryWriter: 'apps/mcp workspace-writer surface',
    },
  });
}

function validateToolInput(definition, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Tool arguments must be an object.');
  }
  const allowed = new Set(Object.keys(definition.inputSchema.properties || {}));
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error(`${definition.name} received unknown argument ${key}.`);
  }
  for (const key of definition.inputSchema.required || []) {
    if (!(key in input)) throw new Error(`${definition.name} requires argument ${key}.`);
  }
}

function callTool(name, input) {
  const definition = toolsByName.get(name);
  if (!definition) throw new Error(`Unknown tool: ${name}`);
  validateToolInput(definition, input);
  if (name === 'evavo_art_workspace_capabilities') return capabilities();

  requireWrite();

  if (name === 'evavo_art_compile_project_intelligence') {
    const args = [
      path.join(artStudioRoot, 'scripts', 'compile-project-art-intelligence.mjs'),
      '--project-root',
      confined(input.projectRoot, 'projectRoot'),
      '--output',
      confined(input.outputPath, 'outputPath'),
    ];
    if (input.configPath) args.push('--config', confined(input.configPath, 'configPath'));
    if (input.projectId !== undefined) args.push('--project-id', safeProjectId(input.projectId, 'projectId'));
    if (input.generatedAt !== undefined) {
      args.push('--generated-at', optionalBoundedString(input.generatedAt, 'generatedAt', 64));
    }
    for (const [index, root] of optionalArray(input.artRoots, 'artRoots', 128).entries()) {
      if (!root || typeof root !== 'object' || Array.isArray(root)) {
        throw new Error(`artRoots[${index}] must be an object.`);
      }
      const id = safeBindingId(root.id, `artRoots[${index}].id`);
      args.push('--art-root', `${id}=${confined(root.path, `artRoots[${index}].path`)}`);
    }
    for (const [inputName, argumentName] of [
      ['maximumFiles', '--maximum-files'],
      ['maximumTextBytes', '--maximum-text-bytes'],
      ['maximumHashBytes', '--maximum-hash-bytes'],
    ]) {
      if (input[inputName] !== undefined) {
        const maximum = inputName === 'maximumFiles'
          ? 1_000_000
          : inputName === 'maximumTextBytes'
            ? 128 * 1024 * 1024
            : Number.MAX_SAFE_INTEGER;
        args.push(argumentName, String(positiveInteger(input[inputName], inputName, maximum)));
      }
    }
    return run(process.execPath, args, { workspaceWrite: true });
  }

  if (name === 'evavo_art_compile_sandbox') {
    const args = [
      path.join(artStudioRoot, 'scripts', 'compile-project-art-sandbox.mjs'),
      '--workspace-root',
      confined(input.workspaceRoot, 'workspaceRoot'),
      '--request',
      confined(input.requestPath, 'requestPath'),
      '--output',
      confined(input.planPath, 'planPath'),
    ];
    if (input.registryPath) args.push('--registry', confined(input.registryPath, 'registryPath'));
    if (input.compiledAt !== undefined) {
      args.push('--compiled-at', optionalBoundedString(input.compiledAt, 'compiledAt', 64));
    }
    return run(process.execPath, args, { workspaceWrite: true });
  }

  if (name === 'evavo_art_run_sandbox') {
    return run(
      python,
      [
        ...pythonPrefix,
        path.join(artStudioRoot, 'tools', 'run_project_art_sandbox.py'),
        '--workspace-root',
        confined(input.workspaceRoot, 'workspaceRoot'),
        '--plan',
        confined(input.planPath, 'planPath'),
        '--output-root',
        confined(input.outputRoot, 'outputRoot'),
      ],
      { workspaceWrite: true },
    );
  }

  if (name === 'evavo_art_compile_reference_plan') {
    const args = [
      path.join(artStudioRoot, 'scripts', 'compile-reference-derived-image-plan.mjs'),
      '--workspace-root',
      confined(input.workspaceRoot, 'workspaceRoot'),
      '--request',
      confined(input.requestPath, 'requestPath'),
      '--output',
      confined(input.planPath, 'planPath'),
    ];
    if (input.bindingsPath) args.push('--bindings', confined(input.bindingsPath, 'bindingsPath'));
    if (input.compiledAt !== undefined) {
      args.push('--compiled-at', optionalBoundedString(input.compiledAt, 'compiledAt', 64));
    }
    return run(process.execPath, args, { workspaceWrite: true });
  }

  if (name === 'evavo_art_stage_reference_artifacts') {
    return run(
      process.execPath,
      [
        path.join(artStudioRoot, 'scripts', 'stage-reference-derived-artifacts.mjs'),
        '--workspace-root',
        confined(input.workspaceRoot, 'workspaceRoot'),
        '--plan',
        confined(input.planPath, 'planPath'),
        '--artifact-root',
        confined(input.artifactRoot, 'artifactRoot'),
        '--output',
        confined(input.bindingsPath, 'bindingsPath'),
      ],
      { workspaceWrite: true, artifactWrite: true },
    );
  }

  if (name === 'evavo_art_compile_intake') {
    const args = [
      path.join(artStudioRoot, 'scripts', 'compile-project-art-intake.mjs'),
      '--request',
      confined(input.requestPath, 'requestPath'),
      '--output',
      confined(input.planPath, 'planPath'),
    ];
    if (input.compiledAt !== undefined) {
      args.push('--compiled-at', optionalBoundedString(input.compiledAt, 'compiledAt', 64));
    }
    return run(process.execPath, args, { workspaceWrite: true });
  }

  if (name === 'evavo_art_run_intake') {
    return run(
      python,
      [
        ...pythonPrefix,
        path.join(artStudioRoot, 'tools', 'run_project_art_intake.py'),
        '--plan',
        confined(input.planPath, 'planPath'),
        '--output-root',
        confined(input.outputRoot, 'outputRoot'),
      ],
      { workspaceWrite: true },
    );
  }

  if (name === 'evavo_art_compile_atlas') {
    const args = [
      path.join(artStudioRoot, 'scripts', 'compile-project-art-atlas.mjs'),
      '--request',
      confined(input.requestPath, 'requestPath'),
      '--output',
      confined(input.planPath, 'planPath'),
    ];
    if (input.compiledAt !== undefined) {
      args.push('--compiled-at', optionalBoundedString(input.compiledAt, 'compiledAt', 64));
    }
    return run(process.execPath, args, { workspaceWrite: true });
  }

  if (name === 'evavo_art_run_atlas') {
    return run(
      python,
      [
        ...pythonPrefix,
        path.join(artStudioRoot, 'tools', 'build_project_art_atlas.py'),
        '--plan',
        confined(input.planPath, 'planPath'),
        '--output-root',
        confined(input.outputRoot, 'outputRoot'),
      ],
      { workspaceWrite: true },
    );
  }

  const persistentEntrypoint = path.join(artStudioRoot, 'scripts', 'persistent-artist-workspace.mjs');
  if (name === 'evavo_art_compile_workspace_create') {
    const args = [
      persistentEntrypoint,
      'compile-create',
      '--parent-root',
      confined(input.parentRoot, 'parentRoot'),
      '--request',
      confined(input.requestPath, 'requestPath'),
      '--output',
      confined(input.planPath, 'planPath'),
    ];
    if (input.compiledAt !== undefined) args.push('--compiled-at', optionalBoundedString(input.compiledAt, 'compiledAt', 64));
    return run(process.execPath, args, { workspaceWrite: true });
  }

  if (name === 'evavo_art_run_workspace_create') {
    return run(
      process.execPath,
      [persistentEntrypoint, 'run-create', '--plan', confined(input.planPath, 'planPath')],
      { workspaceWrite: true },
    );
  }

  if (name === 'evavo_art_compile_workspace_snapshot') {
    const args = [
      persistentEntrypoint,
      'compile-snapshot',
      '--workspace-root',
      confined(input.workspaceRoot, 'workspaceRoot'),
      '--request',
      confined(input.requestPath, 'requestPath'),
      '--output',
      confined(input.planPath, 'planPath'),
    ];
    if (input.compiledAt !== undefined) args.push('--compiled-at', optionalBoundedString(input.compiledAt, 'compiledAt', 64));
    return run(process.execPath, args, { workspaceWrite: true });
  }

  if (name === 'evavo_art_run_workspace_snapshot') {
    return run(
      process.execPath,
      [
        persistentEntrypoint,
        'run-snapshot',
        '--workspace-root',
        confined(input.workspaceRoot, 'workspaceRoot'),
        '--plan',
        confined(input.planPath, 'planPath'),
      ],
      { workspaceWrite: true },
    );
  }

  if (name === 'evavo_art_prepare_storage_handoff') {
    const args = [
      persistentEntrypoint,
      'storage-handoff',
      '--workspace-root',
      confined(input.workspaceRoot, 'workspaceRoot'),
      '--request',
      confined(input.requestPath, 'requestPath'),
      '--output',
      confined(input.outputPath, 'outputPath'),
    ];
    if (input.compiledAt !== undefined) args.push('--compiled-at', optionalBoundedString(input.compiledAt, 'compiledAt', 64));
    return run(process.execPath, args, { workspaceWrite: true });
  }
}

function response(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function errorResponse(id, error) {
  process.stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: {
      code: -32000,
      message: error instanceof Error ? error.message : String(error),
    },
  })}\n`);
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  let request;
  try {
    request = JSON.parse(line);
    if (request.method === 'initialize') {
      response(request.id, {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'evavo-project-art-workspace', version: '2.0.0' },
      });
    } else if (request.method === 'notifications/initialized') {
      // Notification: no response.
    } else if (request.method === 'tools/list') {
      response(request.id, { tools });
    } else if (request.method === 'tools/call') {
      const name = request.params?.name;
      const output = callTool(name, request.params?.arguments ?? {});
      response(request.id, {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
        isError: false,
      });
    } else {
      errorResponse(request.id, new Error(`Unsupported method: ${request.method}`));
    }
  } catch (error) {
    if (request?.id !== undefined) errorResponse(request.id, error);
  }
}
