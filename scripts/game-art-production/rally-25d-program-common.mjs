import { createHash } from "node:crypto";

export const REQUEST_SCHEMA = "evavo.rally-art-program-request.v1";
export const PROGRAM_SCHEMA = "evavo.rally-art-program.v1";
export const HANDOFF_SCHEMA = "evavo.rally-art-handoff.v1";
export const PROTOCOL_VERSION = "2026-08-14.1";
export const PROJECT_ID = "isometric-rally-1990s";
export const SHA_PATTERN = /^[0-9a-f]{64}$/u;
export const FAMILIES = new Set(["vehicle", "environment", "structure", "prop", "character", "fauna", "vfx"]);
export const PROFILES = Object.freeze({ vehicle: "rally-vehicle-rig-v1", environment: "rally-environment-kit-v1", structure: "rally-modular-structure-v1", prop: "rally-prop-v1", character: "rally-crowd-character-v1", fauna: "rally-fauna-v1", vfx: "rally-vfx-v1" });
export const ROLES = Object.freeze({ vehicle: ["shape-language", "modeling-reference", "uv-material-reference", "rig-damage-reference"], environment: ["world-composition", "terrain-material-reference", "runtime-shader-reference"], structure: ["modular-modeling-reference", "runtime-shader-reference"], prop: ["prop-modeling-reference", "runtime-shader-reference"], character: ["character-rig-reference", "runtime-shader-reference"], fauna: ["fauna-rig-reference", "runtime-shader-reference"], vfx: ["effect-shape-timing", "runtime-shader-reference"] });
export const BLOCKERS = Object.freeze(["rendered-artifacts-missing", "named-human-art-approval-missing"]);
export const READINESS = Object.freeze({ status: "awaiting-art-production", allHandoffsCompiled: true, renderedArtifactsAdmitted: false, namedHumanApprovalsComplete: false, downstreamProductionReady: false });
const FALSE_KEYS = ["providerExecution", "automaticApproval", "automaticPromotion", "downstreamRepositoryMutation", "runtimeRepositoryMutation", "gitMutation", "deployment", "publication"];
const ID = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/u;

export function fail(message) { throw new Error(`RALLY_25D_ART_PROGRAM_INVALID: ${message}`); }
export function assert(condition, message) { if (!condition) fail(message); }
export function object(value, label) { assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`); return value; }
export function id(value, label) { assert(typeof value === "string" && value.trim() === value && ID.test(value), `${label} must be lowercase kebab-case.`); return value; }
export function text(value, label, min = 2, max = 8000) { assert(typeof value === "string" && value.trim() === value && value.length >= min && value.length <= max, `${label} is invalid.`); return value; }
export function integer(value, label, min = 0, max = 1_000_000) { assert(Number.isInteger(value) && value >= min && value <= max, `${label} is invalid.`); return value; }
export function exact(value, keys, label) { assert(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), `${label} keys drifted.`); }
function sorted(value) { if (Array.isArray(value)) return value.map(sorted); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])])); return value; }
export function canonicalJson(value) { return `${JSON.stringify(sorted(value), null, 2)}\n`; }
export function sha256(value) { return createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonicalJson(value)).digest("hex"); }
export function equal(left, right) { return canonicalJson(left) === canonicalJson(right); }
export function authority(value, label) { const input = object(value, label); exact(input, [...FALSE_KEYS, "namedHumanApprovalRequired"], label); for (const key of FALSE_KEYS) assert(input[key] === false, `${label}.${key} must remain false.`); assert(input.namedHumanApprovalRequired === true, `${label}.namedHumanApprovalRequired must remain true.`); return { providerExecution: false, automaticApproval: false, automaticPromotion: false, downstreamRepositoryMutation: false, runtimeRepositoryMutation: false, gitMutation: false, deployment: false, publication: false, namedHumanApprovalRequired: true }; }
export function bindings(value, label) { const source = value === undefined ? {} : object(value, label); const out = {}; for (const [key, entry] of Object.entries(source)) { assert(/^[A-Za-z][A-Za-z0-9_-]*$/u.test(key), `${label} key ${key} is invalid.`); out[key] = text(entry, `${label}.${key}`, 1, 1600); } return out; }
export function uniqueIds(value, label, max = 64) { assert(Array.isArray(value) && value.length <= max, `${label} must be an array.`); const out = value.map((entry, index) => id(entry, `${label}[${index}]`)); assert(new Set(out).size === out.length, `${label} contains duplicates.`); return out; }
