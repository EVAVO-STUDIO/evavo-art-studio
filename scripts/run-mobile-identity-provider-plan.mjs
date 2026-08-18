#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const RUNTIME_SCRIPT = 'scripts/mobile-identity-provider-runtime.mjs';
const PREPARATION_ID = 'prepare';
const EXPECTED_STEP_IDS = Object.freeze(['select', 'admit', 'authorize', 'execute']);
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_PROCESS_OUTPUT = 2 * 1024 * 1024;

function fail(message) { throw new Error(message); }
function sha256Bytes(value) { return createHash('sha256').update(value).digest('hex'); }
function sha256Object(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function safeText(value, label, maximum = 4096) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\0\r\n]/u.test(value)) fail(`${label} is invalid`);
  return value.trim();
}
function safeRelativePath(value, label) {
  const text = safeText(value, label).replaceAll('\\', '/');
  if (text.startsWith('/') || /^[A-Za-z]:\//u.test(text) || text.split('/').some((part) => !part || part === '.' || part === '..' || part === '.git')) fail(`${label} must be a safe repository-relative path`);
  return text;
}
function parse(argv) {
  if (argv.length !== 4) fail('expected exactly --plan <path> --expected-plan-sha256 <sha256>');
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!['--plan', '--expected-plan-sha256'].includes(name) || !value || value.startsWith('--') || values.has(name)) fail('arguments must be unique supported --name value pairs');
    values.set(name, value);
  }
  return values;
}
function readPlan(file, expectedSha256) {
  const relative = safeRelativePath(file, '--plan');
  const target = resolve(relative);
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_JSON_BYTES) fail('execution plan must be a regular JSON file <= 1 MiB');
  const bytes = readFileSync(target);
  const actual = sha256Bytes(bytes);
  if (!/^[a-f0-9]{64}$/u.test(expectedSha256) || actual !== expectedSha256) fail('execution plan file SHA-256 mismatch');
  const value = JSON.parse(bytes.toString('utf8'));
  return Object.freeze({ relative, target, value, fileSha256: actual });
}
function validateRuntimeArgv(step, expectedPhase) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) fail(`${expectedPhase} step is invalid`);
  if (step.id !== expectedPhase) fail(`step must be ${expectedPhase}`);
  if (!Array.isArray(step.argv) || step.argv.length < 3 || step.argv.some((entry) => typeof entry !== 'string' || /[\0\r\n]/u.test(entry))) fail(`step ${step.id} argv is invalid`);
  if (step.argv[0] !== 'node' || step.argv[1] !== RUNTIME_SCRIPT || step.argv[2] !== expectedPhase) fail(`step ${step.id} must execute ${RUNTIME_SCRIPT} ${expectedPhase}`);
  return Object.freeze({ ...step, argv: Object.freeze([...step.argv]) });
}
function validateOpenAIProvider(plan) {
  if (plan.provider?.preferredAdapterId !== 'openai-gpt-image' || plan.provider?.preferredModel !== 'gpt-image-2') fail('provider plan must prefer openai-gpt-image with gpt-image-2');
  if (!Array.isArray(plan.provider?.allowedAdapterIds) || plan.provider.allowedAdapterIds.length !== 1 || plan.provider.allowedAdapterIds[0] !== 'openai-gpt-image') fail('official OpenAI runner requires exactly the openai-gpt-image adapter');
}
export function validateMobileIdentityProviderExecutionPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) fail('execution plan must be an object');
  if (plan.schema !== 'evavo.mobile-identity-provider-execution-plan.v1' || plan.status !== 'governed-execution-ready') fail('execution plan is not governed-execution-ready');
  const { executionPlanSha256, ...unsigned } = plan;
  if (!/^[a-f0-9]{64}$/u.test(executionPlanSha256 ?? '') || sha256Object(unsigned) !== executionPlanSha256) fail('executionPlanSha256 mismatch');
  validateOpenAIProvider(plan);
  if (plan.runtime?.schema !== 'evavo.mobile-identity-provider-runtime-batch.v1' || plan.runtime?.controlScript !== RUNTIME_SCRIPT || plan.runtime?.campaignMetadataRequired !== false || plan.runtime?.gameMetadataRequired !== false) fail('mobile identity runtime binding is invalid');
  const preparation = validateRuntimeArgv(plan.preparation, PREPARATION_ID);
  if (!Array.isArray(plan.steps) || plan.steps.length !== EXPECTED_STEP_IDS.length) fail('execution plan must contain exactly four governed stages after preparation');
  const steps = plan.steps.map((step, index) => validateRuntimeArgv(step, EXPECTED_STEP_IDS[index]));
  if (!preparation.argv.includes('--provider-request') || !preparation.argv.includes('--output')) fail('prepare step must bind provider request and runtime batch output');
  if (!steps[2].argv.includes('--allowed-adapters') || !steps[3].argv.includes('--authorization')) fail('authorization and execution bindings are incomplete');
  if (plan.authority?.bypassSelection !== false || plan.authority?.bypassAdmission !== false || plan.authority?.bypassAuthorization !== false || plan.authority?.generationEqualsApproval !== false || plan.authority?.runtimePublication !== false || plan.authority?.deviceAuthority !== false || plan.authority?.protocolAuthority !== false || plan.authority?.forcePush !== false) fail('execution plan authority boundary is invalid');
  return Object.freeze({ ...plan, preparation, steps: Object.freeze(steps) });
}
function cleanBaseEnvironment(source) {
  const allowedNames = [
    'ALLUSERSPROFILE','APPDATA','COMSPEC','HOME','HOMEDRIVE','HOMEPATH','LOCALAPPDATA','NUMBER_OF_PROCESSORS','OS','PATH','PATHEXT','PROGRAMDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432','SYSTEMDRIVE','SYSTEMROOT','TEMP','TMP','USERDOMAIN','USERNAME','USERPROFILE','WINDIR','CI','NO_COLOR','FORCE_COLOR','PYTHONUTF8','PYTHONDONTWRITEBYTECODE',
  ];
  const result = {};
  for (const name of allowedNames) if (typeof source[name] === 'string') result[name] = source[name];
  result.CI = '1';
  result.NO_COLOR = '1';
  result.FORCE_COLOR = '0';
  return result;
}
export function createOpenAIProviderExecutionEnvironment(source = process.env) {
  if (source.EVAVO_ART_OPENAI_BASE_URL?.trim()) fail('EVAVO_ART_OPENAI_BASE_URL is forbidden for the official OpenAI provider lane');
  const key = safeText(source.OPENAI_API_KEY, 'OPENAI_API_KEY', 8192);
  const env = cleanBaseEnvironment(source);
  env.OPENAI_API_KEY = key;
  if (source.OPENAI_ORGANIZATION?.trim()) env.OPENAI_ORGANIZATION = safeText(source.OPENAI_ORGANIZATION, 'OPENAI_ORGANIZATION', 256);
  if (source.OPENAI_PROJECT?.trim()) env.OPENAI_PROJECT = safeText(source.OPENAI_PROJECT, 'OPENAI_PROJECT', 256);
  env.EVAVO_ART_OPENAI_IMAGE_MODEL = 'gpt-image-2';
  env.EVAVO_ART_OPENAI_IMAGE_MODELS = 'gpt-image-2,gpt-image-2-2026-04-21';
  env.EVAVO_ART_PROVIDER_MAX_RESPONSE_BYTES = '134217728';
  return Object.freeze(env);
}
function redact(value, secret) {
  const text = String(value ?? '');
  return secret ? text.split(secret).join('<redacted>') : text;
}
function run(executable, args, environment, secret, label, timeoutMs) {
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    env: environment,
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: MAX_PROCESS_OUTPUT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) fail(`${label} failed to start: ${redact(result.error.message, secret)}`);
  if (result.status !== 0) {
    const diagnostic = redact(result.stderr || result.stdout || `exit ${result.status}`, secret).slice(-4000);
    fail(`${label} failed with exit code ${result.status}: ${diagnostic}`);
  }
  return Object.freeze({ status: result.status, stdout: redact(result.stdout, secret).slice(-4000) });
}
function pnpmExecutable() { return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'; }
function executeRuntimeStep(step, environment, secret) {
  run(process.execPath, step.argv.slice(1), environment, secret, `mobile identity ${step.id}`, 35 * 60 * 1000);
}
export function executeMobileIdentityProviderExecutionPlan(plan, sourceEnvironment = process.env) {
  const validated = validateMobileIdentityProviderExecutionPlan(plan);
  const providerEnv = createOpenAIProviderExecutionEnvironment(sourceEnvironment);
  const secret = providerEnv.OPENAI_API_KEY;
  const buildEnv = cleanBaseEnvironment(sourceEnvironment);
  run(pnpmExecutable(), ['run', 'build:domain'], buildEnv, '', 'Art Studio domain build', 20 * 60 * 1000);
  run(pnpmExecutable(), ['--filter', '@evavo/art-studio-worker', 'build'], buildEnv, '', 'Art Studio worker build', 10 * 60 * 1000);
  const executed = [];
  executeRuntimeStep(validated.preparation, buildEnv, '');
  executed.push(validated.preparation.id);
  for (const step of validated.steps) {
    const environment = step.id === 'execute' ? providerEnv : buildEnv;
    executeRuntimeStep(step, environment, step.id === 'execute' ? secret : '');
    executed.push(step.id);
  }
  return Object.freeze({
    status: 'succeeded',
    schema: validated.schema,
    executionPlanSha256: validated.executionPlanSha256,
    providerAdapterId: 'openai-gpt-image',
    providerModel: 'gpt-image-2',
    networkProfile: 'openai-images-official-v1',
    executedStages: Object.freeze(executed),
    generationEqualsApproval: false,
    publicationAuthority: false,
    forcePush: false,
  });
}
function main(argv = process.argv.slice(2)) {
  const values = parse(argv);
  const record = readPlan(values.get('--plan'), safeText(values.get('--expected-plan-sha256'), '--expected-plan-sha256', 64));
  const result = executeMobileIdentityProviderExecutionPlan(record.value, process.env);
  process.stdout.write(`${JSON.stringify({ ...result, planFileSha256: record.fileSha256 })}\n`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { process.stderr.write(`${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 2; }
}
