#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";

export const SCHEMA = "evavo.game-hud-review-request.v1";
const PROFILES = {
  "vertical-combat": { permanentOcclusion: 0.065, stateOcclusion: 0.14, permanentClusters: 2 },
  "side-scroller": { permanentOcclusion: 0.07, stateOcclusion: 0.15, permanentClusters: 2 },
  "strategy": { permanentOcclusion: 0.18, stateOcclusion: 0.28, permanentClusters: 3 },
  "general": { permanentOcclusion: 0.08, stateOcclusion: 0.16, permanentClusters: 2 },
};
function fail(message) { throw new Error(`GAME_HUD_REVIEW_INVALID: ${message}`); }
function area(rect) { return rect.width * rect.height; }
function intersects(a, b) { return a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y; }
function validateRect(rect, viewport, id) {
  for (const key of ["x","y","width","height"]) if (!Number.isFinite(rect?.[key])) fail(`${id}.${key}`);
  if (rect.width<=0 || rect.height<=0 || rect.x<0 || rect.y<0 || rect.x+rect.width>viewport.width || rect.y+rect.height>viewport.height) fail(`${id} is outside viewport`);
}
function nonEmpty(value) { return typeof value==="string" && value.trim().length>0; }
export function reviewGameHud(request) {
  if (request?.schemaVersion!==SCHEMA) fail("unsupported schemaVersion");
  const viewport=request.logicalViewport;
  if (!Number.isInteger(viewport?.width) || !Number.isInteger(viewport?.height) || viewport.width<160 || viewport.height<90) fail("logicalViewport");
  if (!Array.isArray(request.elements) || !request.elements.length) fail("elements");
  if (!Array.isArray(request.states) || !request.states.length) fail("states");
  const profile=PROFILES[request.genreProfile ?? "general"];
  if (!profile) fail("genreProfile");
  const ids=new Set();
  for (const element of request.elements) {
    if (typeof element.id!=="string" || !element.id || ids.has(element.id)) fail("element ids must be unique");
    ids.add(element.id); validateRect(element.rect,viewport,element.id);
    if (!["permanent","contextual","transient"].includes(element.persistence)) fail(`${element.id}.persistence`);
    if (!["critical","tactical","routine"].includes(element.priority)) fail(`${element.id}.priority`);
    if (!Number.isFinite(element.opacity) || element.opacity<0 || element.opacity>1) fail(`${element.id}.opacity`);
    if (element.adaptiveHousing!==undefined) {
      if (element.adaptiveHousing?.trigger!=="gameplay-overlap") fail(`${element.id}.adaptiveHousing.trigger`);
      if (!Number.isFinite(element.adaptiveHousing?.yieldOpacity) || element.adaptiveHousing.yieldOpacity<0 || element.adaptiveHousing.yieldOpacity>=element.opacity) fail(`${element.id}.adaptiveHousing.yieldOpacity`);
    }
  }
  const byId=new Map(request.elements.map((entry)=>[entry.id,entry])); const viewportArea=viewport.width*viewport.height; const findings=[];
  const criticalDecisions=Array.isArray(request.criticalDecisions) ? request.criticalDecisions : [];
  if (!criticalDecisions.length || criticalDecisions.some((entry)=>!nonEmpty(entry)) || new Set(criticalDecisions).size!==criticalDecisions.length) findings.push({severity:"block",code:"CRITICAL_DECISIONS_REQUIRED"});
  const decisionElements=new Map(criticalDecisions.map((entry)=>[entry,[]]));
  for (const element of request.elements) for (const decision of element.decisionIds ?? []) {
    if (!decisionElements.has(decision)) fail(`${element.id}.decisionIds references undeclared decision ${decision}`);
    decisionElements.get(decision).push(element);
  }
  for (const [decision,elements] of decisionElements) {
    if (!elements.length) findings.push({severity:"block",code:"CRITICAL_DECISION_MISSING",decision});
    const permanentClusters=new Set(elements.filter((entry)=>entry.persistence==="permanent").map((entry)=>entry.cluster));
    if (permanentClusters.size>1) findings.push({severity:"review",code:"CRITICAL_DECISION_DUPLICATED",decision,elements:elements.map((entry)=>entry.id)});
  }
  const style=request.styleContract;
  const requiredStyleFields=["visualPeriod","fiction","typography","iconLanguage","framingLanguage"];
  const styleComplete=Boolean(style && requiredStyleFields.every((key)=>nonEmpty(style[key])) && Number.isInteger(style.nativePixelGrid) && style.nativePixelGrid>0 && Array.isArray(style.opacityHierarchy) && style.opacityHierarchy.length>=3 && style.semanticColors && typeof style.semanticColors==="object" && Object.keys(style.semanticColors).length>=3);
  if (!styleComplete) findings.push({severity:"block",code:"STYLE_CONTRACT_REQUIRED",required:[...requiredStyleFields,"nativePixelGrid","opacityHierarchy[3+]","semanticColors[3+]" ]});
  const states=request.states.map((state)=>{
    const visible=state.visibleElementIds.map((id)=>byId.get(id) ?? fail(`${state.id} references ${id}`));
    const permanent=visible.filter((entry)=>entry.persistence==="permanent");
    const weightedOcclusion=visible.reduce((sum,entry)=>sum+area(entry.rect)*entry.opacity,0)/viewportArea;
    const permanentOcclusion=permanent.reduce((sum,entry)=>sum+area(entry.rect)*entry.opacity,0)/viewportArea;
    const clusters=new Set(permanent.map((entry)=>entry.cluster));
    if (permanentOcclusion>profile.permanentOcclusion) findings.push({severity:"block",state:state.id,code:"PERMANENT_OCCLUSION",value:permanentOcclusion,limit:profile.permanentOcclusion});
    if (clusters.size>profile.permanentClusters) findings.push({severity:"block",state:state.id,code:"PERSISTENT_CLUSTER_COUNT",value:clusters.size,limit:profile.permanentClusters});
    if (weightedOcclusion>profile.stateOcclusion) findings.push({severity:"review",state:state.id,code:"STATE_OCCLUSION",value:weightedOcclusion,limit:profile.stateOcclusion});
    for (const id of state.gameplayOverlapElementIds ?? []) {
      const element=byId.get(id) ?? fail(`${state.id} gameplay overlap references ${id}`);
      if (!visible.includes(element)) fail(`${state.id} gameplay overlap is not visible: ${id}`);
      if (element.persistence==="permanent" && !element.adaptiveHousing) findings.push({severity:"block",state:state.id,code:"GAMEPLAY_OCCLUSION_WITHOUT_YIELD",elements:[id]});
    }
    for (let a=0;a<visible.length;a++) for (let b=a+1;b<visible.length;b++) if (intersects(visible[a].rect,visible[b].rect) && visible[a].cluster!==visible[b].cluster && (visible[a].priority==="critical" || visible[b].priority==="critical")) findings.push({severity:"block",state:state.id,code:"CRITICAL_OVERLAP",elements:[visible[a].id,visible[b].id]});
    return {id:state.id,permanentOcclusion:Number(permanentOcclusion.toFixed(4)),weightedOcclusion:Number(weightedOcclusion.toFixed(4)),persistentClusters:clusters.size};
  });
  const top=request.elements.filter((entry)=>entry.persistence==="permanent" && entry.rect.y<viewport.height*0.12);
  if (top.length) findings.push({severity:"review",code:"PERMANENT_TOP_EDGE",elements:top.map((entry)=>entry.id)});
  if (!request.states.every((state)=>typeof state.capture==="string" && state.capture.length>0)) findings.push({severity:"review",code:"CAPTURE_EVIDENCE_REQUIRED"});
  const blocked=findings.some((finding)=>finding.severity==="block");
  const uxStudioObservations={gameplay_hud_occlusion_acceptable:!findings.some((finding)=>["PERMANENT_OCCLUSION","STATE_OCCLUSION","GAMEPLAY_OCCLUSION_WITHOUT_YIELD","CRITICAL_OVERLAP"].includes(finding.code)),critical_hud_state_glanceable:!findings.some((finding)=>["CRITICAL_DECISIONS_REQUIRED","CRITICAL_DECISION_MISSING","CRITICAL_DECISION_DUPLICATED","PERSISTENT_CLUSTER_COUNT"].includes(finding.code)),hud_visual_language_coherent:styleComplete};
  return {schemaVersion:"evavo.game-hud-review.v1",projectId:request.projectId,genreProfile:request.genreProfile ?? "general",budget:profile,status:blocked?"blocked":findings.length?"review-required":"pass",principles:["protect gameplay visibility","group by player decision","keep permanent clusters peripheral","fade instrument housing when world geometry crosses it","keep critical symbology legible while housing yields","let critical cues replace routine cues","bind typography, icons, frames and color to one declared visual language","review representative captures at runtime scale"],styleContract:style ?? null,criticalDecisions,uxStudioObservations,states,findings};
}
async function main() {
  const args=process.argv.slice(2), inputAt=args.indexOf("--input"), outputAt=args.indexOf("--output");
  if (inputAt<0 || !args[inputAt+1]) fail("--input is required");
  const result=reviewGameHud(JSON.parse(await fs.readFile(path.resolve(args[inputAt+1]),"utf8"))); const text=`${JSON.stringify(result,null,2)}\n`;
  if (outputAt>=0 && args[outputAt+1]) await fs.writeFile(path.resolve(args[outputAt+1]),text,"utf8"); else process.stdout.write(text);
  if (result.status==="blocked") process.exitCode=2;
}
if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) await main();
