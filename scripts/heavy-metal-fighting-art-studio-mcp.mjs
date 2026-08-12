#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import {
  heavyMetalFightingAssetAllocation, heavyMetalFightingAttractModePlan, heavyMetalFightingBatch,
  heavyMetalFightingCombatPresentationContract, heavyMetalFightingFrameMoveRoster, heavyMetalFightingFramePlan,
  heavyMetalFightingHandoffTemplate, heavyMetalFightingIntroPlan, heavyMetalFightingMechanicalContract,
  heavyMetalFightingMovePlan, heavyMetalFightingPilotPlan, heavyMetalFightingProductionReadiness,
  heavyMetalFightingRuntimeSlot, heavyMetalFightingScreenPlan, heavyMetalFightingSourceCel,
  heavyMetalFightingSpriteBank, heavyMetalFightingSpriteCensus,
  heavyMetalFightingStyleProof, heavyMetalFightingSummary, heavyMetalFightingSuperPlan,
  verifyHeavyMetalFightingStudio,
} from "./heavy-metal-fighting/studio-runtime.mjs";

export const SERVER_NAME = "evavo-heavy-metal-fighting-art-studio";
export const SERVER_VERSION = "1.4.0";
export const SUMMARY_TOOL = "evavo_heavy_metal_fighting_summary";
export const CONTRACT_TOOL = "evavo_heavy_metal_fighting_mechanical_contract";
export const PRESENTATION_CONTRACT_TOOL = "evavo_heavy_metal_fighting_combat_presentation_contract";
export const SPRITE_CENSUS_TOOL = "evavo_heavy_metal_fighting_sprite_census";
export const SPRITE_BANK_TOOL = "evavo_heavy_metal_fighting_sprite_bank";
export const PILOT_TOOL = "evavo_heavy_metal_fighting_pilot_plan";
export const FRAME_TOOL = "evavo_heavy_metal_fighting_frame_plan";
export const FRAME_MOVES_TOOL = "evavo_heavy_metal_fighting_frame_moves";
export const MOVE_TOOL = "evavo_heavy_metal_fighting_move_plan";
export const SOURCE_CEL_TOOL = "evavo_heavy_metal_fighting_source_cel";
export const RUNTIME_SLOT_TOOL = "evavo_heavy_metal_fighting_runtime_slot";
export const SCREEN_TOOL = "evavo_heavy_metal_fighting_screen_plan";
export const SUPER_TOOL = "evavo_heavy_metal_fighting_super_plan";
export const INTRO_TOOL = "evavo_heavy_metal_fighting_intro_plan";
export const ATTRACT_TOOL = "evavo_heavy_metal_fighting_attract_mode";
export const READINESS_TOOL = "evavo_heavy_metal_fighting_production_readiness";
export const ASSET_TOOL = "evavo_heavy_metal_fighting_asset_allocation";
export const BATCH_TOOL = "evavo_heavy_metal_fighting_batch";
export const STYLE_PROOF_TOOL = "evavo_heavy_metal_fighting_style_proof";
export const VERIFY_TOOL = "evavo_heavy_metal_fighting_verify";
export const HANDOFF_TOOL = "evavo_heavy_metal_fighting_handoff_template";

const FRAME_IDS = Object.freeze(["bastion","viper","citadel","mirage"]);
const PILOT_IDS = Object.freeze(["branka-kovac","miho-tagawa","esi-quartey","parvaneh-razi"]);
const SCREEN_IDS = Object.freeze(["title-attract","main-menu","pilot-select","frame-select","service-bay-loadout","versus","pre-fight-launch","match-hud","super-cut-in","round-result","ending-credits"]);
const FAMILY_IDS = Object.freeze(["title-and-shell","pilot-portraits","frame-construction","frame-animation","frame-damage-overlays","universal-combat-fx","frame-specific-fx","arena-layers","service-bay-crew-upgrades","pilot-service-animation","opening-intro"]);
const SPRITE_BANK_IDS = Object.freeze(["ready","idle","walk-forward","walk-back","crouch-transition","crouch-hold","dash-forward","dash-back","jump-launch","jump-rise","jump-apex","jump-fall","landing","guard-standing","guard-crouching","block-high","block-low","instant-block","guard-crush","hit-light","hit-heavy","counter-stagger","air-hit","wall-impact","knockdown-fall","grounded-hold","wakeup","grab-whiff","throw-attacker","throw-receiver","throw-break","standing-light","standing-heavy","crouching-light","crouching-heavy","jumping-light","jumping-heavy","special-a","special-b","reversal","overdrive","system-down","reignition","heat-vent","entrance","victory","defeat"]);
const objectSchema = (properties = {}, required = []) => ({type:"object",additionalProperties:false,properties,...(required.length?{required}:{})});

export function toolDefinitions() {
  return Object.freeze([
    {name:SUMMARY_TOOL,description:"Return the exact launch-four compatibility inventory, production-master sprite census, hashes, Frames, production-design summary, atlas status, style-proof blockers and authority boundary.",inputSchema:objectSchema()},
    {name:CONTRACT_TOOL,description:"Return the normalized mechanical identity contract, landmarks, hardpoints, asymmetry, mirroring and body/effect ownership.",inputSchema:objectSchema()},
    {name:PRESENTATION_CONTRACT_TOOL,description:"Return the normalized combat, move, screen, HUD, super, intro and current 1,157-image compatibility allocation contract.",inputSchema:objectSchema()},
    {name:SPRITE_CENSUS_TOOL,description:"Return the planned production-master-v3 sprite census: 160x160 native cells, 256 atlas slots, 224 unique body cels per Frame, exact bank ranges, scale envelopes, hold-language guidance and the 1,573-image final-production target.",inputSchema:objectSchema()},
    {name:SPRITE_BANK_TOOL,description:"Inspect one exact production-master-v3 body-animation bank with its cel count, slot range, native cell, pivot, safety margin and migration gate.",inputSchema:objectSchema({bankId:{type:"string",enum:SPRITE_BANK_IDS}},["bankId"])},
    {name:PILOT_TOOL,description:"Return one canonical Pilot identity, clothing, portrait, service-animation, selection and three-cel Overdrive cut-in plan.",inputSchema:objectSchema({pilotId:{type:"string",enum:PILOT_IDS}},["pilotId"])},
    {name:FRAME_TOOL,description:"Return one complete compatibility Frame source-cel plan with 120 authored cels and current/planned-v2 runtime-slot maps.",inputSchema:objectSchema({frameId:{type:"string",enum:FRAME_IDS}},["frameId"])},
    {name:FRAME_MOVES_TOOL,description:"Return the complete named move roster for one Frame with runtime status, inputs, banks and blockers.",inputSchema:objectSchema({frameId:{type:"string",enum:FRAME_IDS}},["frameId"])},
    {name:MOVE_TOOL,description:"Return one move production plan with live timing where implemented, authored choreography, bank mappings, effects and gates.",inputSchema:objectSchema({frameId:{type:"string",enum:FRAME_IDS},moveId:{type:"string",minLength:1}},["frameId","moveId"])},
    {name:SOURCE_CEL_TOOL,description:"Return one exact authored compatibility Frame source cel with mechanical identity, neighbours, runtime bindings and review gates.",inputSchema:objectSchema({frameId:{type:"string",enum:FRAME_IDS},sourceIndex:{type:"integer",minimum:0,maximum:119}},["frameId","sourceIndex"])},
    {name:RUNTIME_SLOT_TOOL,description:"Inspect one current or planned-v2 compatibility runtime atlas slot, collision/reserved state and source bindings.",inputSchema:objectSchema({frameId:{type:"string",enum:FRAME_IDS},mapName:{type:"string",enum:["current","planned-v2"]},slot:{type:"integer",minimum:0,maximum:119}},["frameId","mapName","slot"])},
    {name:SCREEN_TOOL,description:"Return one 640x360 production plan for title, menus, Pilot select, Frame select, service bay, versus, HUD, super, results or endings.",inputSchema:objectSchema({screenId:{type:"string",enum:SCREEN_IDS}},["screenId"])},
    {name:SUPER_TOOL,description:"Return the complete 1990s arcade Overdrive plan for one Frame, including three Pilot cut-in cels and separate effects.",inputSchema:objectSchema({frameId:{type:"string",enum:FRAME_IDS}},["frameId"])},
    {name:INTRO_TOOL,description:"Return the complete 30-cel, 798-tick opening plan with camera, overlays and anti-generic direction.",inputSchema:objectSchema()},
    {name:ATTRACT_TOOL,description:"Return the governed arcade attract loop that reuses approved source assets.",inputSchema:objectSchema()},
    {name:READINESS_TOOL,description:"Return what production may begin now and what remains blocked by game-repository migrations.",inputSchema:objectSchema()},
    {name:ASSET_TOOL,description:"Return the current 1,157-image compatibility allocation or one exact family allocation; use sprite census for the 1,573-image production-master target.",inputSchema:objectSchema({familyId:{type:"string",enum:FAMILY_IDS}})},
    {name:BATCH_TOOL,description:"Return one exact compatibility family-locked production batch with up to ten separate image work units.",inputSchema:objectSchema({batchNumber:{type:"integer",minimum:1,maximum:119}},["batchNumber"])},
    {name:STYLE_PROOF_TOOL,description:"Return the locked Branka + Bastion + service cradle + Foundry Nine + title style proof.",inputSchema:objectSchema()},
    {name:VERIFY_TOOL,description:"Run deterministic campaign, mechanical, move, UI, super, intro, allocation, sprite-census, authority and style-proof checks without writes.",inputSchema:objectSchema()},
    {name:HANDOFF_TOOL,description:"Compile a read-only handoff template bound to one exact game commit, live slot-manifest hash, presentation contract and sprite-production census.",inputSchema:objectSchema({gameRevisionSha:{type:"string",pattern:"^[0-9a-f]{40}$"},liveSlotManifestSha256:{type:"string",pattern:"^[0-9a-f]{64}$"}},["gameRevisionSha","liveSlotManifestSha256"])},
  ]);
}

export async function callTool(name, input = {}) {
  if (!toolDefinitions().some((tool)=>tool.name===name)) throw new Error(`Unknown or prohibited HEAVY METAL FIGHTING Art Studio tool ${name}.`);
  if (name===SUMMARY_TOOL) return heavyMetalFightingSummary();
  if (name===CONTRACT_TOOL) return heavyMetalFightingMechanicalContract();
  if (name===PRESENTATION_CONTRACT_TOOL) return heavyMetalFightingCombatPresentationContract();
  if (name===SPRITE_CENSUS_TOOL) return heavyMetalFightingSpriteCensus();
  if (name===SPRITE_BANK_TOOL) return heavyMetalFightingSpriteBank(input.bankId);
  if (name===PILOT_TOOL) return heavyMetalFightingPilotPlan(input.pilotId);
  if (name===FRAME_TOOL) return heavyMetalFightingFramePlan(input.frameId);
  if (name===FRAME_MOVES_TOOL) return heavyMetalFightingFrameMoveRoster(input.frameId);
  if (name===MOVE_TOOL) return heavyMetalFightingMovePlan(input.frameId,input.moveId);
  if (name===SOURCE_CEL_TOOL) return heavyMetalFightingSourceCel(input.frameId,input.sourceIndex);
  if (name===RUNTIME_SLOT_TOOL) return heavyMetalFightingRuntimeSlot(input.frameId,input.mapName,input.slot);
  if (name===SCREEN_TOOL) return heavyMetalFightingScreenPlan(input.screenId);
  if (name===SUPER_TOOL) return heavyMetalFightingSuperPlan(input.frameId);
  if (name===INTRO_TOOL) return heavyMetalFightingIntroPlan();
  if (name===ATTRACT_TOOL) return heavyMetalFightingAttractModePlan();
  if (name===READINESS_TOOL) return heavyMetalFightingProductionReadiness();
  if (name===ASSET_TOOL) return heavyMetalFightingAssetAllocation(input.familyId);
  if (name===BATCH_TOOL) return heavyMetalFightingBatch(input.batchNumber);
  if (name===STYLE_PROOF_TOOL) return heavyMetalFightingStyleProof();
  if (name===VERIFY_TOOL) return verifyHeavyMetalFightingStudio();
  if (name===HANDOFF_TOOL) return heavyMetalFightingHandoffTemplate({gameRevisionSha:input.gameRevisionSha,liveSlotManifestSha256:input.liveSlotManifestSha256});
  throw new Error(`Unhandled HEAVY METAL FIGHTING Art Studio tool ${name}.`);
}

const response = (id,result)=>({jsonrpc:"2.0",id:id??null,result});
const content = (value)=>[{type:"text",text:JSON.stringify(value,null,2)}];
export async function handleRequest(request) {
  if (!request || request.jsonrpc!=="2.0" || typeof request.method!=="string") throw new Error("Invalid JSON-RPC request.");
  if (request.method==="initialize") return response(request.id,{protocolVersion:request.params?.protocolVersion??"2024-11-05",capabilities:{tools:{}},serverInfo:{name:SERVER_NAME,version:SERVER_VERSION},instructions:"This is a read-only HEAVY METAL FIGHTING production adapter. It exposes compatibility campaign/runtime inspection plus the planned 160x160 / 256-slot / 224-body-cel production-master sprite census. It never calls an image provider, approves art, assembles or promotes a runtime atlas, mutates the game repository, commits, pushes, deploys or publishes."});
  if (request.method==="ping") return response(request.id,{});
  if (request.method==="notifications/initialized") return null;
  if (request.method==="tools/list") return response(request.id,{tools:toolDefinitions()});
  if (request.method==="tools/call") {
    try { return response(request.id,{content:content(await callTool(request.params?.name,request.params?.arguments??{})),isError:false}); }
    catch (error) { return response(request.id,{content:content({error:error instanceof Error?error.message:String(error)}),isError:true}); }
  }
  throw new Error(`Unsupported MCP method ${request.method}.`);
}
export async function startServer() {
  const input = createInterface({input:process.stdin,crlfDelay:Infinity,terminal:false});
  for await (const line of input) {
    if (!line.trim()) continue;
    let request;
    try { request=JSON.parse(line); const result=await handleRequest(request); if (result) process.stdout.write(`${JSON.stringify(result)}\n`); }
    catch (error) { process.stdout.write(`${JSON.stringify({jsonrpc:"2.0",id:request?.id??null,error:{code:-32000,message:error instanceof Error?error.message:String(error)}})}\n`); }
  }
}
const invoked = process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if (invoked) startServer().catch((error)=>{process.stderr.write(`${error instanceof Error?error.message:String(error)}\n`);process.exitCode=1;});
