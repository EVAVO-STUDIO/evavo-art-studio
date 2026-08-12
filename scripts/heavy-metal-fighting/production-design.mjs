import { createHash } from "node:crypto";

const fail = (message) => { throw new Error(`HEAVY_METAL_FIGHTING_PRODUCTION_DESIGN_INVALID: ${message}`); };
const ok = (condition, message) => { if (!condition) fail(message); };
const freeze = (value) => { if (Array.isArray(value)) value.forEach(freeze); else if (value && typeof value === "object") Object.values(value).forEach(freeze); return Object.freeze(value); };
const sort = (value) => Array.isArray(value) ? value.map(sort) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])])) : value;
const hash = (value) => createHash("sha256").update(`${JSON.stringify(sort(value), null, 2)}\n`).digest("hex");
const frame = (contract, id) => { const found = contract.frames.find((candidate) => candidate.id === String(id ?? "").toLowerCase()); ok(found, `unknown Frame ${id}.`); return found; };
const pilot = (contract, id) => { const found = contract.pilotDesign.pilots.find((candidate) => candidate.id === String(id ?? "").toLowerCase()); ok(found, `unknown Pilot ${id}.`); return found; };

export function movePlan(contract, frameId, moveId) {
  const owner = frame(contract, frameId);
  const move = owner.moves.find((candidate) => candidate.id === String(moveId ?? "").toLowerCase());
  ok(move, `unknown move ${moveId} for ${frameId}.`);
  const blockers = [...move.productionGates];
  const currentRuntimeReuse = move.currentRuntimeBank !== move.plannedProductionBank;
  if (currentRuntimeReuse && !blockers.includes("current-runtime-bank-reuse")) blockers.push("current-runtime-bank-reuse");
  const result = {
    schema: "evavo.heavy-metal-fighting-move-production-plan.v1",
    projectId: contract.project.id,
    contractSha256: contract.contractSha256,
    frame: {id:owner.id, code:owner.code, epithet:owner.epithet, motionIdentity:owner.motionIdentity, pilotId:owner.pilotId},
    move,
    productionStatus: blockers.length ? "blocked-or-conditional" : "ready-for-bounded-source-cel-planning",
    blockers: freeze(blockers),
    productionBinding: freeze({sourceBank:move.sourceBank,currentRuntimeBank:move.currentRuntimeBank,plannedProductionBank:move.plannedProductionBank,currentRuntimeReuse}),
    phasePlan: freeze([
      {frame:0,phase:"startup",purpose:"initial readable intent and attack lane"},
      {frame:1,phase:"startup",purpose:"deeper mechanical load or compression"},
      {frame:2,phase:"startup",purpose:"last pre-contact silhouette"},
      {frame:3,phase:"active",purpose:"first threat or contact entry"},
      {frame:4,phase:"active",purpose:"hero impact; strongest one-colour silhouette"},
      {frame:5,phase:"active",purpose:"overshoot or sustained active continuation"},
      {frame:6,phase:"recovery",purpose:"immediate recoil or system response"},
      {frame:7,phase:"recovery",purpose:"clearly vulnerable recovery"},
      {frame:8,phase:"recovery",purpose:"controlled return or bridge pose"},
    ]),
    reviewGates: freeze(["native-128x128","one-colour-silhouette","mechanical-landmarks","hit-lane-match","ground-contact","mirror-safety","body-effect-separation","named-human-approval"]),
    authority: freeze({combatTiming:false,hitbox:false,damage:false,providerExecution:false,approval:false,targetRepositoryMutation:false}),
  };
  return freeze({...result, planSha256:hash(result)});
}

export function frameMoveRoster(contract, frameId) {
  const owner = frame(contract, frameId);
  return freeze({schema:"evavo.heavy-metal-fighting-frame-move-roster.v1",frame:{id:owner.id,code:owner.code,epithet:owner.epithet,pilotId:owner.pilotId,motionIdentity:owner.motionIdentity},banks:owner.specialBanks,moves:owner.moves.map((move)=>freeze({id:move.id,publicName:move.publicName,category:move.category,inputNotation:move.inputNotation,implementationStatus:move.implementationStatus,runtimeMoveId:move.runtimeMoveId,sourceBank:move.sourceBank,currentRuntimeBank:move.currentRuntimeBank,plannedProductionBank:move.plannedProductionBank,resourceClass:move.resourceClass,hitLevel:move.hitLevel,blocked:move.productionGates.length>0})),superPresentation:owner.superPresentation,postLaunchBacklog:contract.postLaunchMoveBacklog,authority:contract.authority});
}

export function screenPlan(contract, screenId) {
  const screen = contract.screens.find((candidate) => candidate.id === String(screenId ?? "").toLowerCase());
  ok(screen, `unknown screen ${screenId}.`);
  return freeze({schema:"evavo.heavy-metal-fighting-screen-production-plan.v1",projectId:contract.project.id,contractSha256:contract.contractSha256,screen,interfaceDesign:contract.interfaceDesign,assetFamily:"title-and-shell",authority:{providerExecution:false,approval:false,targetRepositoryMutation:false}});
}

export function superPlan(contract, frameId) {
  const owner = frame(contract, frameId);
  const move = owner.moves.find((candidate) => candidate.id === owner.superPresentation.moveId);
  const selectedPilot = pilot(contract, owner.pilotId);
  ok(move?.category === "overdrive", `${frameId} super move is invalid.`);
  return freeze({schema:"evavo.heavy-metal-fighting-super-production-plan.v1",projectId:contract.project.id,contractSha256:contract.contractSha256,frame:{id:owner.id,code:owner.code,epithet:owner.epithet,motionIdentity:owner.motionIdentity},pilot:{id:selectedPilot.id,name:selectedPilot.name,handle:selectedPilot.handle,superCutIn:selectedPilot.superCutIn},move,standard:contract.superPresentationStandard,screen:contract.screens.find((candidate)=>candidate.id==="super-cut-in"),requiredAssetBindings:{pilotPortraits:["super-charge","super-call","super-resolve"],frameEffects:[`${owner.id}-${move.id}`],universalEffects:["super-freeze"],bitmapText:[move.publicName]},authority:{combatTiming:false,providerExecution:false,approval:false,targetRepositoryMutation:false}});
}

export function introPlan(contract) {
  return freeze({schema:"evavo.heavy-metal-fighting-intro-production-plan.v1",projectId:contract.project.id,contractSha256:contract.contractSha256,totalCels:contract.openingIntro.expectedCount,totalHoldTicks:contract.openingIntro.totalHoldTicks,targetDurationSecondsAt60Hz:contract.openingIntro.targetDurationSecondsAt60Hz,shots:contract.openingIntro.shots,rules:["one full-screen image per shot","variable holds","separate declared overlays","no provider contact sheet","no new text embedded in generated images","reuse approved Pilot, Frame, service-bay and title identities"],authority:{providerExecution:false,approval:false,targetRepositoryMutation:false}});
}
export function attractModePlan(contract) { return freeze({schema:"evavo.heavy-metal-fighting-attract-production-plan.v1",projectId:contract.project.id,contractSha256:contract.contractSha256,attractMode:contract.attractMode,reusePolicy:"approved title, selection, match and result assets only",authority:{providerExecution:false,approval:false,targetRepositoryMutation:false}}); }

export function assetAllocationPlan(contract, familyId) {
  if (familyId) {
    const family = contract.assetAllocation[String(familyId)];
    ok(family, `unknown asset family ${familyId}.`);
    return freeze({schema:"evavo.heavy-metal-fighting-asset-family-plan.v1",projectId:contract.project.id,contractSha256:contract.contractSha256,familyId:String(familyId),family,authority:{providerExecution:false,approval:false,targetRepositoryMutation:false}});
  }
  return freeze({schema:"evavo.heavy-metal-fighting-asset-allocation.v1",projectId:contract.project.id,contractSha256:contract.contractSha256,totalSourceImages:Object.values(contract.assetAllocation).reduce((sum,family)=>sum+family.expectedCount,0),families:contract.assetAllocation,authority:{providerExecution:false,approval:false,targetRepositoryMutation:false}});
}

export function pilotPlan(contract, pilotId) {
  const selected = pilot(contract, pilotId);
  const defaultFrame = frame(contract, selected.defaultFrameId);
  return freeze({schema:"evavo.heavy-metal-fighting-pilot-production-plan.v1",projectId:contract.project.id,contractSha256:contract.contractSha256,pilot:selected,defaultFrame:{id:defaultFrame.id,code:defaultFrame.code,epithet:defaultFrame.epithet,motionIdentity:defaultFrame.motionIdentity},requiredPortraitSlots:selected.portraitSlots,requiredServiceAnimationSlots:contract.assetAllocation["pilot-service-animation"].perPilot.slots,selectionScreen:contract.screens.find((candidate)=>candidate.id==="pilot-select"),superStandard:contract.superPresentationStandard,authority:{providerExecution:false,approval:false,targetRepositoryMutation:false,namedHumanApprovalRequired:true}});
}

const BANK_BY_ORDINAL = Object.freeze({0:"neutral-and-throws",1:"standing-light",2:"standing-heavy",3:"crouch-light",4:"crouch-heavy",5:"jump-light",6:"jump-heavy",7:"special-a",8:"special-b",9:"high-output-a",10:"high-output-b",11:"utility-v2-planned",12:"victory-defeat"});
const phasePurpose = (cell) => cell.phase === "startup" ? ["initial readable intent and attack lane","deeper mechanical load or compression","last pre-contact silhouette"][cell.frameIndex] : cell.phase === "active" ? ["first threat or contact entry","hero impact; strongest one-colour silhouette","overshoot or sustained active continuation"][cell.frameIndex-3] : cell.phase === "recovery" ? ["immediate recoil or system response","clearly vulnerable recovery","controlled return or bridge pose"][cell.frameIndex-6] : cell.pose;
export function sourceCelProductionPlan(contract, sourceCelPlanInput) {
  const owner = frame(contract, sourceCelPlanInput.frame.id);
  const bank = BANK_BY_ORDINAL[sourceCelPlanInput.cell.sourceClipOrdinal];
  const move = owner.moves.find((candidate) => candidate.sourceBank === bank) ?? null;
  return freeze({schema:"evavo.heavy-metal-fighting-enriched-source-cel.v1",contractSha256:contract.contractSha256,frame:{id:owner.id,code:owner.code,epithet:owner.epithet,motionIdentity:owner.motionIdentity,pilotId:owner.pilotId},sourceCell:sourceCelPlanInput.cell,move,framePurpose:phasePurpose(sourceCelPlanInput.cell),productionBinding:move ? {sourceBank:move.sourceBank,currentRuntimeBank:move.currentRuntimeBank,plannedProductionBank:move.plannedProductionBank,currentRuntimeReuse:move.currentRuntimeBank!==move.plannedProductionBank} : {sourceBank:bank,currentRuntimeBank:null,plannedProductionBank:bank,currentRuntimeReuse:false},neighbourConditioning:sourceCelPlanInput.cell.neighbourConditioning,bodyEffectBoundary:sourceCelPlanInput.frame.bodyEffectBoundary,blockers:move?.productionGates ?? [],authority:{providerExecution:false,approval:false,targetRepositoryMutation:false}});
}

export function productionDesignSummary(contract) {
  return freeze({schema:"evavo.heavy-metal-fighting-production-design-summary.v1",contractSha256:contract.contractSha256,sourceImages:Object.values(contract.assetAllocation).reduce((sum,family)=>sum+family.expectedCount,0),pilots:contract.pilotDesign.pilots.map(({id,name,handle,defaultFrameId})=>({id,name,handle,defaultFrameId})),frames:contract.frames.map((owner)=>({id:owner.id,code:owner.code,epithet:owner.epithet,moves:owner.moves.length,overdrive:owner.superPresentation.moveId})),screens:contract.screens.map((screen)=>screen.id),introCels:contract.openingIntro.expectedCount,attractSeconds:contract.attractMode.segments.reduce((sum,segment)=>sum+segment.targetSeconds,0)});
}
export function productionReadinessPlan(contract) {
  return freeze({schema:"evavo.heavy-metal-fighting-production-readiness.v1",projectId:contract.project.id,contractSha256:contract.contractSha256,readyNow:["Pilot identity and portrait planning","Frame construction and landmark planning","implemented normal/special/Overdrive source-cel planning","title, menu, selection, versus and HUD planning","30-cel intro planning","attract-mode reuse planning","separate universal and Frame FX planning"],blockedUntilGameMigration:["planned second specials","separate reversal runtime banks","atlas-v2 utility states","CORE SYSTEM DOWN and REIGNITION gameplay authority","crew casualty gameplay effects","final runtime atlas promotion"],firstStyleProof:"Branka + Bastion + Danube Works service cradle + Foundry Nine + title",authority:{providerExecution:false,approval:false,targetRepositoryMutation:false,namedHumanApprovalRequired:true}});
}
export function verifyProductionDesign(contract) {
  const checks = [["production-asset-inventory",Object.values(contract.assetAllocation).reduce((sum,family)=>sum+family.expectedCount,0)===1157],["launch-pilots",contract.pilotDesign.pilots.length===4],["launch-frames",contract.frames.length===4],["move-rosters",contract.frames.every((owner)=>owner.moves.length===11)],["screens",contract.screens.length===11],["intro",contract.openingIntro.shots.length===30],["attract",contract.attractMode.segments.length===4],["super-cut-ins",contract.frames.every((owner)=>owner.moves.find((move)=>move.id===owner.superPresentation.moveId)?.pilotCutIn)],["planned-special-blockers",contract.frames.every((owner)=>owner.moves.filter((move)=>move.implementationStatus==="planned-runtime-not-implemented").every((move)=>move.productionGates.length>0))],["authority",contract.authority.providerMayApproveArt===false&&contract.authority.targetRepositoryMutationForbidden===true]].map(([id,passed])=>freeze({id,passed}));
  const withoutHash={schema:"evavo.heavy-metal-fighting-production-design-verification.v1",status:checks.every((check)=>check.passed)?"passed":"failed",contractSha256:contract.contractSha256,checks,failed:checks.filter((check)=>!check.passed)}; return freeze({...withoutHash,verificationSha256:hash(withoutHash)});
}
