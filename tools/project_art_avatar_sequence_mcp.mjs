#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const artStudioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiler = path.join(
  artStudioRoot,
  'scripts',
  'compile-project-art-avatar-sequence.mjs',
);
const maximumDiagnosticCharacters = 8 * 1024;
const maximumOutputBytes = 16 * 1024 * 1024;

function booleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`${name} must be true or false.`);
}

function integerEnv(name, fallback, minimum, maximum) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function configuredRoots() {
  const configured = process.env.EVAVO_ART_AVATAR_SEQUENCE_ROOTS;
  const separator = process.platform === 'win32' ? ';' : ':';
  const lexicalRoots = configured
    ? configured
        .split(separator)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => path.resolve(entry))
    : [];
  const roots = [...new Set([artStudioRoot, ...lexicalRoots])];
  return roots.map((lexical) => {
    let metadata;
    try {
      metadata = lstatSync(lexical);
    } catch (error) {
      throw new Error(`Allowed avatar-sequence root does not exist: ${lexical}. ${error.message}`);
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(
        `Allowed avatar-sequence root must be a non-symbolic directory: ${lexical}.`,
      );
    }
    return Object.freeze({ lexical, real: realpathSync(lexical) });
  });
}

const allowedRoots = configuredRoots();
const writeEnabled = booleanEnv(
  'EVAVO_ART_AVATAR_SEQUENCE_MCP_ALLOW_WRITE',
  false,
);
const commandTimeoutMs = integerEnv(
  'EVAVO_ART_AVATAR_SEQUENCE_MCP_TIMEOUT_MS',
  10 * 60 * 1000,
  1_000,
  30 * 60 * 1000,
);

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
  'PYTHONHOME',
 'PYTHONINSPECT',
  'PYTHONPATH',
  'PYTHONSTARTUP',
]);
const sensitiveEnvironmentPattern =
  /(?:^|_)(?:ACCESS_KEY|API_KEY|AUTHORIZATION|CLIENT_SECRET|CONNECTION_STRING|CREDENTIALS?|PASSWORD|PRIVATE_KEY|SECRET|TOKEN)(?:_|$)/iu;

function subprocessEnvironment() {
  const output = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (
      sensitiveEnvironmentNames.has(name.toUpperCase()) ||
      sensitiveEnvironmentPattern.test(name)
    ) {
      continue;
    }
    output[name] = value;
  }
  return output;
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

function confined(value, label) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.includes('\0')
  ) {
    throw new Error(`${label} is required and must contain no NUL.`);
  }
  const candidate = path.resolve(value);
  const root = allowedRoots.find((entry) => inside(entry.lexical, candidate));
  if (!root) {
    throw new Error(`${label} is outside EVAVO_ART_AVATAR_SEQUENCE_ROOTS.`);
  }
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
    if (metadata.isSymbolicLink()) {
      throw new Error(`${label} contains a symbolic-link component.`);
    }
    if (index < parts.length - 1 && !metadata.isDirectory()) {
      throw new Error(`${label} contains a non-directory path component.`);
    }
    existing = current;
  }
  if (!inside(root.real, realpathSync(existing))) {
    throw new Error(`${label} escaped EVAVO_ART_AVATAR_SEQUENCE_ROOTS.`);
  }
  return candidate;
}

function requireWrite() {
  if (!writeEnabled) {
    throw new Error(
      'Avatar-sequence plan writes are disabled. Set EVAVO_ART_AVATAR_SEQUENCE_MCP_ALLOW_WRITE=true on the trusted local MCP deployment.',
    );
  }
}

function optionalTimestamp(value, label) {
  if (value === undefined) return null;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} must be a canonical UTC timestamp.`);
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
const timestampField = { type: 'string', minLength: 24, maxLength: 24 };
const tools = Object.freeze([
  {
    name: 'evavo_art_avatar_sequence_capabilities',
    description:
      'Describe the explicit owner-assignment avatar-sequence mastering boundary. Performs no project read or write.',
    inputSchema: objectSchema({}),
  },
  {
    name: 'evavo_art_compile_avatar_sequence',
    description:
      'Compile exact existing alpha PNGs plus owner-declared clip semantics into a content-addressed mastering plan, path-only workspace copy request, runtime draft and one loop-review request per true loop. Requires the local plan-write gate; performs no image, provider, repository, Git or publication mutation.',
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
]);
const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

function envelope(summary, effects = {}) {
  return {
    summary,
    effects: {
      planWrite: effects.planWrite === true,
      sourceMutation: false,
      sourceDeletion: false,
      targetImageWrite: false,
      providerExecution: false,
      runtimeSubmission: false,
      candidateApproval: false,
      candidatePromotion: false,
      repositoryMutation: false,
      gitCommit: false,
      gitPush: false,
      publication: false,
      deployment: false,
      forcePush: false,
    },
    bytesFlowThroughMcp: false,
    credentialsForwardedToSubprocess: false,
    rawCommandOutputReturned: false,
  };
}

function capabilities() {
  return envelope({
    schema: 'evavo.project-art-avatar-sequence-capabilities.v1',
    version: '2026-08-11.1',
    writeEnabled,
    allowedRootCount: allowedRoots.length,
    commandTimeoutMs,
    requestSchema: 'evavo.project-art-avatar-sequence-request.v1',
    planSchema: 'evavo.project-art-avatar-sequence-mastering-plan.v1',
    targetPackSchema: 'evavo_avatar_sequence_pack_v2',
    loopRequestSchema: 'evavo.project-art-loop-closure-request.v1',
    targetLoopEvidenceSchema:
      'evavo_avatar_sequence_loop_closure_evidence_v1',
    assignmentMode: 'owner-declared-only',
    semanticInferencePerformed: false,
    timestampOrderingUsedAsSemantics: false,
    workspaceFileOperationsArePathOnly: true,
    runtimeActivationAllowed: false,
  });
}

function validateInput(definition, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Tool arguments must be an object.');
  }
  const allowed = new Set(Object.keys(definition.inputSchema.properties));
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new Error(`${definition.name} received unknown argument ${key}.`);
    }
  }
  for (const key of definition.inputSchema.required) {
    if (!(key in input)) throw new Error(`${definition.name} requires argument ${key}.`);
  }
}

function boundedDiagnostic(value) {
  const text = String(value || 'Avatar sequence command failed.').trim();
  return text.length <= maximumDiagnosticCharacters
    ? text
    : `${text.slice(0, maximumDiagnosticCharacters)}\n[diagnostic truncated]`;
}

function runCompiler(input) {
  requireWrite();
  const args = [
    compiler,
    '--workspace-root',
    confined(input.workspaceRoot, 'workspaceRoot'),
    '--request',
    confined(input.requestPath, 'requestPath'),
    '--output',
    confined(input.planPath, 'planPath'),
  ];
  const compiledAt = optionalTimestamp(input.compiledAt, 'compiledAt');
  if (compiledAt) args.push('--compiled-at', compiledAt);
  const result = spawnSync(process.execPath, args, {
    cwd: artStudioRoot,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: commandTimeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: maximumOutputBytes,
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
    throw new Error(
      `Avatar-sequence compiler did not end with a JSON summary: ${boundedDiagnostic(error.message)}`,
    );
  }
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    throw new Error('Avatar-sequence compiler summary must be an object.');
  }
  return {
    ...envelope(summary, { planWrite: true }),
    command: {
      executable: path.basename(process.execPath),
      argumentCount: args.length,
      shell: false,
      timeoutMs: commandTimeoutMs,
      credentialsForwarded: false,
    },
  };
}

function callTool(name, input) {
  const definition = toolsByName.get(name);
  if (!definition) throw new Error(`Unknown tool: ${name}`);
  validateInput(definition, input);
  if (name === 'evavo_art_avatar_sequence_capabilities') return capabilities();
  if (name === 'evavo_art_compile_avatar_sequence') return runCompiler(input);
  throw new Error(`Unknown tool: ${name}`);
}

function response(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function errorResponse(id, error) {
  process.stdout.write(
    `${JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      },
    })}\n`,
  );
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
        serverInfo: {
          name: 'evavo-project-art-avatar-sequence',
          version: '1.0.0',
        },
      });
    } else if (request.method === 'notifications/initialized') {
      // Notification: no response.
    } else if (request.method === 'tools/list') {
      response(request.id, { tools });
    } else if (request.method === 'tools/call') {
      const output = callTool(
        request.params?.name,
        request.params?.arguments ?? {},
      );
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
