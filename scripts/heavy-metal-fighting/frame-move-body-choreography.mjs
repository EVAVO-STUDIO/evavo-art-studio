import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCombatPresentationContractFile } from "./combat-presentation-contract.mjs";
import { buildHmfFrameBodyRoleMap } from "./frame-body-role-grammar.mjs";

export const HMF_FRAME_MOVE_BODY_CHOREOGRAPHY_SCHEMA = "evavo.heavy-metal-fighting-frame-move-body-choreography.v1";
export const HMF_FRAME_MOVE_BODY_CHOREOGRAPHY_PROTOCOL_VERSION = "2026-08-12.1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const PRESENTATION_CONTRACT_PATH = path.join(ROOT, "config", "heavy-metal-fighting", "combat-presentation-contract.v1.json");
const FRAME_IDS = Object.freeze(["bastion", "viper", "citadel", "mirage"]);

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_FRAME_MOVE_BODY_CHOREOGRAPHY_INVALID: ${message}`);
}
function assert(condition, message) {
  if (!condition) fail(message);
}
function freeze(value) {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (value && typeof value === "object") Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
function productionBankForMove(move) {
  if (move.category === "reversal") return "reversal";
  if (move.category === "overdrive") return "overdrive";
  if (move.category === "throw") return "throw-attacker";
  return move.plannedProductionBank;
}
function pairedReceiverBank(move) {
  return move.category === "throw" ? "throw-receiver" : null;
}
function isRuntimeImplemented(move) {
  return move.implementationStatus.startsWith("implemented") && (move.runtimeMoveId !== null || move.implementationStatus === "implemented-universal-throw-system");
}
function compactRole(slot) {
  return freeze({
    slot: slot.slot,
    semanticId: slot.semanticId,
    roleId: slot.roleId,
    phase: slot.phase,
    hero: slot.hero,
    contactRole: slot.contactRole,
    holdPriority: slot.holdPriority,
  });
}
function bankRoles(roleMap, bankId, label) {
  const roles = roleMap.slots.filter((slot) => slot.bankId === bankId).map(compactRole);
  assert(roles.length > 0, `${label} resolved no body roles for bank ${bankId}.`);
  const expectedStart = roles[0].slot;
  assert(roles.every((role, index) => role.slot === expectedStart + index), `${label} body roles are not contiguous.`);
  assert(roles.filter((role) => role.hero).length === 1, `${label} body bank ${bankId} must contain exactly one hero role.`);
  return freeze(roles);
}
function choreographyText(move) {
  const choreography = move.choreography ?? {};
  return freeze({
    startupIntent: choreography.startupIntent ?? null,
    heroContact: choreography.heroContact ?? null,
    activeOvershoot: choreography.activeOvershoot ?? null,
    recoveryIntent: choreography.recoveryIntent ?? null,
    legacyPhaseKeys: freeze(Array.isArray(choreography.phaseKeys) ? [...choreography.phaseKeys] : []),
  });
}
function compileMove(frame, move, roleMap) {
  const productionBodyBank = productionBankForMove(move);
  const bodyRoles = bankRoles(roleMap, productionBodyBank, `${frame.id}.${move.id}`);
  const receiverBank = pairedReceiverBank(move);
  const receiverRoles = receiverBank ? bankRoles(roleMap, receiverBank, `${frame.id}.${move.id}.receiver`) : freeze([]);
  const heroRole = bodyRoles.find((role) => role.hero);
  assert(heroRole, `${frame.id}.${move.id} has no hero body role.`);
  const runtimeImplemented = isRuntimeImplemented(move);
  return freeze({
    moveId: move.id,
    publicName: move.publicName,
    category: move.category,
    inputNotation: move.inputNotation,
    runtimeMoveId: move.runtimeMoveId,
    implementationStatus: move.implementationStatus,
    runtimeImplemented,
    hitLevel: move.hitLevel,
    resourceClass: move.resourceClass,
    compatibilitySourceBank: move.sourceBank,
    compatibilityRuntimeBank: move.currentRuntimeBank,
    productionBodyBank,
    productionBodySlotRange: freeze({ start: bodyRoles[0].slot, end: bodyRoles.at(-1).slot, count: bodyRoles.length }),
    heroBodyRole: heroRole,
    bodyRoles,
    pairedReceiverBank: receiverBank,
    pairedReceiverRoles: receiverRoles,
    choreography: choreographyText(move),
    bodyNotes: freeze([...move.bodyNotes]),
    separateEffects: freeze([...move.effects]),
    productionGates: freeze([...move.productionGates]),
    gameTimingReference: move.currentRuntimeTiming ? freeze({ ...move.currentRuntimeTiming }) : null,
    authority: freeze({
      bodyRoleSemantics: true,
      simulationTiming: false,
      hitboxesDamageAndInputs: false,
      runtimeImplementationStatus: false,
      providerExecution: false,
      automaticApproval: false,
      automaticPromotion: false,
      targetRepositoryMutation: false,
    }),
  });
}

export async function buildHmfFrameMoveBodyChoreography(frameIdInput) {
  const frameId = String(frameIdInput ?? "").trim().toLowerCase();
  assert(FRAME_IDS.includes(frameId), `frameId must be one of ${FRAME_IDS.join(", ")}.`);
  const [contract, roleMap] = await Promise.all([
    loadCombatPresentationContractFile(PRESENTATION_CONTRACT_PATH),
    buildHmfFrameBodyRoleMap(frameId),
  ]);
  const frame = contract.frames.find((candidate) => candidate.id === frameId);
  assert(frame, `combat presentation contract is missing Frame ${frameId}.`);
  assert(frame.moves.length === 11, `${frameId} must retain exactly 11 launch moves.`);
  const moves = freeze(frame.moves.map((move) => compileMove(frame, move, roleMap)));
  const byCategory = freeze({
    normals: freeze(moves.filter((move) => ["standing-normal", "crouching-normal", "air-normal"].includes(move.category)).map((move) => move.moveId)),
    specials: freeze(moves.filter((move) => move.category === "special").map((move) => move.moveId)),
    reversal: moves.find((move) => move.category === "reversal")?.moveId ?? null,
    overdrive: moves.find((move) => move.category === "overdrive")?.moveId ?? null,
    throw: moves.find((move) => move.category === "throw")?.moveId ?? null,
  });
  assert(byCategory.normals.length === 6, `${frameId} move choreography must contain six normals.`);
  assert(byCategory.specials.length === 2, `${frameId} move choreography must contain two specials.`);
  assert(byCategory.reversal && byCategory.overdrive && byCategory.throw, `${frameId} move choreography lost reversal, Overdrive or throw.`);
  const namedHighOutput = freeze({
    specialA: moves.find((move) => move.productionBodyBank === "special-a")?.moveId ?? null,
    specialB: moves.find((move) => move.productionBodyBank === "special-b")?.moveId ?? null,
    reversal: byCategory.reversal,
    overdrive: byCategory.overdrive,
  });
  assert(namedHighOutput.specialA && namedHighOutput.specialB && namedHighOutput.reversal && namedHighOutput.overdrive, `${frameId} high-output production bindings are incomplete.`);
  return freeze({
    schema: HMF_FRAME_MOVE_BODY_CHOREOGRAPHY_SCHEMA,
    protocolVersion: HMF_FRAME_MOVE_BODY_CHOREOGRAPHY_PROTOCOL_VERSION,
    projectId: contract.project.id,
    publicTitle: contract.project.publicTitle,
    frameId,
    frameCode: frame.code,
    frameEpithet: frame.epithet,
    pilotId: frame.pilotId,
    motionIdentity: frame.motionIdentity,
    combatPresentationContractSha256: contract.contractSha256,
    roleGrammarSha256: roleMap.grammarSha256,
    roleMapSha256: roleMap.roleMapSha256,
    namedHighOutput,
    byCategory,
    moves,
    authority: freeze({
      bodyRoleSemantics: true,
      simulationTiming: false,
      hitboxesDamageAndInputs: false,
      runtimeImplementationStatus: false,
      workOrderMutation: false,
      providerExecution: false,
      automaticApproval: false,
      automaticPromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      publication: false,
    }),
  });
}

export async function verifyHmfFrameMoveBodyChoreography() {
  const frames = await Promise.all(FRAME_IDS.map((frameId) => buildHmfFrameMoveBodyChoreography(frameId)));
  const moveCount = frames.reduce((sum, frame) => sum + frame.moves.length, 0);
  const runtimeImplementedCount = frames.reduce((sum, frame) => sum + frame.moves.filter((move) => move.runtimeImplemented).length, 0);
  const plannedCount = frames.reduce((sum, frame) => sum + frame.moves.filter((move) => !move.runtimeImplemented).length, 0);
  const check = (id, passed) => freeze({ id, passed });
  const bastion = frames.find((frame) => frame.frameId === "bastion");
  const checks = freeze([
    check("four-frames", frames.length === 4),
    check("44-launch-moves", moveCount === 44),
    check("11-moves-per-frame", frames.every((frame) => frame.moves.length === 11)),
    check("six-normals-per-frame", frames.every((frame) => frame.byCategory.normals.length === 6)),
    check("two-specials-per-frame", frames.every((frame) => frame.byCategory.specials.length === 2)),
    check("named-high-output-per-frame", frames.every((frame) => Object.values(frame.namedHighOutput).every(Boolean))),
    check("standing-heavy-hero-slot", frames.every((frame) => frame.moves.find((move) => move.productionBodyBank === "standing-heavy")?.heroBodyRole.slot === 121)),
    check("reversal-bank", frames.every((frame) => frame.moves.find((move) => move.category === "reversal")?.productionBodyBank === "reversal")),
    check("overdrive-bank", frames.every((frame) => frame.moves.find((move) => move.category === "overdrive")?.productionBodyBank === "overdrive")),
    check("throw-pairing", frames.every((frame) => frame.moves.find((move) => move.category === "throw")?.pairedReceiverRoles.length === 6)),
    check("bastion-redline-bore", bastion?.namedHighOutput.specialA === "redline-bore"),
    check("bastion-anvil-lock", bastion?.namedHighOutput.specialB === "anvil-lock"),
    check("bastion-blow-off", bastion?.namedHighOutput.reversal === "blow-off"),
    check("bastion-kiln-verdict", bastion?.namedHighOutput.overdrive === "kiln-verdict"),
    check("authority-boundary", frames.every((frame) => frame.authority.simulationTiming === false && frame.authority.workOrderMutation === false && frame.authority.targetRepositoryMutation === false)),
  ]);
  const failed = freeze(checks.filter((entry) => !entry.passed));
  return freeze({
    schema: "evavo.heavy-metal-fighting-frame-move-body-choreography-verification.v1",
    status: failed.length ? "failed" : "passed",
    frameCount: frames.length,
    moveCount,
    runtimeImplementedCount,
    plannedCount,
    checks,
    failed,
    frames: freeze(frames.map((frame) => freeze({
      frameId: frame.frameId,
      namedHighOutput: frame.namedHighOutput,
      moveCount: frame.moves.length,
      runtimeImplementedCount: frame.moves.filter((move) => move.runtimeImplemented).length,
      plannedCount: frame.moves.filter((move) => !move.runtimeImplemented).length,
    }))),
  });
}
