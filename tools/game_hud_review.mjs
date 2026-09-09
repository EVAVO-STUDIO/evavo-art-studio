#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

export const SCHEMA = "evavo.game-hud-review-request.v1";
function fail(message) { throw new Error(`GAME_HUD_REVIEW_INVALID: ${message}`); }
function area(rect) { return rect.width * rect.height; }
function intersects(a, b) { return a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y; }
function validateRect(rect, viewport, id) {
  for (const key of ["x","y","width","height"]) if (!Number.isFinite(rect?.[key])) fail(`${id}.${key}`);
  if (rect.width<=0 || rect.height<=0 || rect.x<0 || rect.y<0 || rect.x+rect.width>viewport.width || rect.y+rect.height>viewport.height) fail(`${id} is outside viewport`);
}
export function reviewGameHud(request) {
  if (request?.schemaVersion!==SCHEMA) fail("unsupported schemaVersion");
  const viewport=request.logicalViewport;
  if (!Number.isInteger(viewport?.width) || !Number.isInteger(viewport?.height) || viewport.width<160 || viewport.height<90) fail("logicalViewport");
  if (!Array.isArray(request.elements) || !request.elements.length) fail("elements");
  if (!Array.isArray(request.states) || !request.states.length) fail("states");
  const ids=new Set();
  for (const element of request.elements) {
    if (typeof element.id!=="string" || !element.id || ids.has(element.id)) fail("element ids must be unique");
    ids.add(element.id); validateRect(element.rect,viewport,element.id);
    if (!["permanent","contextual","transient"].includes(element.persistence)) fail(`${element.id}.persistence`);
    if (!["critical","tactical","routine"].includes(element.priority)) fail(`${element.id}.priority`);
    if (!Number.isFinite(element.opacity) || element.opacity<0 || element.opacity>1) fail(`${element.id}.opacity`);
  }
  const byId=new Map(request.elements.map((entry)=>[entry.id,entry])); const viewportArea=viewport.width*viewport.height; const findings=[];
  const states=request.states.map((state)=>{
    const visible=state.visibleElementIds.map((id)=>byId.get(id) ?? fail(`${state.id} references ${id}`));
    const permanent=visible.filter((entry)=>entry.persistence==="permanent");
    const weightedOcclusion=visible.reduce((sum,entry)=>sum+area(entry.rect)*entry.opacity,0)/viewportArea;
    const permanentOcclusion=permanent.reduce((sum,entry)=>sum+area(entry.rect)*entry.opacity,0)/viewportArea;
    const clusters=new Set(permanent.map((entry)=>entry.cluster));
    if (permanentOcclusion>0.08) findings.push({severity:"block",state:state.id,code:"PERMANENT_OCCLUSION",value:permanentOcclusion});
    if (clusters.size>2) findings.push({severity:"block",state:state.id,code:"PERSISTENT_CLUSTER_COUNT",value:clusters.size});
    if (weightedOcclusion>0.16) findings.push({severity:"review",state:state.id,code:"STATE_OCCLUSION",value:weightedOcclusion});
    for (let a=0;a<visible.length;a++) for (let b=a+1;b<visible.length;b++) if (intersects(visible[a].rect,visible[b].rect) && visible[a].cluster!==visible[b].cluster && (visible[a].priority==="critical" || visible[b].priority==="critical")) findings.push({severity:"block",state:state.id,code:"CRITICAL_OVERLAP",elements:[visible[a].id,visible[b].id]});
    return {id:state.id,permanentOcclusion:Number(permanentOcclusion.toFixed(4)),weightedOcclusion:Number(weightedOcclusion.toFixed(4)),persistentClusters:clusters.size};
  });
  const top=request.elements.filter((entry)=>entry.persistence==="permanent" && entry.rect.y<viewport.height*0.12);
  if (top.length) findings.push({severity:"review",code:"PERMANENT_TOP_EDGE",elements:top.map((entry)=>entry.id)});
  if (!request.states.every((state)=>typeof state.capture==="string" && state.capture.length>0)) findings.push({severity:"review",code:"CAPTURE_EVIDENCE_REQUIRED"});
  const blocked=findings.some((finding)=>finding.severity==="block");
  return {schemaVersion:"evavo.game-hud-review.v1",projectId:request.projectId,status:blocked?"blocked":findings.length?"review-required":"pass",principles:["protect gameplay visibility","group by player decision","keep permanent clusters peripheral","let critical cues replace routine cues","review representative captures at runtime scale"],states,findings};
}
async function main() {
  const args=process.argv.slice(2), inputAt=args.indexOf("--input"), outputAt=args.indexOf("--output");
  if (inputAt<0 || !args[inputAt+1]) fail("--input is required");
  const result=reviewGameHud(JSON.parse(await fs.readFile(path.resolve(args[inputAt+1]),"utf8"))); const text=`${JSON.stringify(result,null,2)}\n`;
  if (outputAt>=0 && args[outputAt+1]) await fs.writeFile(path.resolve(args[outputAt+1]),text,"utf8"); else process.stdout.write(text);
  if (result.status==="blocked") process.exitCode=2;
}
if (import.meta.url===`file://${process.argv[1]?.replaceAll("\\","/")}`) await main();
