import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

export const COMBAT_PRESENTATION_SCHEMA = "evavo.heavy-metal-fighting-combat-presentation-contract.v1";
export const COMBAT_PRESENTATION_BUNDLE_SCHEMA = "evavo.heavy-metal-fighting-combat-presentation-bundle.v1";
export const COMBAT_PRESENTATION_PROTOCOL_VERSION = "2026-08-12.1";
export const REQUIRED_FRAME_IDS = Object.freeze(["bastion", "viper", "citadel", "mirage"]);
export const REQUIRED_SCREEN_IDS = Object.freeze(["title-attract", "main-menu", "pilot-select", "frame-select", "service-bay-loadout", "versus", "pre-fight-launch", "match-hud", "super-cut-in", "round-result", "ending-credits"]);
export const REQUIRED_FAMILY_COUNTS = Object.freeze({"title-and-shell":42,"pilot-portraits":60,"frame-construction":40,"frame-animation":480,"frame-damage-overlays":16,"universal-combat-fx":115,"frame-specific-fx":160,"arena-layers":40,"service-bay-crew-upgrades":102,"pilot-service-animation":72,"opening-intro":30});

const fail = (message) => { throw new Error(`HEAVY_METAL_FIGHTING_COMBAT_PRESENTATION_INVALID: ${message}`); };
const ok = (condition, message) => { if (!condition) fail(message); };
const obj = (value, label) => { ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`); return value; };
const arr = (value, label, minimum = 0) => { ok(Array.isArray(value) && value.length >= minimum, `${label} must contain at least ${minimum} item(s).`); return value; };
const str = (value, label) => { ok(typeof value === "string" && value.trim(), `${label} must be a non-empty string.`); return value.trim(); };
const integer = (value, label, minimum = 0) => { ok(Number.isInteger(value) && value >= minimum, `${label} must be an integer >= ${minimum}.`); return value; };
const unique = (values, label) => { ok(new Set(values).size === values.length, `${label} contains duplicates.`); return values; };
const freeze = (value) => { if (Array.isArray(value)) value.forEach(freeze); else if (value && typeof value === "object") Object.values(value).forEach(freeze); return Object.freeze(value); };
const sorted = (value) => Array.isArray(value) ? value.map(sorted) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])])) : value;
export const canonicalJson = (value) => `${JSON.stringify(sorted(value), null, 2)}\n`;
export const sha256 = (value) => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonicalJson(value)).digest("hex");

async function readJson(filePath, label) {
  const before = await lstat(filePath);
  ok(before.isFile() && !before.isSymbolicLink(), `${label} must be a regular non-symlink file.`);
  const bytes = await readFile(filePath);
  const after = await lstat(filePath);
  ok(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs, `${label} changed while it was read.`);
  try { return JSON.parse(bytes.toString("utf8")); } catch (error) { fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
}
function child(bundlePath, relative, label) {
  const normalized = str(relative, label).replaceAll("\\", "/");
  ok(!path.posix.isAbsolute(normalized) && path.posix.normalize(normalized) === normalized && !normalized.startsWith("../") && normalized !== ".", `${label} must be a normalized relative path.`);
  return path.resolve(path.dirname(bundlePath), ...normalized.split("/"));
}
function timing(value, label) {
  const input = obj(value, label);
  return freeze({startup:integer(input.startup,`${label}.startup`,1),active:integer(input.active,`${label}.active`,1),recovery:integer(input.recovery,`${label}.recovery`,1),damage:integer(input.damage,`${label}.damage`,1),...(input.knockdown === undefined ? {} : {knockdown:input.knockdown === true})});
}
function normalizeMove(value, label) {
  const move = obj(value, label);
  const status = str(move.implementationStatus, `${label}.implementationStatus`);
  const runtimeMoveId = move.runtimeMoveId === null ? null : str(move.runtimeMoveId, `${label}.runtimeMoveId`);
  if (status === "planned-runtime-not-implemented") {
    ok(runtimeMoveId === null, `${label} planned move must not claim a runtimeMoveId.`);
    ok(arr(move.productionGates, `${label}.productionGates`, 1).length > 0, `${label} planned move requires production gates.`);
  } else if (status.startsWith("implemented")) {
    ok(runtimeMoveId !== null || status === "implemented-universal-throw-system", `${label} implemented move requires a runtimeMoveId or universal throw status.`);
  }
  const sourceBank = str(move.sourceBank, `${label}.sourceBank`);
  const plannedProductionBank = str(move.plannedProductionBank, `${label}.plannedProductionBank`);
  ok(sourceBank === plannedProductionBank, `${label}.sourceBank must describe the authored production bank; current runtime reuse belongs only in currentRuntimeBank.`);
  const normalized = {...move,id:str(move.id,`${label}.id`),publicName:str(move.publicName,`${label}.publicName`),runtimeMoveId,implementationStatus:status,category:str(move.category,`${label}.category`),inputNotation:str(move.inputNotation,`${label}.inputNotation`),sourceBank,currentRuntimeBank:str(move.currentRuntimeBank,`${label}.currentRuntimeBank`),plannedProductionBank,hitLevel:str(move.hitLevel,`${label}.hitLevel`),resourceClass:str(move.resourceClass,`${label}.resourceClass`),choreography:freeze(obj(move.choreography,`${label}.choreography`)),effects:freeze(arr(move.effects,`${label}.effects`)),bodyNotes:freeze(arr(move.bodyNotes,`${label}.bodyNotes`)),productionGates:freeze(arr(move.productionGates,`${label}.productionGates`)),...(move.currentRuntimeTiming ? {currentRuntimeTiming:timing(move.currentRuntimeTiming,`${label}.currentRuntimeTiming`)} : {})};
  return freeze(normalized);
}
function normalizeFrame(value, index) {
  const label = `frames[${index}]`, frame = obj(value, label);
  const moves = arr(frame.moves, `${label}.moves`, 11).map((move, moveIndex) => normalizeMove(move, `${label}.moves[${moveIndex}]`));
  ok(moves.length === 11, `${label} must retain exactly 11 launch moves.`);
  unique(moves.map((move) => move.id), `${label} move ids`);
  unique(moves.filter((move) => move.runtimeMoveId).map((move) => move.runtimeMoveId), `${label} runtime move ids`);
  const count = (category) => moves.filter((move) => move.category === category).length;
  ok(count("standing-normal") === 2 && count("crouching-normal") === 2 && count("air-normal") === 2, `${label} requires exactly six normals.`);
  ok(count("special") === 2 && count("reversal") === 1 && count("overdrive") === 1 && count("throw") === 1, `${label} move categories drifted.`);
  const specialBanks = obj(frame.specialBanks, `${label}.specialBanks`);
  for (const bank of ["special-a","special-b","high-output-a","high-output-b"]) {
    const move = moves.find((candidate) => candidate.id === specialBanks[bank]);
    ok(move && move.plannedProductionBank === bank, `${label}.specialBanks.${bank} is invalid.`);
  }
  const superPresentation = obj(frame.superPresentation, `${label}.superPresentation`);
  ok(moves.find((move) => move.id === superPresentation.moveId)?.category === "overdrive", `${label}.superPresentation must reference its Overdrive.`);
  return freeze({...frame,id:str(frame.id,`${label}.id`),code:str(frame.code,`${label}.code`),epithet:str(frame.epithet,`${label}.epithet`),pilotId:str(frame.pilotId,`${label}.pilotId`),motionIdentity:str(frame.motionIdentity,`${label}.motionIdentity`),specialBanks:freeze(specialBanks),moves:freeze(moves),superPresentation:freeze(superPresentation)});
}
function normalizePilot(value, index, allocatedSlots) {
  const label = `pilotDesign.pilots[${index}]`, pilot = obj(value, label);
  const portraitSlots = arr(pilot.portraitSlots, `${label}.portraitSlots`, 15).map((slot) => str(slot, `${label}.portraitSlots`));
  ok(portraitSlots.length === 15 && JSON.stringify(portraitSlots) === JSON.stringify(allocatedSlots), `${label}.portraitSlots must match the allocated fifteen-slot portrait contract.`);
  return freeze({...pilot,id:str(pilot.id,`${label}.id`),name:str(pilot.name,`${label}.name`),handle:str(pilot.handle,`${label}.handle`),affiliation:str(pilot.affiliation,`${label}.affiliation`),defaultFrameId:str(pilot.defaultFrameId,`${label}.defaultFrameId`),portraitSlots:freeze(portraitSlots),superCutIn:freeze(obj(pilot.superCutIn,`${label}.superCutIn`))});
}
function normalizeAllocation(value) {
  const allocation = obj(value, "assetAllocation"), normalized = {};
  for (const [familyId, expected] of Object.entries(REQUIRED_FAMILY_COUNTS)) {
    const family = obj(allocation[familyId], `assetAllocation.${familyId}`);
    ok(family.expectedCount === expected, `assetAllocation.${familyId} must retain ${expected} images.`);
    normalized[familyId] = freeze(family);
  }
  ok(Object.keys(allocation).length === Object.keys(REQUIRED_FAMILY_COUNTS).length, "assetAllocation contains an undeclared family.");
  ok(Object.values(normalized).reduce((sum, family) => sum + family.expectedCount, 0) === 1157, "assetAllocation must total 1157 images.");
  ok(normalized["title-and-shell"].items.length === 42, "title-and-shell must enumerate 42 items.");
  ok(normalized["pilot-portraits"].perPilot.slots.length === 15, "pilot portraits must retain fifteen slots per Pilot.");
  ok(normalized["frame-construction"].perFrame.slots.length === 10, "Frame construction must retain ten items per Frame.");
  ok(normalized["pilot-service-animation"].perPilot.slots.length === 18, "Pilot service animation must retain eighteen cels per Pilot.");
  return freeze(normalized);
}

export function normalizeCombatPresentationContract(input) {
  const contract = obj(input, "contract");
  ok(contract.schema === COMBAT_PRESENTATION_SCHEMA, `contract.schema must equal ${COMBAT_PRESENTATION_SCHEMA}.`);
  ok(contract.protocolVersion === COMBAT_PRESENTATION_PROTOCOL_VERSION, `contract.protocolVersion must equal ${COMBAT_PRESENTATION_PROTOCOL_VERSION}.`);
  const authority = obj(contract.authority, "authority");
  for (const key of ["gameRepositoryOwnsCombatTiming","gameRepositoryOwnsHitboxesDamageAndInputs","gameRepositoryOwnsRuntimeSlotManifest","artStudioOwnsProductionPlanningAndReviewEvidence","automaticPromotionForbidden","namedHumanApprovalRequired","targetRepositoryMutationForbidden","gitMutationForbidden"]) ok(authority[key] === true, `authority.${key} must remain true.`);
  for (const key of ["providerMayDefineCanon","providerMayApproveArt","providerMayGeneratePackedRuntimeAtlas"]) ok(authority[key] === false, `authority.${key} must remain false.`);
  const allocation = normalizeAllocation(contract.assetAllocation);
  const frames = arr(contract.frames, "frames", 4).map(normalizeFrame);
  ok(frames.length === 4 && [...frames.map((frame) => frame.id)].sort().join("|") === [...REQUIRED_FRAME_IDS].sort().join("|"), `frames must contain ${REQUIRED_FRAME_IDS.join(", ")}.`);
  unique(frames.map((frame) => frame.pilotId), "Frame Pilot ids");
  const pilotDesign = obj(contract.pilotDesign, "pilotDesign");
  const pilots = arr(pilotDesign.pilots, "pilotDesign.pilots", 4).map((pilot, index) => normalizePilot(pilot, index, allocation["pilot-portraits"].perPilot.slots));
  ok(pilots.length === 4 && [...pilots.map((pilot) => pilot.id)].sort().join("|") === [...frames.map((frame) => frame.pilotId)].sort().join("|"), "Pilot designs must match the launch Frame Pilot ids.");
  for (const pilot of pilots) ok(frames.find((frame) => frame.id === pilot.defaultFrameId)?.pilotId === pilot.id, `${pilot.id} default Frame binding is invalid.`);
  const screens = arr(contract.screens, "screens", REQUIRED_SCREEN_IDS.length).map((screen, index) => freeze({...obj(screen,`screens[${index}]`),id:str(screen.id,`screens[${index}].id`)}));
  ok([...screens.map((screen) => screen.id)].sort().join("|") === [...REQUIRED_SCREEN_IDS].sort().join("|"), `screens must contain ${REQUIRED_SCREEN_IDS.join(", ")}.`);
  const intro = obj(contract.openingIntro, "openingIntro");
  ok(intro.expectedCount === 30 && intro.shots.length === 30, "opening intro must retain 30 full-screen cels.");
  ok(intro.totalHoldTicks === intro.shots.reduce((sum, shot) => sum + shot.holdTicks, 0), "opening intro totalHoldTicks drifted.");
  const attract = obj(contract.attractMode, "attractMode");
  ok(attract.segments.length === 4 && attract.segments.reduce((sum, segment) => sum + segment.targetSeconds, 0) === 40, "attract mode must retain four segments and 40 seconds.");
  const normalized = {schema:COMBAT_PRESENTATION_SCHEMA,protocolVersion:COMBAT_PRESENTATION_PROTOCOL_VERSION,project:freeze(obj(contract.project,"project")),authority:freeze(authority),style:freeze(obj(contract.style,"style")),sourceReview:freeze(obj(contract.sourceReview,"sourceReview")),sharedStateLibrary:freeze(arr(contract.sharedStateLibrary,"sharedStateLibrary",20)),superPresentationStandard:freeze(obj(contract.superPresentationStandard,"superPresentationStandard")),pilotDesign:freeze({...pilotDesign,pilots:freeze(pilots)}),frames:freeze(frames),interfaceDesign:freeze(obj(contract.interfaceDesign,"interfaceDesign")),screens:freeze(screens),assetAllocation:allocation,openingIntro:freeze(intro),attractMode:freeze(attract),postLaunchMoveBacklog:freeze(obj(contract.postLaunchMoveBacklog,"postLaunchMoveBacklog"))};
  ok(normalized.project.publicTitle === "HEAVY METAL FIGHTING", "public title changed.");
  const contractSha256 = sha256(normalized);
  return freeze({...normalized,contractSha256});
}

async function loadBundle(bundlePath, bundle) {
  ok(bundle.protocolVersion === COMBAT_PRESENTATION_PROTOCOL_VERSION && bundle.contractSchema === COMBAT_PRESENTATION_SCHEMA, "bundle identity changed.");
  const components = obj(bundle.components, "bundle.components");
  const [base,pilots,screens,assetAllocation,intro,...frames] = await Promise.all([
    readJson(child(bundlePath,components.base,"bundle.components.base"),"combat presentation base"),
    readJson(child(bundlePath,components.pilots,"bundle.components.pilots"),"combat presentation Pilots"),
    readJson(child(bundlePath,components.screens,"bundle.components.screens"),"combat presentation screens"),
    readJson(child(bundlePath,components.assetAllocation,"bundle.components.assetAllocation"),"combat presentation asset allocation"),
    readJson(child(bundlePath,components.intro,"bundle.components.intro"),"combat presentation intro"),
    ...components.frames.map((entry,index)=>readJson(child(bundlePath,entry,`bundle.components.frames[${index}]`),`combat presentation Frame ${index}`)),
  ]);
  return normalizeCombatPresentationContract({...base,pilotDesign:pilots,frames,interfaceDesign:screens.interfaceDesign,screens:screens.screens,assetAllocation:{...assetAllocation.assetAllocation,"opening-intro":intro.openingIntro},openingIntro:intro.openingIntro,attractMode:intro.attractMode});
}
export async function loadCombatPresentationContractFile(filePath) {
  const parsed = await readJson(filePath, "combat presentation contract");
  return parsed.schema === COMBAT_PRESENTATION_BUNDLE_SCHEMA ? loadBundle(filePath, parsed) : normalizeCombatPresentationContract(parsed);
}
export function combatPresentationSummary(contractInput) {
  const contract = contractInput?.contractSha256 ? contractInput : normalizeCombatPresentationContract(contractInput);
  return freeze({schema:"evavo.heavy-metal-fighting-combat-presentation-summary.v1",project:contract.project,contractSha256:contract.contractSha256,sourceReview:contract.sourceReview,pilots:contract.pilotDesign.pilots.map(({id,name,handle,affiliation,defaultFrameId,portraitSlots})=>freeze({id,name,handle,affiliation,defaultFrameId,portraitSlots:portraitSlots.length})),frames:contract.frames.map((frame)=>freeze({id:frame.id,code:frame.code,epithet:frame.epithet,pilotId:frame.pilotId,motionIdentity:frame.motionIdentity,moves:frame.moves.length,implementedRuntimeMoves:frame.moves.filter((move)=>move.runtimeMoveId).length,plannedRuntimeMoves:frame.moves.filter((move)=>move.implementationStatus==="planned-runtime-not-implemented").length,specialBanks:frame.specialBanks,overdrive:frame.superPresentation.moveId})),screens:contract.screens.map((screen)=>screen.id),intro:{cels:30,totalHoldTicks:contract.openingIntro.totalHoldTicks,targetDurationSecondsAt60Hz:contract.openingIntro.targetDurationSecondsAt60Hz},attractMode:{segments:4,targetSeconds:40,reuseOnly:true},assetFamilyCounts:Object.fromEntries(Object.entries(contract.assetAllocation).map(([id,family])=>[id,family.expectedCount])),authority:contract.authority});
}
