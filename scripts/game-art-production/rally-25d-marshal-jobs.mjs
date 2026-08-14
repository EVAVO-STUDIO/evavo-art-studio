#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const SPEC_SCHEMA = "evavo.rally-marshal-visual-development.v1";
export const SESSION_SCHEMA = "evavo.rally-marshal-provider-job-session.v1";
export const JOB_SCHEMA = "evavo.rally-marshal-provider-job.v1";
export const PROTOCOL_VERSION = "2026-08-15.6";
const CLIPS = ["idle", "alert", "flag-wave", "react", "flee"];
const ID = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/u;
const SHA = /^[0-9a-f]{64}$/u;
const SPEC_KEYS = new Set(["schema", "protocolVersion", "assetId", "subjectId", "title", "style", "bodyLocks", "animationClips", "jobs", "output", "authority"]);
const STYLE_KEYS = new Set(["projectionFamily", "designEra", "rendering", "characterLanguage", "palette", "surfaceLanguage", "forbidden"]);
const BODY_KEYS = new Set(["heightMeters", "shoulderWidthMeters", "headRadiusMeters", "handLengthMeters", "bootLengthMeters", "flagPoleLengthMeters", "consistentBodyProportions", "consistentClothing", "consistentFlagIdentity", "consistentHandScale"]);
const JOB_KEYS = new Set(["id", "role", "view", "phase", "width", "height", "transparent", "dependsOn", "include", "exclude"]);
const OUTPUT_KEYS = new Set(["workingRoot", "masterRoot", "format", "oneImagePerJob", "retainIndividualSources", "automaticAssembly"]);
const AUTHORITY_FALSE = ["providerExecution", "automaticGenerationAuthorization", "automaticCreativeApproval", "imageMutation", "automaticAssembly", "targetRepositoryMutation", "gitMutation", "deployment", "publication"];
const REQUIRED_ROLES = new Set(["identity-master", "identity-continuity", "modular-modeling-reference", "rigging-reference", "runtime-shader-reference", "prop-modeling-reference", "animation-key-pose"]);

function fail(message) { throw new Error(`RALLY_MARSHAL_ART_JOBS_INVALID: ${message}`); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys, label) {
  if (!isObject(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value);
  const unknown = actual.filter((key) => !keys.has(key)).sort();
  const missing = [...keys].filter((key) => !Object.hasOwn(value, key)).sort();
  if (unknown.length) fail(`${label} contains unsupported keys: ${unknown.join(", ")}.`);
  if (missing.length) fail(`${label} is missing keys: ${missing.join(", ")}.`);
}
function text(value, label, minimum = 1, maximum = 8000) {
  if (typeof value !== "string" || value.trim() !== value || value.length < minimum || value.length > maximum) fail(`${label} must be a trimmed string with ${minimum}-${maximum} characters.`);
  if ([...value].some((character) => character.charCodeAt(0) < 32)) fail(`${label} contains control characters.`);
  return value;
}
function id(value, label) { const result = text(value, label, 1, 180); if (!ID.test(result)) fail(`${label} must be lowercase kebab-case.`); return result; }
function finite(value, label, minimum, maximum) { if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) fail(`${label} must be a finite number between ${minimum} and ${maximum}.`); return value; }
function bool(value, label) { if (typeof value !== "boolean") fail(`${label} must be boolean.`); return value; }
function strings(value, label, minimum = 0, maximum = 64) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail(`${label} must contain ${minimum}-${maximum} strings.`);
  const result = value.map((entry, index) => text(entry, `${label}[${index}]`, 1, 1200));
  if (new Set(result).size !== result.length) fail(`${label} contains duplicates.`);
  return result;
}
function safeRoot(value, label) {
  const root = text(value, label, 3, 500);
  if (root.startsWith("/") || root.includes("\\") || root.split("/").some((part) => ["", ".", ".."].includes(part))) fail(`${label} must be a safe relative POSIX path.`);
  return root;
}
function sortValue(value) { if (Array.isArray(value)) return value.map(sortValue); if (!isObject(value)) return value; return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])])); }
export function canonicalJson(value) { return `${JSON.stringify(sortValue(value))}\n`; }
export function sha256(value) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }

function validateAuthority(value) {
  exact(value, new Set([...AUTHORITY_FALSE, "namedHumanApprovalRequired"]), "authority");
  for (const key of AUTHORITY_FALSE) if (value[key] !== false) fail(`authority.${key} must remain false.`);
  if (value.namedHumanApprovalRequired !== true) fail("authority.namedHumanApprovalRequired must remain true.");
}
function topological(jobs) {
  const byId = new Map(jobs.map((job, index) => [job.id, { job, index }]));
  const indegree = new Map(jobs.map((job) => [job.id, job.dependsOn.length]));
  const consumers = new Map(jobs.map((job) => [job.id, []]));
  for (const job of jobs) for (const dependency of job.dependsOn) {
    if (!byId.has(dependency)) fail(`job ${job.id} references unknown dependency ${dependency}.`);
    if (dependency === job.id) fail(`job ${job.id} depends on itself.`);
    consumers.get(dependency).push(job.id);
  }
  const ready = jobs.filter((job) => indegree.get(job.id) === 0).map((job) => job.id);
  const order = (a, b) => byId.get(a).index - byId.get(b).index || a.localeCompare(b);
  ready.sort(order);
  const result = [];
  while (ready.length) {
    const current = ready.shift(); result.push(byId.get(current).job);
    for (const consumer of consumers.get(current)) { indegree.set(consumer, indegree.get(consumer) - 1); if (indegree.get(consumer) === 0) { ready.push(consumer); ready.sort(order); } }
  }
  if (result.length !== jobs.length) fail("job dependency graph contains a cycle.");
  return result;
}

export function validateMarshalSpec(input) {
  const source = structuredClone(input);
  exact(source, SPEC_KEYS, "spec");
  if (source.schema !== SPEC_SCHEMA || source.protocolVersion !== PROTOCOL_VERSION) fail("spec identity drifted.");
  id(source.assetId, "assetId"); id(source.subjectId, "subjectId"); text(source.title, "title", 3, 300);
  exact(source.style, STYLE_KEYS, "style");
  id(source.style.projectionFamily, "style.projectionFamily"); id(source.style.designEra, "style.designEra"); id(source.style.rendering, "style.rendering");
  text(source.style.characterLanguage, "style.characterLanguage", 40, 1800);
  const palette = strings(source.style.palette, "style.palette", 8, 16); for (const [index, colour] of palette.entries()) if (!/^#[0-9a-fA-F]{6}$/u.test(colour)) fail(`style.palette[${index}] must be a six-digit hex colour.`);
  strings(source.style.surfaceLanguage, "style.surfaceLanguage", 5, 20); strings(source.style.forbidden, "style.forbidden", 8, 32);
  exact(source.bodyLocks, BODY_KEYS, "bodyLocks");
  finite(source.bodyLocks.heightMeters, "bodyLocks.heightMeters", 1.3, 2.2); finite(source.bodyLocks.shoulderWidthMeters, "bodyLocks.shoulderWidthMeters", 0.3, 0.8); finite(source.bodyLocks.headRadiusMeters, "bodyLocks.headRadiusMeters", 0.08, 0.22); finite(source.bodyLocks.handLengthMeters, "bodyLocks.handLengthMeters", 0.1, 0.3); finite(source.bodyLocks.bootLengthMeters, "bodyLocks.bootLengthMeters", 0.15, 0.45); finite(source.bodyLocks.flagPoleLengthMeters, "bodyLocks.flagPoleLengthMeters", 0.7, 2.5);
  for (const key of ["consistentBodyProportions", "consistentClothing", "consistentFlagIdentity", "consistentHandScale"]) if (bool(source.bodyLocks[key], `bodyLocks.${key}`) !== true) fail(`bodyLocks.${key} must remain true.`);
  if (!Array.isArray(source.animationClips) || source.animationClips.length !== CLIPS.length || source.animationClips.some((clip, index) => clip !== CLIPS[index])) fail(`animationClips must equal ${CLIPS.join(", ")}.`);
  exact(source.output, OUTPUT_KEYS, "output"); safeRoot(source.output.workingRoot, "output.workingRoot"); safeRoot(source.output.masterRoot, "output.masterRoot");
  if (source.output.format !== "png" || source.output.oneImagePerJob !== true || source.output.retainIndividualSources !== true || source.output.automaticAssembly !== false) fail("output contract drifted.");
  validateAuthority(source.authority);
  if (!Array.isArray(source.jobs) || source.jobs.length !== 13) fail("jobs must contain exactly thirteen one-image jobs.");
  const ids = new Set();
  const jobs = source.jobs.map((raw, index) => {
    exact(raw, JOB_KEYS, `jobs[${index}]`); const jobId = id(raw.id, `jobs[${index}].id`); if (ids.has(jobId)) fail(`duplicate job id ${jobId}.`); ids.add(jobId);
    const role = id(raw.role, `jobs[${index}].role`); const view = id(raw.view, `jobs[${index}].view`); const phase = id(raw.phase, `jobs[${index}].phase`);
    if (!Number.isInteger(raw.width) || raw.width !== 2048 || !Number.isInteger(raw.height) || raw.height !== 2048) fail(`jobs[${index}] must be 2048x2048.`);
    bool(raw.transparent, `jobs[${index}].transparent`); const dependsOn = strings(raw.dependsOn, `jobs[${index}].dependsOn`).map((entry) => id(entry, `jobs[${index}].dependsOn`));
    const include = strings(raw.include, `jobs[${index}].include`, 3, 24); const exclude = strings(raw.exclude, `jobs[${index}].exclude`, 3, 24);
    if (include.some((entry) => /contact\s*sheet|multi[- ]panel|grid of|multiple frames/i.test(entry))) fail(`jobs[${index}] requests a forbidden combined layout.`);
    return { ...raw, id: jobId, role, view, phase, dependsOn, include, exclude };
  });
  topological(jobs);
  const roles = new Set(jobs.map((job) => job.role)); for (const role of REQUIRED_ROLES) if (!roles.has(role)) fail(`job role closure is missing ${role}.`);
  if (jobs.filter((job) => job.role === "modular-modeling-reference").length !== 3) fail("marshal requires exactly three orthographic modeling references.");
  if (jobs.filter((job) => job.role === "animation-key-pose").length !== 5) fail("marshal requires exactly five animation key-pose references.");
  return source;
}

function prompt(spec, job) {
  return [
    `Create exactly one image for ${spec.title}.`,
    `Asset identity: ${spec.subjectId}; job: ${job.id}; role: ${job.role}; view: ${job.view}.`,
    `Visual target: ${spec.style.designEra}; ${spec.style.rendering}; ${spec.style.characterLanguage}`,
    `Projection: ${spec.style.projectionFamily}. Preserve body proportions, clothing, flag identity, hand scale, palette and pivot readability established by dependencies.`,
    `Include: ${job.include.join("; ")}.`,
    `Avoid: ${[...spec.style.forbidden, ...job.exclude].join("; ")}.`,
    `Output one ${job.width}x${job.height} PNG${job.transparent ? " with true transparent background" : " as one coherent material reference"}. No labels, contact sheet, grid, duplicate figure or unrelated second character.`,
  ].join("\n");
}

export function compileMarshalSession(input) {
  const spec = validateMarshalSpec(input); const specSha256 = sha256(spec); const ordered = topological(spec.jobs);
  const jobs = ordered.map((job, sequence) => {
    const body = { schema: JOB_SCHEMA, protocolVersion: PROTOCOL_VERSION, sequence, assetId: spec.assetId, subjectId: spec.subjectId, jobId: job.id, phase: job.phase, role: job.role, view: job.view, operation: "generate", images: 1, candidateCount: 1,
      target: { width: job.width, height: job.height, format: "png", transparentBackground: job.transparent }, dependencies: [...job.dependsOn], prompt: prompt(spec, job), output: { working: `${spec.output.workingRoot}/${job.id}.png`, master: `${spec.output.masterRoot}/${job.id}.png` },
      idempotencyKey: sha256({ specSha256, jobId: job.id, dependencies: job.dependsOn }), authority: { providerExecution: false, automaticApproval: false, imageMutation: false, automaticAssembly: false, repositoryMutation: false, gitMutation: false, deployment: false, publication: false, namedHumanApprovalRequired: true } };
    return { ...body, jobSha256: sha256(body) };
  });
  const body = { schema: SESSION_SCHEMA, protocolVersion: PROTOCOL_VERSION, sessionId: `${spec.assetId}-visual-development-v1`, assetId: spec.assetId, subjectId: spec.subjectId, specSha256, spec, jobs,
    totals: { jobs: jobs.length, images: jobs.length, modelingJobs: jobs.filter((job) => job.role === "modular-modeling-reference").length, animationJobs: jobs.filter((job) => job.role === "animation-key-pose").length, transparentJobs: jobs.filter((job) => job.target.transparentBackground).length, animationClips: spec.animationClips.length },
    readiness: { status: "provider-jobs-compiled", providerExecutionRequired: true, namedHumanApprovalRequired: true, downstream3DReady: false }, authority: structuredClone(spec.authority) };
  return { ...body, sessionSha256: sha256(body) };
}
export function verifyMarshalSession(session) {
  if (!isObject(session) || session.schema !== SESSION_SCHEMA || session.protocolVersion !== PROTOCOL_VERSION) fail("session identity drifted.");
  if (typeof session.sessionSha256 !== "string" || !SHA.test(session.sessionSha256)) fail("sessionSha256 is invalid.");
  const body = Object.fromEntries(Object.entries(session).filter(([key]) => key !== "sessionSha256")); if (sha256(body) !== session.sessionSha256) fail("sessionSha256 does not match the submitted payload.");
  const expected = compileMarshalSession(session.spec); if (canonicalJson(expected) !== canonicalJson(session)) fail("session is not the deterministic compilation of its retained spec."); return true;
}

async function main() {
  const [command, inputPath, ...rest] = process.argv.slice(2); const outputIndex = rest.indexOf("--output"); const outputPath = outputIndex >= 0 ? rest[outputIndex + 1] : undefined;
  if (!["compile", "verify"].includes(command) || !inputPath) fail("Usage: rally-25d-marshal-jobs.mjs <compile|verify> <input.json> [--output output.json]");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const result = command === "compile" ? compileMarshalSession(input) : { valid: verifyMarshalSession(input), sessionId: input.sessionId, sessionSha256: input.sessionSha256, jobs: input.totals.jobs, images: input.totals.images, modelingJobs: input.totals.modelingJobs, animationJobs: input.totals.animationJobs, animationClips: input.totals.animationClips, oneImagePerJob: input.totals.images === input.totals.jobs, providerExecution: false };
  const rendered = `${JSON.stringify(result, null, 2)}\n`; if (outputPath) await writeFile(outputPath, rendered, "utf8"); process.stdout.write(rendered);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
