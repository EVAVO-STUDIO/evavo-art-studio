#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_NODES = Object.freeze([
  'CheckpointLoaderSimple',
  'CLIPTextEncode',
  'EmptyLatentImage',
  'KSampler',
  'VAEDecode',
  'SaveImage',
]);
const DEFAULT_PORT = 8192;
const STARTUP_TIMEOUT_MS = 90_000;
const BOOTSTRAP_SOURCE = String.raw`from __future__ import annotations
import os, runpy, sys
from pathlib import Path
if len(sys.argv) < 2:
    raise RuntimeError("missing ComfyUI main.py")
main_py = Path(sys.argv[1]).resolve()
root = main_py.parent
if not main_py.is_file() or not (root / "nodes.py").is_file():
    raise RuntimeError("invalid ComfyUI root")
comfy_args = [str(main_py), *sys.argv[2:]]
os.chdir(root)
sys.path.insert(0, str(root))
sys.argv = comfy_args
import comfy.options
comfy.options.enable_args_parsing()
import nodes
async def evavo_skip_builtin_extra_nodes():
    return []
nodes.init_builtin_extra_nodes = evavo_skip_builtin_extra_nodes
runpy.run_path(str(main_py), run_name="__main__")
`;

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
function comfyRuntime() {
  const base = process.env.EVAVO_COMFYUI_RUNTIME_ROOT?.trim();
  const root = base ? path.resolve(base) : path.join(localAppData(), 'EVAVO', 'AI', 'ComfyUI');
  return Object.freeze({
    environmentRoot: root,
    comfyRoot: path.join(root, 'ComfyUI'),
    python: path.join(root, '.venv', 'Scripts', 'python.exe'),
    main: path.join(root, 'ComfyUI', 'main.py'),
    catalog: process.env.EVAVO_ART_COMFYUI_CATALOG?.trim() || path.join(root, 'catalog.json'),
  });
}
async function existsFile(file) {
  try { const stat = await import('node:fs/promises').then(({ stat }) => stat(file)); return stat.isFile(); }
  catch { return false; }
}
function sha256Text(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ host: '127.0.0.1', port }, () => server.close(() => resolve(true)));
  });
}
async function fetchJson(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'error' });
    if (!response.ok) fail(`HTTP ${response.status}: ${url}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}
async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(10_000),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}
async function startComfy({ port, runtime }) {
  if (process.platform !== 'win32') fail('managed local Art Studio batch execution currently requires the EVAVO Windows workstation');
  for (const [file, label] of [[runtime.python, 'ComfyUI Python'], [runtime.main, 'ComfyUI main.py'], [runtime.catalog, 'ComfyUI catalog']]) {
    if (!(await existsFile(file))) fail(`${label} is missing: ${file}`);
  }
  if (!(await portFree(port))) fail(`loopback port ${port} is already in use; refusing to mix ComfyUI provenance`);
  const logRoot = path.join(localAppData(), 'EVAVO', 'AI', 'logs', 'comfyui-batch-v2');
  await mkdir(logRoot, { recursive: true });
  const bootstrap = path.join(logRoot, 'evavo-comfyui-true-core-bootstrap.py');
  const bootstrapSha = sha256Text(BOOTSTRAP_SOURCE);
  await writeFile(bootstrap, BOOTSTRAP_SOURCE, 'utf8');
  const observedBootstrapSha = createHash('sha256').update(await readFile(bootstrap)).digest('hex');
  if (observedBootstrapSha !== bootstrapSha) fail('true-core bootstrap write/readback hash mismatch');
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const stdoutPath = path.join(logRoot, `batch-${stamp}.out.log`);
  const stderrPath = path.join(logRoot, `batch-${stamp}.err.log`);
  const { open } = await import('node:fs/promises');
  const stdout = await open(stdoutPath, 'w');
  const stderr = await open(stderrPath, 'w');
  const child = spawn(runtime.python, [
    bootstrap,
    runtime.main,
    '--listen', '127.0.0.1',
    '--port', String(port),
    '--database-url', 'sqlite:///:memory:',
    '--disable-auto-launch',
    '--disable-all-custom-nodes',
    '--disable-api-nodes',
  ], {
    cwd: runtime.comfyRoot,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    stdio: ['ignore', stdout.fd, stderr.fd],
    windowsHide: true,
    shell: false,
  });
  let ready = false;
  const startedAt = Date.now();
  try {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) break;
      try {
        const stats = await fetchJson(`http://127.0.0.1:${port}/system_stats`, 2000);
        if (stats && typeof stats === 'object') { ready = true; break; }
      } catch { /* still starting */ }
      await sleep(1000);
    }
    if (!ready) {
      const [out, err] = await Promise.all([readFile(stdoutPath, 'utf8').catch(() => ''), readFile(stderrPath, 'utf8').catch(() => '')]);
      fail(`true-core ComfyUI did not become ready; exit=${child.exitCode}; stdout=${out.slice(-6000)}; stderr=${err.slice(-6000)}`);
    }
    const objectInfo = await fetchJson(`http://127.0.0.1:${port}/object_info`, 15_000);
    const missing = REQUIRED_NODES.filter((node) => !objectInfo || typeof objectInfo !== 'object' || !(node in objectInfo));
    if (missing.length) fail(`true-core ComfyUI is missing required nodes: ${missing.join(', ')}`);
    return Object.freeze({ child, stdout, stderr, stdoutPath, stderrPath, bootstrapSha, startupMs: Date.now() - startedAt });
  } catch (error) {
    await stopProcess(child);
    await Promise.all([stdout.close().catch(() => {}), stderr.close().catch(() => {})]);
    throw error;
  }
}
async function runBatch({ manifest, outputRoot, actor, port, runtime }) {
  const runner = path.join(ROOT, 'scripts', 'run-local-generation-batch.mjs');
  const args = [runner, '--manifest', manifest];
  if (outputRoot) args.push('--output-root', outputRoot);
  if (actor) args.push('--actor', actor);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env: {
        ...process.env,
        EVAVO_ART_COMFYUI_BASE_URL: `http://127.0.0.1:${port}`,
        EVAVO_ART_COMFYUI_CATALOG: runtime.catalog,
        EVAVO_ART_COMFYUI_CATALOG_ROOT: path.dirname(runtime.catalog),
        EVAVO_ART_COMFYUI_ALLOW_REMOTE: 'false',
        EVAVO_ART_COMFYUI_DEDICATED_INSTANCE: 'true',
      },
      stdio: 'inherit',
      windowsHide: true,
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`batch runner exited ${code}`)));
  });
}

export async function runManagedLocalArtBatch(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const manifest = path.resolve(args.get('--manifest') ?? path.join(ROOT, 'examples', 'local-generation-batch.template.json'));
  if (!(await existsFile(manifest))) fail(`batch manifest is missing: ${manifest}`);
  const port = Number(args.get('--port') ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) fail('--port must be an integer between 1024 and 65535');
  const runtime = comfyRuntime();
  const service = await startComfy({ port, runtime });
  try {
    await runBatch({ manifest, outputRoot: args.get('--output-root') ?? null, actor: args.get('--actor') ?? 'managed-local-art-batch-v2', port, runtime });
    process.stderr.write(`${JSON.stringify({ kind: 'evavo.managed-local-art-batch.v2', ok: true, port, catalogPath: runtime.catalog, startupMs: service.startupMs, bootstrapSha256: service.bootstrapSha, localOnly: true, hostedFallback: false })}\n`);
  } finally {
    await stopProcess(service.child);
    await Promise.all([service.stdout.close().catch(() => {}), service.stderr.close().catch(() => {})]);
  }
}

const directlyInvoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (directlyInvoked) runManagedLocalArtBatch().catch((error) => { process.stderr.write(`${JSON.stringify({ kind: 'evavo.managed-local-art-batch.v2', ok: false, error: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 2; });
