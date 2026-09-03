#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATCH_SCHEMA = 'evavo.local-generation-batch.v2';
const DEFAULT_PORT = 8192;

function fail(message) { throw new Error(message); }
function parseArgs(argv) {
  const result = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]; const value = argv[i + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--') || result.has(key)) fail('arguments must be unique --name value pairs');
    result.set(key, value);
  }
  for (const key of result.keys()) if (!['--manifest', '--output-root', '--actor', '--port'].includes(key)) fail(`unsupported argument ${key}`);
  return result;
}
function localAppData() {
  const configured = process.env.LOCALAPPDATA?.trim();
  if (configured) return path.resolve(configured);
  if (process.platform === 'win32' && process.env.USERPROFILE) return path.join(process.env.USERPROFILE, 'AppData', 'Local');
  return path.join(ROOT, '.art-studio');
}
function defaultCatalog() {
  return process.env.EVAVO_ART_COMFYUI_CATALOG?.trim() || path.join(localAppData(), 'EVAVO', 'AI', 'ComfyUI', 'catalog.json');
}
function qualityAdapter(document) {
  const explicit = document.provider?.adapterId;
  if (explicit) return explicit;
  const modelProfile = document.model_plan?.modelProfile ?? document.modelPlan?.modelProfile ?? 'sdxl-base-local';
  const quality = document.quality_profile ?? 'cinematic_stills';
  return `comfyui:${modelProfile}-${quality}`;
}
async function prepareManifest(sourcePath, port) {
  let source;
  try { source = JSON.parse(await readFile(sourcePath, 'utf8')); }
  catch (error) { fail(`batch manifest is invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  if (source?.schema !== BATCH_SCHEMA) fail(`batch manifest must use ${BATCH_SCHEMA}`);
  const bound = JSON.parse(JSON.stringify(source));
  bound.provider = {
    ...(bound.provider ?? {}),
    baseUrl: `http://127.0.0.1:${port}`,
    catalogPath: defaultCatalog(),
    adapterId: qualityAdapter(bound),
  };
  const sourceBytes = Buffer.from(`${JSON.stringify(source, null, 2)}\n`, 'utf8');
  const boundBytes = Buffer.from(`${JSON.stringify(bound, null, 2)}\n`, 'utf8');
  const fingerprint = createHash('sha256').update(sourceBytes).update(boundBytes).digest('hex');
  const requestRoot = path.join(localAppData(), 'EVAVO', 'ArtStudio', 'agent-requests', 'managed-batch-v2', fingerprint);
  await mkdir(requestRoot, { recursive: true });
  const original = path.join(requestRoot, 'manifest.source.json');
  const execution = path.join(requestRoot, 'manifest.execution.json');
  await writeFile(original, sourceBytes);
  await writeFile(execution, boundBytes);
  return Object.freeze({ original, execution, fingerprint, adapterId: bound.provider.adapterId, catalogPath: bound.provider.catalogPath, baseUrl: bound.provider.baseUrl });
}
async function runManaged(args, manifest, port) {
  const managed = path.join(ROOT, 'scripts', 'run-local-art-batch-managed.mjs');
  const childArgs = [managed, '--manifest', manifest.execution, '--port', String(port)];
  if (args.get('--output-root')) childArgs.push('--output-root', args.get('--output-root'));
  if (args.get('--actor')) childArgs.push('--actor', args.get('--actor'));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, childArgs, {
      cwd: ROOT,
      env: {
        ...process.env,
        EVAVO_ART_COMFYUI_CATALOG: manifest.catalogPath,
        EVAVO_ART_COMFYUI_BASE_URL: manifest.baseUrl,
        EVAVO_ART_COMFYUI_ALLOW_REMOTE: 'false',
        EVAVO_ART_COMFYUI_DEDICATED_INSTANCE: 'true',
      },
      stdio: 'inherit',
      windowsHide: true,
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`managed local batch exited ${code}`)));
  });
}

export async function runLocalArtBatchEntry(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const source = path.resolve(args.get('--manifest') ?? path.join(ROOT, 'examples', 'local-generation-batch.template.json'));
  const port = Number(args.get('--port') ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) fail('--port must be an integer between 1024 and 65535');
  const manifest = await prepareManifest(source, port);
  process.stderr.write(`${JSON.stringify({ kind: 'evavo.local-art-batch-entry.v2', status: 'prepared', sourceManifest: manifest.original, executionManifest: manifest.execution, adapterId: manifest.adapterId, catalogPath: manifest.catalogPath, baseUrl: manifest.baseUrl })}\n`);
  await runManaged(args, manifest, port);
}

const directlyInvoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (directlyInvoked) runLocalArtBatchEntry().catch((error) => { process.stderr.write(`${JSON.stringify({ kind: 'evavo.local-art-batch-entry.v2', ok: false, error: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 2; });
