#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const SPEC_SCHEMA = "evavo.rally-guardrail-visual-development.v1";
export const SESSION_SCHEMA = "evavo.rally-guardrail-provider-job-session.v1";
export const JOB_SCHEMA = "evavo.rally-guardrail-provider-job.v1";
export const PROTOCOL_VERSION = "2026-08-15.5";

const VARIANTS = new Set(["straight", "curve-left", "curve-right", "end-cap"]);
const JOB_VARIANTS = new Set([...VARIANTS, "shared-construction", "shared-curves"]);
const ID = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/u;
const SHA = /^[0-9a-f]{64}$/u;
const SPEC_KEYS = new Set(["schema", "protocolVersion", "assetId", "subjectId", "title", "variants", "style", "cameraLocks", "jobs", "output", "authority"]);
const STYLE_KEYS = new Set(["projectionFamily", "designEra", "rendering", "propLanguage", "palette", "surfaceLanguage", "forbidden"]);
const CAMERA_KEYS = new Set(["heroYawDegrees", "heroPitchDegrees", "orthographicPitchDegrees", "topPlanPitchDegrees", "focalLengthMm", "consistentBeamHeight", "consistentPostSpacing", "consistentModuleLength", "consistentEndConnections"]);
const JOB_KEYS = new Set(["id", "role", "variant", "view", "phase", "width", "height", "transparent", "dependsOn", "include", "exclude"]);
const OUTPUT_KEYS = new Set(["workingRoot", "masterRoot", "format", "oneImagePerJob", "retainIndividualSources", "automaticAssembly"]);
const AUTHORITY_FALSE = ["providerExecution", "automaticGenerationAuthorization", "automaticCreativeApproval", "imageMutation", "automaticAssembly", "targetRepositoryMutation", "gitMutation", "deployment", "publication"];
const REQUIRED_ROLES = new Set(["identity-master", "variant-identity", "modular-modeling-reference", "runtime-shader-reference", "breakable-damage-reference"]);

function fail(message) { throw new Error(`RALLY_GUARDRAIL_ART_JOBS_INVALID: ${message}`); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys, label) {
  if (!isObject(value)) fail(`${label} must be an object.`);
  const unknown = Object.keys(value).filter((key) => !keys.has(key)).sort();
  const missing = [...keys].filter((key) => !Object.hasOwn(value, key)).sort();
  if (unknown.length) fail(`${label} contains unsupported keys: ${unknown.join(", ")}.`);
  if (missing.length) fail(`${label} is missing keys: ${missing.join(", ")}.`);
}
function text(value, label, min = 1, max = 8000) {
  if (typeof value !== "string" || value.trim() !== value || value.length < min || value.length > max) fail(`${label} must be a trimmed string with ${min}-${max} characters.`);
  if ([...value].some((character) => character.charCodeAt(0) < 32)) fail(`${label} contains control characters.`);
  return value;
}
function id(value, label) { const result = text(value, label, 1, 180); if (!ID.test(result)) fail(`${label} must be lowercase kebab-case.`); return result; }
function finite(value, label, min, max) { if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) fail(`${label} must be a finite number between ${min} and ${max}.`); return value; }
function bool(value, label) { if (typeof value !== "boolean") fail(`${label} must be boolean.`); return value; }
function strings(value, label, min = 0, max = 64) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${label} must contain ${min}-${max} strings.`);
  const result = value.map((entry, index) => text(entry, `${label}[${index}]`, 1, 1200));
  if (new Set(result).size !== result.length) fail(`${label} contains duplicates.`);
  return result;
}
function safeRoot(value, label) {
  const root = text(value, label, 3, 500);
  if (root.startsWith("/") || root.includes("\\") || root.split("/").some((part) => ["", ".", ".."].includes(part))) fail(`${label} must be a safe relative POSIX path.`);
  return root;
}
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
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
  for (const job of jobs) {
    for (const dependency of job.dependsOn) {
      if (!byId.has(dependency)) fail(`job ${job.id} references unknown dependency ${dependency}.`);
      if (dependency === job.id) fail(`job ${job.id} depends on itself.`);
      consumers.get(dependency).push(job.id);
    }
  }
  const ready = jobs.filter((job) => indegree.get(job.id) === 0).map((job) => job.id);
  ready.sort((a, b) => byId.get(a).index - byId.get(b).index || a.localeCompare(b));
  const ordered = [];
  while (ready.length) {
    const current = ready.shift();
    ordered.push(byId.get(current).job);
    for (const consumer of consumers.get(current)) {
      indegree.set(consumer, indegree.get(consumer) - 1);
      if (indegree.get(consumer) === 0) {
        ready.push(consumer);
        ready.sort((a, b) => byId.get(a).index - byId.get(b).index || a.localeCompare(b));
      }
    }
  }
  if (ordered.length !== jobs.length) fail("job dependency graph contains a cycle.");
  return ordered;
}

export function validateGuardrailSpec(input) {
  const source = structuredClone(input);
  exact(source, SPEC_KEYS, "spec");
  if (source.schema !== SPEC_SCHEMA || source.protocolVersion !== PROTOCOL_VERSION) fail("spec identity drifted.");
  id(source.assetId, "assetId"); id(source.subjectId, "subjectId"); text(source.title, "title", 3, 300);
  if (!Array.isArray(source.variants) || source.variants.length !== 4 || new Set(source.variants).size !== 4 || source.variants.some((variant) => !VARIANTS.has(variant))) fail("variants must equal the four governed guardrail modules.");

  exact(source.style, STYLE_KEYS, "style");
  id(source.style.projectionFamily, "style.projectionFamily"); id(source.style.designEra, "style.designEra"); id(source.style.rendering, "style.rendering");
  text(source.style.propLanguage, "style.propLanguage", 40, 1600);
  const palette = strings(source.style.palette, "style.palette", 6, 16);
  for (const [index, colour] of palette.entries()) if (!/^#[0-9a-fA-F]{6}$/u.test(colour)) fail(`style.palette[${index}] must be a six-digit hex colour.`);
  strings(source.style.surfaceLanguage, "style.surfaceLanguage", 5, 20); strings(source.style.forbidden, "style.forbidden", 8, 32);

  exact(source.cameraLocks, CAMERA_KEYS, "cameraLocks");
  finite(source.cameraLocks.heroYawDegrees, "cameraLocks.heroYawDegrees", -180, 180);
  finite(source.cameraLocks.heroPitchDegrees, "cameraLocks.heroPitchDegrees", 0, 89)²È="24‰½¹Í¥ÍÑ•¹Ñ¹‘½¹¹•Ñ¥½¹Ì‰t¤¥˜€¡‰½½°¡Í½ÕÉ”¹…µ•É…1½­Ím­•åt°…µ•É…1½­Ì¸‘í­•åõ€¤€„ôôÑÉÕ”¤™…¥°¡…µ•É…1½­Ì¸‘í­•åôµÕÍÐÉ•µ…¥¸ÑÉÕ”¹€¤ì((€•á…Ð¡Í½ÕÉ”¹½ÕÑÁÕÐ°=UQAUQ}-eL°€‰½ÕÑÁÕÐˆ¤ìÍ…™•I½½Ð¡Í½ÕÉ”¹½ÕÑÁÕÐ¹Ý½É­¥¹I½½Ð°€‰½ÕÑÁÕÐ¹Ý½É­¥¹I½½Ðˆ¤ìÍ…™•I½½Ð¡Í½ÕÉ”¹½ÕÑÁÕÐ¹µ…ÍÑ•ÉI½½Ð°€‰½ÕÑÁÕÐ¹µ…ÍÑ•ÉI½½Ðˆ¤ì(€¥˜€¡Í½ÕÉ”¹½ÕÑÁÕÐ¹™½Éµ…Ð€„ôô€‰Á¹œˆñðÍ½ÕÉ”¹½ÕÑÁÕÐ¹½¹•%µ…•A•É)½ˆ€„ôôÑÉÕ”ñðÍ½ÕÉ”¹½ÕÑÁÕÐ¹É•Ñ…¥¹%¹‘¥Ù¥‘Õ…±M½ÕÉ•Ì€„ôôÑÉÕ”ñðÍ½ÕÉ”¹½ÕÑÁÕÐ¹…ÕÑ½µ…Ñ¥ÍÍ•µ‰±ä€„ôô™…±Í”¤™…¥° ‰½ÕÑÁÕÐ½¹ÑÉ…Ð‘É¥™Ñ•¸ˆ¤ì(€Ù…±¥‘…Ñ•ÕÑ¡½É¥Ñä¡Í½ÕÉ”¹…ÕÑ¡½É¥Ñä¤ì((€¥˜€ …ÉÉ…ä¹¥ÍÉÉ…ä¡Í½ÕÉ”¹©½‰Ì¤ñðÍ½ÕÉ”¹©½‰Ì¹±•¹Ñ €„ôô€ÄÈ¤™…¥° ‰©½‰ÌµÕÍÐ½¹Ñ…¥¸•á…Ñ±äÑÝ•±Ù”½¹”µ¥µ…”©½‰Ì¸ˆ¤ì(€½¹ÍÐ¥‘Ì€ô¹•ÜM•Ð ¤ì(€½¹ÍÐ©½‰Ì€ôÍ½ÕÉ”¹©½‰Ì¹µ…À ¡É…Ü°¥¹‘•à¤€ôøì(€€€•á…Ð¡É…Ü°)=	}-eL°©½‰Íl‘í¥¹‘•áõu€¤ì(€€€½¹ÍÐ©½‰%€ô¥¡É…Ü¹¥°©½‰Íl‘í¥¹‘•áõt¹¥‘€¤ì¥˜€¡¥‘Ì¹¡…Ì¡©½‰%¤¤™…¥°¡‘ÕÁ±¥…Ñ”©½ˆ¥€‘í©½‰%‘ô¹€¤ì¥‘Ì¹…‘¡©½‰%¤ì(€€€½¹ÍÐÉ½±”€ô¥¡É…Ü¹É½±”°©½‰Íl‘í¥¹‘•áõt¹É½±•€¤ì½¹ÍÐÙ…É¥…¹Ð€ô¥¡É…Ü¹Ù…É¥…¹Ð°©½‰Íl‘í¥¹‘•áõt¹Ù…É¥…¹Ñ€¤ì¥˜€ …)=	}YI%9QL¹¡…Ì¡Ù…É¥…¹Ð¤¤™…¥°¡©½‰Íl‘í¥¹‘•áõt¹Ù…É¥…¹Ð¥ÌÕ¹ÍÕÁÁ½ÉÑ•¹€¤ì(€€€¥¡É…Ü¹Ù¥•Ü°©½‰Íl‘í¥¹‘•áõt¹Ù¥•Ý€¤ì¥¡É…Ü¹Á¡…Í”°©½‰Íl‘í¥¹‘•áõt¹Á¡…Í•€¤ì(€€€¥˜€ …9Õµ‰•È¹¥Í%¹Ñ••È¡É…Ü¹Ý¥‘Ñ ¤ñðÉ…Ü¹Ý¥‘Ñ €„ôô€ÈÀÐàñð€…9Õµ‰•È¹¥Í%¹Ñ••È¡É…Ü¹¡•¥¡Ð¤ñðÉ…Ü¹¡•¥¡Ð€„ôô€ÈÀÐà¤™…¥°¡©½‰Íl‘í¥¹‘•áõtµÕÍÐ‰”€ÈÀÐáàÈÀÐà¹€¤ì(€€€‰½½°¡É…Ü¹ÑÉ…¹ÍÁ…É•¹Ð°©½‰Íl‘í¥¹‘•áõt¹ÑÉ…¹ÍÁ…É•¹Ñ€¤ì(€€€½¹ÍÐ‘•Á•¹‘Í=¸€ôÍÑÉ¥¹Ì¡É…Ü¹‘•Á•¹‘Í=¸°©½‰Íl‘í¥¹‘•áõt¹‘•Á•¹‘Í=¹€¤¹µ…À ¡•¹ÑÉä¤€ôø¥¡•¹ÑÉä°©½‰Íl‘í¥¹‘•áõt¹‘•Á•¹‘Í=¹€¤¤ì(€€€½¹ÍÐ¥¹±Õ‘”€ôÍÑÉ¥¹Ì¡É…Ü¹¥¹±Õ‘”°©½‰Íl‘í¥¹‘•áõt¹¥¹±Õ‘•€°€Ì°€ÈÐ¤ì½¹ÍÐ•á±Õ‘”€ôÍÑÉ¥¹Ì¡É…Ü¹•á±Õ‘”°©½‰Íl‘í¥¹‘•áõt¹•á±Õ‘•€°€Ì°€ÈÐ¤ì(€€€¥˜€¡l¸¸¹¥¹±Õ‘”°€¸¸¹•á±Õ‘•t¹Í½µ” ¡•¹ÑÉä¤€ôø€½½¹Ñ…ÑqÌ©Í¡••ÑñµÕ±Ñ¥l´uÁ…¹•±ñÉ¥½˜½¤¹Ñ•ÍÐ¡•¹ÑÉä¤¤€˜˜¥¹±Õ‘”¹Í½µ” ¡•¹ÑÉä¤€ôø€½½¹Ñ…ÑqÌ©Í¡••ÑñµÕ±Ñ¥l´uÁ…¹•±ñÉ¥½˜½¤¹Ñ•ÍÐ¡•¹ÑÉä¤¤¤™…¥°¡©½‰Íl‘í¥¹‘•áõtÉ•ÅÕ•ÍÑÌ„™½É‰¥‘‘•¸½µ‰¥¹•±…å½ÕÐ¹€¤ì(€€€É•ÑÕÉ¸ì€¸¸¹É…Ü°¥è©½‰%°É½±”°Ù…É¥…¹Ð°‘•Á•¹‘Í=¸°¥¹±Õ‘”°•á±Õ‘”ôì(€ô¤ì(€Ñ½Á½±½¥…°¡©½‰Ì¤ì(€½¹ÍÐÉ½±•Ì€ô¹•ÜM•Ð¡©½‰Ì¹µ…À ¡©½ˆ¤€ôø©½ˆ¹É½±”¤¤ì™½È€¡½¹ÍÐÉ½±”½˜IEU%I}I=1L¤¥˜€ …É½±•Ì¹¡…Ì¡É½±”¤¤™…¥°¡©½ˆÉ½±”±½ÍÕÉ”¥Ìµ¥ÍÍ¥¹œ€‘íÉ½±•ô¹€¤ì(€¥˜€¡©½‰Ì¹™¥±Ñ•È ¡©½ˆ¤€ôø©½ˆ¹É½±”€ôôô€‰µ½‘Õ±…Èµµ½‘•±¥¹œµÉ•™•É•¹”ˆ¤¹±•¹Ñ €„ôô€Ð¤™…¥° ‰Õ…É‘É…¥°É•ÅÕ¥É•Ì•á…Ñ±ä™½ÕÈµ½‘•±¥¹œÉ•™•É•¹•Ì¸ˆ¤ì(€¥˜€¡©½‰Ì¹™¥±Ñ•È ¡©½ˆ¤€ôø©½ˆ¹É½±”€ôôô€‰‰É•…­…‰±”µ‘…µ…”µÉ•™•É•¹”ˆ¤¹±•¹Ñ €„ôô€Ì¤™…¥° ‰Õ…É‘É…¥°É•ÅÕ¥É•Ì•á…Ñ±äÑ¡É•”‘…µ…”É•™•É•¹•Ì¸ˆ¤ì(€™½È€¡½¹ÍÐÙ…É¥…¹Ð½˜YI%9QL¤¥˜€ …©½‰Ì¹Í½µ” ¡©½ˆ¤€ôø©½ˆ¹Ù…É¥…¹Ð€ôôôÙ…É¥…¹Ð€˜˜l‰¥‘•¹Ñ¥Ñäµµ…ÍÑ•Èˆ°€‰Ù…É¥…¹Ðµ¥‘•¹Ñ¥Ñä‰t¹¥¹±Õ‘•Ì¡©½ˆ¹É½±”¤¤¤™…¥°¡¥‘•¹Ñ¥Ñä±½ÍÕÉ”¥Ìµ¥ÍÍ¥¹œ€‘íÙ…É¥…¹Ñô¹€¤ì(€É•ÑÕÉ¸Í½ÕÉ”ì)ô()™Õ¹Ñ¥½¸ÁÉ½µÁÐ¡ÍÁ•Œ°©½ˆ¤ì(€É•ÑÕÉ¸l(€€€É•…Ñ”•á…Ñ±ä½¹”¥µ…”™½È€‘íÍÁ•Œ¹Ñ¥Ñ±•ô¹€°(€€€ÍÍ•Ð¥‘•¹Ñ¥Ñäè€‘íÍÁ•Œ¹ÍÕ‰©•Ñ%‘ôìµ½‘Õ±”è€‘í©½ˆ¹Ù…É¥…¹Ñôì©½ˆè€‘í©½ˆ¹¥‘ôìÉ½±”è€‘í©½ˆ¹É½±•ôìÙ¥•Üè€‘í©½ˆ¹Ù¥•Ýô¹€°(€€€Y¥ÍÕ…°Ñ…É•Ðè€‘íÍÁ•Œ¹ÍÑå±”¹‘•Í¥¹É…ôì€‘íÍÁ•Œ¹ÍÑå±”¹É•¹‘•É¥¹ôì€‘íÍÁ•Œ¹ÍÑå±”¹ÁÉ½Á1…¹Õ…•õ€°(€€€AÉ½©•Ñ¥½¸è€‘íÍÁ•Œ¹ÍÑå±”¹ÁÉ½©•Ñ¥½¹…µ¥±åô¸AÉ•Í•ÉÙ”‰•…´¡•¥¡Ð°Á½ÍÐÍÁ…¥¹œ°µ½‘Õ±”±•¹Ñ °½¹¹•Ñ¥½¸•¹‘Ì°Á…±•ÑÑ”…¹½¹ÍÑÉÕÑ¥½¸¥‘•¹Ñ¥Ñä•ÍÑ…‰±¥Í¡•‰ä‘•Á•¹‘•¹¥•Ì¹€°(€€€%¹±Õ‘”è€‘í©½ˆ¹¥¹±Õ‘”¹©½¥¸ ˆì€ˆ¥ô¹€°(€€€Ù½¥è€‘íl¸¸¹ÍÁ•Œ¹ÍÑå±”¹™½É‰¥‘‘•¸°€¸¸¹©½ˆ¹•á±Õ‘•t¹©½¥¸ ˆì€ˆ¥ô¹€°(€€€=ÕÑÁÕÐ½¹”€‘í©½ˆ¹Ý¥‘Ñ¡õà‘í©½ˆ¹¡•¥¡ÑôA9‘í©½ˆ¹ÑÉ…¹ÍÁ…É•¹Ð€ü€ˆÝ¥Ñ ÑÉÕ”ÑÉ…¹ÍÁ…É•¹Ð‰…­É½Õ¹ˆ€è€ˆ…Ì½¹”½¡•É•¹Ðµ…Ñ•É¥…°Ù¥•Ü‰ô¸9¼±…‰•±Ì°½¹Ñ…ÐÍ¡••Ð°É¥½ÈÕ¹É•±…Ñ•Í•½¹ÁÉ½À¹€°(€t¹©½¥¸ ‰q¸ˆ¤ì)ô()•áÁ½ÉÐ™Õ¹Ñ¥½¸½µÁ¥±•Õ…É‘É…¥±M•ÍÍ¥½¸¡¥¹ÁÕÐ¤ì(€½¹ÍÐÍÁ•Œ€ôÙ…±¥‘…Ñ•Õ…É‘É…¥±MÁ•Œ¡¥¹ÁÕÐ¤ì½¹ÍÐÍÁ•M¡„ÈÔØ€ôÍ¡„ÈÔØ¡ÍÁ•Œ¤ì½¹ÍÐ½É‘•É•€ôÑ½Á½±½¥…°¡ÍÁ•Œ¹©½‰Ì¤ì(€½¹ÍÐ©½‰Ì€ô½É‘•É•¹µ…À ¡©½ˆ°Í•ÅÕ•¹”¤€ôøì(€€€½¹ÍÐ‰½‘ä€ôì(€€€€€Í¡•µ„è)=	}M!5°ÁÉ½Ñ½½±Y•ÉÍ¥½¸èAI=Q==1}YIM%=8°Í•ÅÕ•¹”°…ÍÍ•Ñ%èÍÁ•Œ¹…ÍÍ•Ñ%°ÍÕ‰©•Ñ%èÍÁ•Œ¹ÍÕ‰©•Ñ%°(€€€€€©½‰%è©½ˆ¹¥°Á¡…Í”è©½ˆ¹Á¡…Í”°É½±”è©½ˆ¹É½±”°Ù…É¥…¹Ðè©½ˆ¹Ù…É¥…¹Ð°Ù¥•Üè©½ˆ¹Ù¥•Ü°(€€€€€½Á•É…Ñ¥½¸è€‰•¹•É…Ñ”ˆ°¥µ…•Ìè€Ä°…¹‘¥‘…Ñ•½Õ¹Ðè€Ä°(€€€€€Ñ…É•ÐèìÝ¥‘Ñ è©½ˆ¹Ý¥‘Ñ °¡•¥¡Ðè©½ˆ¹¡•¥¡Ð°™½Éµ…Ðè€‰Á¹œˆ°ÑÉ…¹ÍÁ…É•¹Ñ	…­É½Õ¹è©½ˆ¹ÑÉ…¹ÍÁ…É•¹Ðô°(€€€€€‘•Á•¹‘•¹¥•Ìèl¸¸¹©½ˆ¹‘•Á•¹‘Í=¹t°ÁÉ½µÁÐèÁÉ½µÁÐ¡ÍÁ•Œ°©½ˆ¤°(€€€€€½ÕÑÁÕÐèìÝ½É­¥¹œè€‘íÍÁ•Œ¹½ÕÑÁÕÐ¹Ý½É­¥¹I½½Ñô¼‘í©½ˆ¹¥‘ô¹Á¹€°µ…ÍÑ•Èè€‘íÍÁ•Œ¹½ÕÑÁÕÐ¹µ…ÍÑ•ÉI½½Ñô¼‘í©½ˆ¹¥‘ô¹Á¹€ô°(€€€€€¥‘•µÁ½Ñ•¹å-•äèÍ¡„ÈÔØ¡ìÍÁ•M¡„ÈÔØ°©½‰%è©½ˆ¹¥°‘•Á•¹‘•¹¥•Ìè©½ˆ¹‘•Á•¹‘Í=¸ô¤°(€€€€€…ÕÑ¡½É¥ÑäèìÁÉ½Ù¥‘•Éá•ÕÑ¥½¸è™…±Í”°…ÕÑ½µ…Ñ¥ÁÁÉ½Ù…°è™…±Í”°¥µ…•5ÕÑ…Ñ¥½¸è™…±Í”°…ÕÑ½µ…Ñ¥ÍÍ•µ‰±äè™…±Í”°É•Á½Í¥Ñ½Éå5ÕÑ…Ñ¥½¸è™…±Í”°¥Ñ5ÕÑ…Ñ¥½¸è™…±Í”°‘•Á±½åµ•¹Ðè™…±Í”°ÁÕ‰±¥…Ñ¥½¸è™…±Í”°¹…µ•‘!Õµ…¹ÁÁÉ½Ù…±I•ÅÕ¥É•èÑÉÕ”ô°(€€€ôì(€€€É•ÑÕÉ¸ì€¸¸¹‰½‘ä°©½‰M¡„ÈÔØèÍ¡„ÈÔØ¡‰½‘ä¤ôì(€ô¤ì(€½¹ÍÐ‰½‘ä€ôì(€€€Í¡•µ„èMMM%=9}M!5°ÁÉ½Ñ½½±Y•ÉÍ¥½¸èAI=Q==1}YIM%=8°Í•ÍÍ¥½¹%è€‘íÍÁ•Œ¹…ÍÍ•Ñ%‘ôµÙ¥ÍÕ…°µ‘•Ù•±½Áµ•¹ÐµØÅ€°…ÍÍ•Ñ%èÍÁ•Œ¹…ÍÍ•Ñ%°ÍÕ‰©•Ñ%èÍÁ•Œ¹ÍÕ‰©•Ñ%°(€€€ÍÁ•M¡„ÈÔØ°ÍÁ•Œ°©½‰Ì°(€€€Ñ½Ñ…±Ìèì©½‰Ìè©½‰Ì¹±•¹Ñ °¥µ…•Ìè©½‰Ì¹±•¹Ñ °Ù…É¥…¹ÑÌèÍÁ•Œ¹Ù…É¥…¹ÑÌ¹±•¹Ñ °µ½‘•±¥¹)½‰Ìè©½‰Ì¹™¥±Ñ•È ¡©½ˆ¤€ôø©½ˆ¹É½±”€ôôô€‰µ½‘Õ±…Èµµ½‘•±¥¹œµÉ•™•É•¹”ˆ¤¹±•¹Ñ °‘…µ…•)½‰Ìè©½‰Ì¹™¥±Ñ•È ¡©½ˆ¤€ôø©½ˆ¹É½±”€ôôô€‰‰É•…­…‰±”µ‘…µ…”µÉ•™•É•¹”ˆ¤¹±•¹Ñ °ÑÉ…¹ÍÁ…É•¹Ñ)½‰Ìè©½‰Ì¹™¥±Ñ•È ¡©½ˆ¤€ôø©½ˆ¹Ñ…É•Ð¹ÑÉ…¹ÍÁ…É•¹Ñ	…­É½Õ¹¤¹±•¹Ñ ô°(€€€É•…‘¥¹•ÍÌèìÍÑ…ÑÕÌè€‰ÁÉ½Ù¥‘•Èµ©½‰Ìµ½µÁ¥±•ˆ°ÁÉ½Ù¥‘•Éá•ÕÑ¥½¹I•ÅÕ¥É•èÑÉÕ”°¹…µ•‘!Õµ…¹ÁÁÉ½Ù…±I•ÅÕ¥É•èÑÉÕ”°‘½Ý¹ÍÑÉ•…´ÍI•…‘äè™…±Í”ô°(€€€…ÕÑ¡½É¥ÑäèÍÑÉÕÑÕÉ•‘±½¹”¡ÍÁ•Œ¹…ÕÑ¡½É¥Ñä¤°(€ôì(€É•ÑÕÉ¸ì€¸¸¹‰½‘ä°Í•ÍÍ¥½¹M¡„ÈÔØèÍ¡„ÈÔØ¡‰½‘ä¤ôì)ô()•áÁ½ÉÐ™Õ¹Ñ¥½¸Ù•É¥™åÕ…É‘É…¥±M•ÍÍ¥½¸¡Í•ÍÍ¥½¸¤ì(€¥˜€ …¥Í=‰©•Ð¡Í•ÍÍ¥½¸¤ñðÍ•ÍÍ¥½¸¹Í¡•µ„€„ôôMMM%=9}M!5ñðÍ•ÍÍ¥½¸¹ÁÉ½Ñ½½±Y•ÉÍ¥½¸€„ôôAI=Q==1}YIM%=8¤™…¥° ‰Í•ÍÍ¥½¸¥‘•¹Ñ¥Ñä‘É¥™Ñ•¸ˆ¤ì(€¥˜€¡ÑåÁ•½˜Í•ÍÍ¥½¸¹Í•ÍÍ¥½¹M¡„ÈÔØ€„ôô€‰ÍÑÉ¥¹œˆñð€…M!¹Ñ•ÍÐ¡Í•ÍÍ¥½¸¹Í•ÍÍ¥½¹M¡„ÈÔØ¤¤™…¥° ‰Í•ÍÍ¥½¹M¡„ÈÔØ¥Ì¥¹Ù…±¥¸ˆ¤ì(€½¹ÍÐ‰½‘ä€ô=‰©•Ð¹™É½µ¹ÑÉ¥•Ì¡=‰©•Ð¹•¹ÑÉ¥•Ì¡Í•ÍÍ¥½¸¤¹™¥±Ñ•È ¡m­•åt¤€ôø­•ä€„ôô€‰Í•ÍÍ¥½¹M¡„ÈÔØˆ¤¤ì(€¥˜€¡Í¡„ÈÔØ¡‰½‘ä¤€„ôôÍ•ÍÍ¥½¸¹Í•ÍÍ¥½¹M¡„ÈÔØ¤™…¥° ‰Í•ÍÍ¥½¹M¡„ÈÔØ‘½•Ì¹½Ðµ…Ñ Ñ¡”ÍÕ‰µ¥ÑÑ•Á…å±½…¸ˆ¤ì(€½¹ÍÐ•áÁ•Ñ•€ô½µÁ¥±•Õ…É‘É…¥±M•ÍÍ¥½¸¡Í•ÍÍ¥½¸¹ÍÁ•Œ¤ì(€¥˜€¡…¹½¹¥…±)Í½¸¡•áÁ•Ñ•¤€„ôô…¹½¹¥…±)Í½¸¡Í•ÍÍ¥½¸¤¤™…¥° ‰Í•ÍÍ¥½¸¥Ì¹½ÐÑ¡”‘•Ñ•Éµ¥¹¥ÍÑ¥Œ½µÁ¥±…Ñ¥½¸½˜¥ÑÌÉ•Ñ…¥¹•ÍÁ•Œ¸ˆ¤ì(€É•ÑÕÉ¸ÑÉÕ”ì)ô()…Íå¹Œ™Õ¹Ñ¥½¸µ…¥¸ ¤ì(€½¹ÍÐm½µµ…¹°¥¹ÁÕÑA…Ñ °€¸¸¹É•ÍÑt€ôÁÉ½•ÍÌ¹…ÉØ¹Í±¥” È¤ì½¹ÍÐ½ÕÑÁÕÑ%¹‘•à€ôÉ•ÍÐ¹¥¹‘•á=˜ ˆ´µ½ÕÑÁÕÐˆ¤ì½¹ÍÐ½ÕÑÁÕÑA…Ñ €ô½ÕÑÁÕÑ%¹‘•à€øô€À€üÉ•ÍÑm½ÕÑÁÕÑ%¹‘•à€¬€Åt€èÕ¹‘•™¥¹•ì(€¥˜€ …l‰½µÁ¥±”ˆ°€‰Ù•É¥™ä‰t¹¥¹±Õ‘•Ì¡½µµ…¹¤ñð€…¥¹ÁÕÑA…Ñ ¤™…¥° ‰UÍ…”èÉ…±±ä´ÈÕµÕ…É‘É…¥°µ©½‰Ì¹µ©Ì€ñ½µÁ¥±•ñÙ•É¥™äø€ñ¥¹ÁÕÐ¹©Í½¸øl´µ½ÕÑÁÕÐ½ÕÑÁÕÐ¹©Í½¹tˆ¤ì(€½¹ÍÐ¥¹ÁÕÐ€ô)M=8¹Á…ÉÍ”¡…Ý…¥ÐÉ•…‘¥±”¡¥¹ÁÕÑA…Ñ °€‰ÕÑ˜àˆ¤¤ì(€½¹ÍÐÉ•ÍÕ±Ð€ô½µµ…¹€ôôô€‰½µÁ¥±”ˆ€ü½µÁ¥±•Õ…É‘É…¥±M•ÍÍ¥½¸¡¥¹ÁÕÐ¤€èìÙ…±¥èÙ•É¥™åÕ…É‘É…¥±M•ÍÍ¥½¸¡¥¹ÁÕÐ¤°Í•ÍÍ¥½¹%è¥¹ÁÕÐ¹Í•ÍÍ¥½¹%°Í•ÍÍ¥½¹M¡„ÈÔØè¥¹ÁÕÐ¹Í•ÍÍ¥½¹M¡„ÈÔØ°©½‰Ìè¥¹ÁÕÐ¹Ñ½Ñ…±Ì¹©½‰Ì°¥µ…•Ìè¥¹ÁÕÐ¹Ñ½Ñ…±Ì¹¥µ…•Ì°Ù…É¥…¹ÑÌè¥¹ÁÕÐ¹Ñ½Ñ…±Ì¹Ù…É¥…¹ÑÌ°µ½‘•±¥¹)½‰Ìè¥¹ÁÕÐ¹Ñ½Ñ…±Ì¹µ½‘•±¥¹)½‰Ì°‘…µ…•)½‰Ìè¥¹ÁÕÐ¹Ñ½Ñ…±Ì¹‘…µ…•)½‰Ì°½¹•%µ…•A•É)½ˆè¥¹ÁÕÐ¹Ñ½Ñ…±Ì¹¥µ…•Ì€ôôô¥¹ÁÕÐ¹Ñ½Ñ…±Ì¹©½‰Ì°ÁÉ½Ù¥‘•Éá•ÕÑ¥½¸è™…±Í”ôì(€½¹ÍÐÉ•¹‘•É•€ô€‘í)M=8¹ÍÑÉ¥¹¥™ä¡É•ÍÕ±Ð°¹Õ±°°€È¥õq¹€ì¥˜€¡½ÕÑÁÕÑA…Ñ ¤…Ý…¥ÐÝÉ¥Ñ•¥±”¡½ÕÑÁÕÑA…Ñ °É•¹‘•É•°€‰ÕÑ˜àˆ¤ìÁÉ½•ÍÌ¹ÍÑ‘½ÕÐ¹ÝÉ¥Ñ”¡É•¹‘•É•¤ì)ô()¥˜€¡ÁÉ½•ÍÌ¹…ÉÙlÅt€˜˜Á…Ñ ¹É•Í½±Ù”¡ÁÉ½•ÍÌ¹…ÉÙlÅt¤€ôôô™¥±•UI1Q½A…Ñ ¡¥µÁ½ÉÐ¹µ•Ñ„¹ÕÉ°¤¤µ…¥¸ ¤¹…Ñ  ¡•ÉÉ½È¤€ôøìÁÉ½•ÍÌ¹ÍÑ‘•ÉÈ¹ÝÉ¥Ñ”¡€‘í•ÉÉ½È¥¹ÍÑ…¹•½˜ÉÉ½È€ü•ÉÉ½È¹µ•ÍÍ…”€èMÑÉ¥¹œ¡•ÉÉ½È¥õq¹€¤ìÁÉ½•ÍÌ¹•á¥Ñ½‘”€ô€Äìô¤ì(