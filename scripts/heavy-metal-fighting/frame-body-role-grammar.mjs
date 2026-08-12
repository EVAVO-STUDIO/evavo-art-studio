import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadSpriteProductionCensusFile } from "./sprite-production-census.mjs";

export const HMF_FRAME_BODY_ROLE_GROUP_SCHEMA = "evavo.heavy-metal-fighting-frame-body-role-group.v1";
export const HMF_FRAME_BODY_ROLE_GRAMMAR_SCHEMA = "evavo.heavy-metal-fighting-frame-body-role-grammar.v1";
export const HMF_FRAME_BODY_ROLE_MAP_SCHEMA = "evavo.heavy-metal-fighting-frame-body-role-map.v1";
export const HMF_FRAME_BODY_ROLE_PROTOCOL_VERSION = "2026-08-12.1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CONFIG_ROOT = path.join(ROOT, "config", "heavy-metal-fighting");
const CENSUS_PATH = path.join(CONFIG_ROOT, "sprite-production-census.v1.json");
const BATCH_POLICY_PATH = path.join(CONFIG_ROOT, "batch-production-policy.v1.json");
const REALIZATION_PATH = path.join(CONFIG_ROOT, "frame-body-motion-realization.v1.json");
const GROUP_FILES = Object.freeze([
  ["neutral-locomotion", "neutral-locomotion.v1.json"],
  ["defence-reactions", "defence-reactions.v1.json"],
  ["throws", "throws.v1.json"],
  ["normals", "normals.v1.json"],
  ["specials-overdrive", "specials-overdrive.v1.json"],
  ["core-entrance-result", "core-entrance-result.v1.json"],
]);
const GROUP_ROOT = path.join(CONFIG_ROOT, "frame-body-roles");
const FRAME_IDS = Object.freeze(["bastion", "viper", "citadel", "mirage"]);
const PHASES = new Set(["hold", "loop", "locomotion", "transition", "air", "guard", "startup", "active", "contact", "reaction", "recovery", "system", "entrance", "result"]);
const HOLD_PRIORITIES = new Set(["normal", "short", "medium", "long", "hero"]);
const EXPECTED_MOTION_IDENTITIES = Object.freeze({
  bastion: "hydraulic-weight",
  viper: "razor-snap",
  citadel: "containment-brace",
  mirage: "phase-drift",
});

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_FRAME_BODY_ROLE_GRAMMAR_INVALID: ${message}`);
}
function assert(condition, message) {
  if (!condition) fail(message);
}
function freeze(value) {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (value && typeof value === "object") Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
  return value;
}
function sha256(value) {
  return createHash("sha256").update(`${JSON.stringify(sortObject(value), null, 2)}\n`).digest("hex");
}
function string(value, label) {
  assert(typeof value === "string" && value.trim(), `${label} must be a non-empty string.`);
  return value.trim();
}
function integer(value, label) {
  assert(Number.isInteger(value), `${label} must be an integer.`);
  return value;
}
async function readStableJson(filePath, label) {
  const before = await lstat(filePath);
  assert(before.isFile() && !before.isSymbolicLink(), `${label} must be a regular non-symlink file.`);
  const bytes = await readFile(filePath);
  const after = await lstat(filePath);
  assert(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs, `${label} changed while it was being read.`);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function normalizeRolePair(value, label) {
  assert(Array.isArray(value) && value.length === 2, `${label} must be [roleId, phase].`);
  const roleId = string(value[0], `${label}[0]`);
  const phase = string(value[1], `${label}[1]`);
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(roleId), `${label} roleId must be lowercase kebab-case.`);
  assert(PHASES.has(phase), `${label} has unknown phase ${phase}.`);
  return freeze({ roleId, phase });
}
function normalizeIndices(values, count, label) {
  if (values === undefined) return freeze([]);
  assert(Array.isArray(values), `${label} must be an array.`);
  const result = values.map((value, index) => integer(value, `${label}[${index}]`));
  assert(new Set(result).size === result.length, `${label} contains duplicates.`);
  for (const value of result) assert(value >= 0 && value < count, `${label} index ${value} is outside 0-${count - 1}.`);
  return freeze([...result].sort((a, b) => a - b));
}
function normalizeHold(value, count, label) {
  if (value === undefined) return freeze({});
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  const result = {};
  for (const [rawIndex, rawPriority] of Object.entries(value)) {
    assert(/^\d+$/u.test(rawIndex), `${label} key ${rawIndex} must be a numeric role index.`);
    const index = Number(rawIndex);
    assert(index >= 0 && index < count, `${label} index ${index} is outside 0-${count - 1}.`);
    const priority = string(rawPriority, `${label}.${rawIndex}`);
    assert(HOLD_PRIORITIES.has(priority), `${label}.${rawIndex} has unknown priority ${priority}.`);
    result[index] = priority;
  }
  return freeze(result);
}
function normalizeBankSpec(spec, bank, groupId) {
  assert(spec && typeof spec === "object" && !Array.isArray(spec), `${groupId}.${bank.id} must be an object.`);
  assert(Array.isArray(spec.roles), `${groupId}.${bank.id}.roles must be an array.`);
  assert(spec.roles.length === bank.count, `${groupId}.${bank.id} defines ${spec.roles.length} roles; census requires ${bank.count}.`);
  const roles = freeze(spec.roles.map((entry, index) => normalizeRolePair(entry, `${groupId}.${bank.id}.roles[${index}]`)));
  const hero = integer(spec.hero, `${groupId}.${bank.id}.hero`);
  assert(hero >= 0 && hero < bank.count, `${groupId}.${bank.id}.hero is outside the bank.`);
  const contacts = normalizeIndices(spec.contacts, bank.count, `${groupId}.${bank.id}.contacts`);
  const hold = normalizeHold(spec.hold, bank.count, `${groupId}.${bank.id}.hold`);
  return freeze({ roles, hero, contacts, hold });
}
function normalizeRealization(raw, census) {
  assert(raw?.schema === "evavo.heavy-metal-fighting-frame-body-motion-realization.v1", "motion realization schema drifted.");
  assert(raw.protocolVersion === HMF_FRAME_BODY_ROLE_PROTOCOL_VERSION, "motion realization protocol drifted.");
  assert(raw.projectId === "heavy-metal-fighting", "motion realization project id drifted.");
  assert(raw.frames && typeof raw.frames === "object" && !Array.isArray(raw.frames), "motion realization frames are required.");
  assert(JSON.stringify(Object.keys(raw.frames).sort()) === JSON.stringify([...FRAME_IDS].sort()), "motion realization must define exactly the four launch Frames.");
  const frames = {};
  for (const frameId of FRAME_IDS) {
    const input = raw.frames[frameId];
    assert(input && typeof input === "object" && !Array.isArray(input), `motion realization ${frameId} must be an object.`);
    const motionIdentity = string(input.motionIdentity, `${frameId}.motionIdentity`);
    const cadence = string(input.cadence, `${frameId}.cadence`);
    assert(motionIdentity === EXPECTED_MOTION_IDENTITIES[frameId], `${frameId} motion identity drifted to ${motionIdentity}.`);
    assert(cadence === census.frameVisualEnvelopes[frameId].motionCadence, `${frameId} cadence drifted from sprite census.`);
    assert(Array.isArray(input.bodyRules) && input.bodyRules.length >= 4, `${frameId} requires at least four body rules.`);
    frames[frameId] = freeze({
      motionIdentity,
      cadence,
      bodyRules: freeze(input.bodyRules.map((rule, index) => string(rule, `${frameId}.bodyRules[${index}]`))),
      recoveryRule: string(input.recoveryRule, `${frameId}.recoveryRule`),
      fxSeparation: string(input.fxSeparation, `${frameId}.fxSeparation`),
    });
  }
  assert(raw.authority?.providerExecution === false && raw.authority?.workOrderMutation === false && raw.authority?.targetRepositoryMutation === false, "motion realization gained forbidden authority.");
  return freeze({ frames, authority: freeze(structuredClone(raw.authority)) });
}

export async function loadHmfFrameBodyRoleGrammar() {
  const [census, batchPolicy, realizationRaw, ...groupRaw] = await Promise.all([
    loadSpriteProductionCensusFile(CENSUS_PATH),
    readStableJson(BATCH_POLICY_PATH, "HMF batch production policy"),
    readStableJson(REALIZATION_PATH, "HMF Frame body motion realization"),
    ...GROUP_FILES.map(([, fileName]) => readStableJson(path.join(GROUP_ROOT, fileName), `HMF body role group ${fileName}`)),
  ]);
  assert(batchPolicy?.schema === "evavo.heavy-metal-fighting-batch-production-policy.v1", "batch policy schema drifted.");
  assert(batchPolicy.protocolVersion === HMF_FRAME_BODY_ROLE_PROTOCOL_VERSION, "batch policy protocol drifted.");
  assert(batchPolicy.projectId === "heavy-metal-fighting", "batch policy project id drifted.");
  assert(Array.isArray(batchPolicy.frameAnimationProductionGroups), "batch policy frameAnimationProductionGroups are required.");
  assert(batchPolicy.frameAnimationProductionGroups.length === GROUP_FILES.length, "role grammar group count drifted from batch policy.");

  const bankById = new Map(census.bodyCelBanks.map((bank) => [bank.id, bank]));
  const seenBanks = new Set();
  const groups = [];
  let cursor = 0;
  for (let index = 0; index < GROUP_FILES.length; index += 1) {
    const [expectedId] = GROUP_FILES[index];
    const policyGroup = batchPolicy.frameAnimationProductionGroups[index];
    const raw = groupRaw[index];
    assert(policyGroup.id === expectedId, `batch policy group ${index} must be ${expectedId}.`);
    assert(raw?.schema === HMF_FRAME_BODY_ROLE_GROUP_SCHEMA, `${expectedId} role schema drifted.`);
    assert(raw.protocolVersion === HMF_FRAME_BODY_ROLE_PROTOCOL_VERSION, `${expectedId} role protocol drifted.`);
    assert(raw.projectId === "heavy-metal-fighting" && raw.groupId === expectedId, `${expectedId} role identity drifted.`);
    const count = integer(raw.count, `${expectedId}.count`);
    const start = integer(raw.start, `${expectedId}.start`);
    const end = integer(raw.end, `${expectedId}.end`);
    assert(count === policyGroup.celsPerFrame, `${expectedId} role count ${count} differs from batch-policy count ${policyGroup.celsPerFrame}.`);
    assert(start === cursor && end === start + count - 1, `${expectedId} role range must be ${cursor}-${cursor + count - 1}.`);
    const banks = census.bodyCelBanks.filter((bank) => bank.start >= start && bank.end <= end);
    assert(banks.reduce((sum, bank) => sum + bank.count, 0) === count, `${expectedId} census banks do not fill the group range.`);
    assert(raw.banks && typeof raw.banks === "object" && !Array.isArray(raw.banks), `${expectedId}.banks are required.`);
    assert(JSON.stringify(Object.keys(raw.banks).sort()) === JSON.stringify(banks.map((bank) => bank.id).sort()), `${expectedId} role banks differ from census banks.`);
    const normalizedBanks = {};
    for (const bank of banks) {
      assert(bankById.has(bank.id), `${expectedId} references unknown bank ${bank.id}.`);
      assert(!seenBanks.has(bank.id), `body role bank ${bank.id} is assigned more than once.`);
      seenBanks.add(bank.id);
      normalizedBanks[bank.id] = normalizeBankSpec(raw.banks[bank.id], bank, expectedId);
    }
    groups.push(freeze({ id: expectedId, start, end, count, banks: freeze(normalizedBanks) }));
    cursor = end + 1;
  }
  assert(cursor === census.productionMasterV3.usedBodySlotsPerFrame, `role groups cover 0-${cursor - 1}, expected 0-${census.productionMasterV3.usedBodySlotsPerFrame - 1}.`);
  assert(seenBanks.size === census.bodyCelBanks.length, `role grammar covers ${seenBanks.size} banks, expected ${census.bodyCelBanks.length}.`);
  const realization = normalizeRealization(realizationRaw, census);
  const body = {
    schema: HMF_FRAME_BODY_ROLE_GRAMMAR_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_ROLE_PROTOCOL_VERSION,
    projectId: "heavy-metal-fighting",
    publicTitle: census.project.publicTitle,
    productionContractId: "production_master_v3",
    censusSha256: census.censusSha256,
    slotRange: freeze({ start: 0, end: census.productionMasterV3.usedBodySlotsPerFrame - 1, count: census.productionMasterV3.usedBodySlotsPerFrame }),
    reserveRange: freeze({ start: census.reservedSlots.start, end: census.reservedSlots.end, count: census.reservedSlots.count }),
    groups: freeze(groups),
    frameRealization: realization.frames,
    authority: freeze({
      providerExecution: false,
      automaticApproval: false,
      automaticPromotion: false,
      workOrderMutation: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      publication: false,
    }),
  };
  return freeze({ ...body, grammarSha256: sha256(body) });
}

function roleSpecForBank(grammar, bankId) {
  for (const group of grammar.groups) {
    if (group.banks[bankId]) return group.banks[bankId];
  }
  fail(`role grammar has no bank ${bankId}.`);
}

export async function buildHmfFrameBodyRoleMap(frameIdInput) {
  const frameId = String(frameIdInput ?? "").trim().toLowerCase();
  assert(FRAME_IDS.includes(frameId), `frameId must be one of ${FRAME_IDS.join(", ")}.`);
  const [grammar, census] = await Promise.all([
    loadHmfFrameBodyRoleGrammar(),
    loadSpriteProductionCensusFile(CENSUS_PATH),
  ]);
  const realization = grammar.frameRealization[frameId];
  const slots = [];
  for (const bank of census.bodyCelBanks) {
    const spec = roleSpecForBank(grammar, bank.id);
    for (let roleIndex = 0; roleIndex < bank.count; roleIndex += 1) {
      const slot = bank.start + roleIndex;
      const role = spec.roles[roleIndex];
      slots.push(freeze({
        slot,
        row: Math.floor(slot / census.productionMasterV3.columns),
        column: slot % census.productionMasterV3.columns,
        semanticId: `${bank.id}:${role.roleId}`,
        bankId: bank.id,
        bankPurpose: bank.purpose,
        bankRoleIndex: roleIndex,
        roleId: role.roleId,
        phase: role.phase,
        hero: spec.hero === roleIndex,
        contactRole: spec.contacts.includes(roleIndex),
        holdPriority: spec.hold[roleIndex] ?? "normal",
        frameId,
        motionIdentity: realization.motionIdentity,
        motionCadence: realization.cadence,
        bodyRules: realization.bodyRules,
        recoveryRule: realization.recoveryRule,
        fxSeparation: realization.fxSeparation,
      }));
    }
  }
  assert(slots.length === 224 && slots.every((entry, index) => entry.slot === index), `${frameId} role map must cover slots 0-223 exactly once.`);
  const body = {
    schema: HMF_FRAME_BODY_ROLE_MAP_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_ROLE_PROTOCOL_VERSION,
    projectId: grammar.projectId,
    publicTitle: grammar.publicTitle,
    productionContractId: grammar.productionContractId,
    frameId,
    grammarSha256: grammar.grammarSha256,
    censusSha256: census.censusSha256,
    slots: freeze(slots),
    reservedSlots: freeze(Array.from({ length: census.reservedSlots.count }, (_, index) => census.reservedSlots.start + index)),
    authority: grammar.authority,
  };
  return freeze({ ...body, roleMapSha256: sha256(body) });
}

export async function heavyMetalFightingFrameBodyRole(frameIdInput, slotInput) {
  const slot = Number(slotInput);
  assert(Number.isInteger(slot) && slot >= 0 && slot <= 223, "slot must be an integer from 0 through 223; reserved slots have no production body role.");
  const map = await buildHmfFrameBodyRoleMap(frameIdInput);
  return map.slots[slot];
}

export async function verifyHmfFrameBodyRoleGrammar() {
  const grammar = await loadHmfFrameBodyRoleGrammar();
  const maps = await Promise.all(FRAME_IDS.map((frameId) => buildHmfFrameBodyRoleMap(frameId)));
  const check = (id, passed) => freeze({ id, passed });
  const bastion = maps.find((map) => map.frameId === "bastion");
  const mirage = maps.find((map) => map.frameId === "mirage");
  const checks = [
    check("224-roles-per-frame", maps.every((map) => map.slots.length === 224)),
    check("896-launch-role-bindings", maps.reduce((sum, map) => sum + map.slots.length, 0) === 896),
    check("reserved-unassigned", maps.every((map) => map.slots.every((entry) => entry.slot < 224) && map.reservedSlots[0] === 224 && map.reservedSlots.at(-1) === 255)),
    check("standing-heavy-hero-impact", bastion?.slots[121]?.semanticId === "standing-heavy:hero-impact" && bastion.slots[121].hero === true && bastion.slots[121].contactRole === true),
    check("overdrive-primary-impact", bastion?.slots[184]?.semanticId === "overdrive:super-primary-impact" && bastion.slots[184].holdPriority === "hero"),
    check("system-down-role", bastion?.slots[192]?.semanticId === "system-down:core-zero-warning"),
    check("victory-role", bastion?.slots[212]?.semanticId === "victory:victory-recognition"),
    check("defeat-role", bastion?.slots[223]?.semanticId === "defeat:defeat-loop-bridge"),
    check("bastion-motion-identity", bastion?.slots[0]?.motionIdentity === "hydraulic-weight" && bastion.slots[0].motionCadence === "heavy-held"),
    check("mirage-physical-coherence", mirage?.slots[150]?.motionIdentity === "phase-drift" && mirage.slots[150].fxSeparation.includes("optical echoes")),
    check("read-only-authority", grammar.authority.workOrderMutation === false && grammar.authority.targetRepositoryMutation === false && grammar.authority.providerExecution === false),
  ];
  return freeze({
    schema: "evavo.heavy-metal-fighting-frame-body-role-verification.v1",
    status: checks.every((entry) => entry.passed) ? "passed" : "failed",
    grammarSha256: grammar.grammarSha256,
    frameRoleMapSha256: freeze(Object.fromEntries(maps.map((map) => [map.frameId, map.roleMapSha256]))),
    roleBindings: maps.reduce((sum, map) => sum + map.slots.length, 0),
    checks: freeze(checks),
    failed: freeze(checks.filter((entry) => !entry.passed)),
    authority: grammar.authority,
  });
}
