import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import process from "node:process";

export const SPEC_SCHEMA = "evavo.rally-engine-smoke-visual-development.v1";
export const JOB_SCHEMA = "evavo.rally-engine-smoke-provider-job.v1";
export const SESSION_SCHEMA = "evavo.rally-engine-smoke-provider-job-session.v1";
export const PROTOCOL_VERSION = "2026-08-15.9";
const EXPECTED_JOB_COUNT = 12;
const EXPECTED_ROLE_COUNTS = Object.freeze({
  "effect-shape-master": 1,
  "effect-response-reference": 8,
  "particle-sprite-reference": 2,
  "decay-reference": 1,
});
const FALSE_AUTHORITY = Object.freeze([
  "providerExecution", "automaticGenerationAuthorization", "automaticCreativeApproval",
  "imageMutation", "automaticAssembly", "targetRepositoryMutation", "gitMutation",
  "deployment", "publication",
]);
const ID = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonical(actual) !== canonical(wanted)) throw new Error(`${label} key closure drifted`);
}

function id(value, label) {
  if (typeof value !== "string" || !ID.test(value)) throw new Error(`${label} must be lowercase kebab-case`);
  return value;
}

function stringArray(value, label, minimum = 1) {
  if (!Array.isArray(value) || value.length < minimum || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error(`${label} must be a non-empty string array`);
  }
  return value;
}

export function validateEngineSmokeSpec(document) {
  const sourceBefore = canonical(document);
  const source = structuredClone(document);
  exactKeys(source, ["schema", "protocolVersion", "assetId", "subjectId", "title", "style", "continuity", "jobs", "output", "authority"], "specification");
  if (source.schema !== SPEC_SCHEMA || source.protocolVersion !== PROTOCOL_VERSION) throw new Error("Engine Smoke specification identity drifted");
  if (id(source.assetId, "assetId") !== "engine-smoke-production-v1" || id(source.subjectId, "subjectId") !== "engine-smoke") throw new Error("Engine Smoke asset identity drifted");
  if (typeof source.title !== "string" || !source.title.trim()) throw new Error("title is required");

  exactKeys(source.style, ["projectionFamily", "designEra", "rendering", "effectLanguage", "palette", "surfaceLanguage", "forbidden"], "style");
  for (const key of ["projectionFamily", "designEra", "rendering", "effectLanguage"]) {
    if (typeof source.style[key] !== "string" || !source.style[key].trim()) throw new Error(`style.${key} is required`);
  }
  stringArray(source.style.palette, "style.palette", 6);
  if (new Set(source.style.palette).size !== source.style.palette.length) throw new Error("style.palette contains duplicates");
  stringArray(source.style.surfaceLanguage, "style.surfaceLanguage", 4);
  stringArray(source.style.forbidden, "style.forbidden", 6);

  exactKeys(source.continuity, ["plumeOriginReadable", "damageStatesDistinct", "rpmResponseReadable", "windResponseReadable", "alphaEdgeClean", "roadBackgroundExcluded"], "continuity");
  if (Object.values(source.continuity).some((value) => value !== true)) throw new Error("all Engine Smoke continuity gates must be true");

  if (!Array.isArray(source.jobs) || source.jobs.length !== EXPECTED_JOB_COUNT) throw new Error(`Engine Smoke requires exactly ${EXPECTED_JOB_COUNT} jobs`);
  const known = new Set();
  const roles = {};
  const graph = new Map();
  for (const [index, raw] of source.jobs.entries()) {
    exactKeys(raw, ["id", "role", "phase", "width", "height", "transparent", "dependsOn", "include", "exclude"], `jobs[${index}]`);
    const jobId = id(raw.id, `jobs[${index}].id`);
    if (known.has(jobId)) throw new Error(`duplicate job id ${jobId}`);
    known.add(jobId);
    if (!(raw.role in EXPECTED_ROLE_COUNTS)) throw new Error(`jobs[${index}].role is invalid`);
    roles[raw.role] = (roles[raw.role] ?? 0) + 1;
    if (typeof raw.phase !== "string" || !raw.phase.trim()) throw new Error(`jobs[${index}].phase is required`);
    if (raw.width !== 2048 || raw.height !== 2048 || raw.transparent !== true) throw new Error(`jobs[${index}] must be one transparent 2048x2048 source`);
    if (!Array.isArray(raw.dependsOn) || raw.dependsOn.some((entry) => typeof entry !== "string" || !ID.test(entry))) throw new Error(`jobs[${index}].dependsOn is invalid`);
    stringArray(raw.include, `jobs[${index}].include`, 4);
    stringArray(raw.exclude, `jobs[${index}].exclude`, 4);
    graph.set(jobId, raw.dependsOn);
  }
  if (canonical(roles) !== canonical(EXPECTED_ROLE_COUNTS)) throw new Error("Engine Smoke role counts drifted");
  for (const [jobId, dependencies] of graph) {
    for (const dependency of dependencies) {
      if (!known.has(dependency) || dependency === jobId) throw new Error(`${jobId} has an invalid dependency ${dependency}`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (jobId) => {
    if (visiting.has(jobId)) throw new Error("Engine Smoke dependency graph contains a cycle");
    if (visited.has(jobId)) return;
    visiting.add(jobId);
    for (const dependency of graph.get(jobId) ?? []) visit(dependency);
    visiting.delete(jobId);
    visited.add(jobId);
  };
  for (const jobId of known) visit(jobId);

  exactKeys(source.output, ["workingRoot", "masterRoot", "format", "oneImagePerJob", "retainIndividualSources", "automaticAssembly"], "output");
  if (source.output.format !== "png" || source.output.oneImagePerJob !== true || source.output.retainIndividualSources !== true || source.output.automaticAssembly !== false) throw new Error("Engine Smoke output policy drifted");
  if (!source.output.workingRoot.startsWith("working/rally/vfx/engine-smoke/") || !source.output.masterRoot.startsWith("masters/rally/vfx/engine-smoke/")) throw new Error("Engine Smoke output roots drifted");

  exactKeys(source.authority, [...FALSE_AUTHORITY, "namedHumanApprovalRequired"], "authority");
  for (const key of FALSE_AUTHORITY) if (source.authority[key] !== false) throw new Error(`authority.${key} must remain false`);
  if (source.authority.namedHumanApprovalRequired !== true) throw new Error("named human approval must remain required");
  if (canonical(document) !== sourceBefore) throw new Error("validation mutated its input");
  return source;
}

export function compileEngineSmokeSession(document) {
  const spec = validateEngineSmokeSpec(document);
  const specSha256 = sha256(spec);
  const jobs = spec.jobs.map((job, sequence) => ({
    schema: JOB_SCHEMA,
    protocolVersion: PROTOCOL_VERSION,
    jobId: job.id,
    sequence,
    assetId: spec.assetId,
    role: job.role,
    phase: job.phase,
    dependsOn: [...job.dependsOn],
    render: { width: job.width, height: job.height, transparent: true, format: "png", images: 1 },
    prompt: [spec.style.effectLanguage, ...spec.style.surfaceLanguage, ...job.include].join(". "),
    negativePrompt: [...spec.style.forbidden, ...job.exclude].join(", "),
    outputPath: `${spec.output.workingRoot}/${String(sequence + 1).padStart(2, "0")}-${job.id}.png`,
    idempotencyKey: sha256({ specSha256, jobId: job.id, sequence }),
    authority: { providerExecution: false, imageMutation: false, automaticCreativeApproval: false, automaticAssembly: false },
  }));
  const body = {
    schema: SESSION_SCHEMA,
    protocolVersion: PROTOCOL_VERSION,
    assetId: spec.assetId,
    specSha256,
    jobs,
    jobCount: jobs.length,
    roleCounts: { ...EXPECTED_ROLE_COUNTS },
    output: structuredClone(spec.output),
    authority: structuredClone(spec.authority),
  };
  return { ...body, sessionSha256: sha256(body) };
}

export function verifyEngineSmokeSession(document, specification) {
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("session must be an object");
  if (!/^[0-9a-f]{64}$/.test(document.sessionSha256 ?? "")) throw new Error("sessionSha256 is invalid");
  const body = Object.fromEntries(Object.entries(document).filter(([key]) => key !== "sessionSha256"));
  if (sha256(body) !== document.sessionSha256) throw new Error("sessionSha256 does not match the payload");
  const expected = compileEngineSmokeSession(specification);
  if (canonical(expected) !== canonical(document)) throw new Error("session is not the deterministic compilation of the specification");
  return true;
}

async function readJson(path) {
  const { readFile } = await import("node:fs/promises");
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

async function main(argv = process.argv.slice(2)) {
  const [command, input, output] = argv;
  if (command === "compile" && input && output) {
    const session = compileEngineSmokeSession(await readJson(input));
    await writeJson(output, session);
    process.stdout.write(`EVAVO_RALLY_ENGINE_SMOKE_ART_SESSION_READY jobs=${session.jobCount} images=${session.jobCount} provider_execution=false publication=false\n`);
    return;
  }
  if (command === "verify" && input && output) {
    const specification = await readJson(input);
    const session = await readJson(output);
    verifyEngineSmokeSession(session, specification);
    process.stdout.write(`EVAVO_RALLY_ENGINE_SMOKE_ART_SESSION_VERIFIED jobs=${session.jobCount} images=${session.jobCount} provider_execution=false publication=false\n`);
    return;
  }
  throw new Error("Usage: rally-25d-engine-smoke-jobs.mjs <compile|verify> <spec.json> <session.json>");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
