import test from "node:test";
import assert from "node:assert/strict";
import {reviewGameHud,SCHEMA} from "./game_hud_review.mjs";
const base={schemaVersion:SCHEMA,projectId:"hypersonic",genreProfile:"vertical-combat",logicalViewport:{width:640,height:360},elements:[
  {id:"flight",rect:{x:8,y:270,width:128,height:28},persistence:"permanent",priority:"tactical",opacity:0.24,cluster:"lower-left",adaptiveHousing:{trigger:"gameplay-overlap",yieldOpacity:0.12}},
  {id:"systems-radar",rect:{x:532,y:270,width:100,height:80},persistence:"permanent",priority:"critical",opacity:0.25,cluster:"lower-right",adaptiveHousing:{trigger:"gameplay-overlap",yieldOpacity:0.12}},
  {id:"warning",rect:{x:504,y:250,width:128,height:16},persistence:"transient",priority:"critical",opacity:0.76,cluster:"lower-right"}],states:[
  {id:"cruise",visibleElementIds:["flight","systems-radar"],capture:"work/hud/cruise.png"},
  {id:"missile",visibleElementIds:["flight","systems-radar","warning"],capture:"work/hud/missile.png"}]};
test("accepts a peripheral two-cluster HUD with runtime evidence",()=>{const result=reviewGameHud(base);assert.equal(result.status,"pass");assert.equal(result.findings.length,0);});
test("blocks a dense permanent dashboard",()=>{const crowded=structuredClone(base);crowded.elements.push({id:"top-dashboard",rect:{x:0,y:0,width:640,height:90},persistence:"permanent",priority:"routine",opacity:0.9,cluster:"top"});crowded.states[0].visibleElementIds.push("top-dashboard");const result=reviewGameHud(crowded);assert.equal(result.status,"blocked");assert.ok(result.findings.some((finding)=>finding.code==="PERMANENT_OCCLUSION"));assert.ok(result.findings.some((finding)=>finding.code==="PERSISTENT_CLUSTER_COUNT"));});
test("requires capture evidence",()=>{const missing=structuredClone(base);delete missing.states[1].capture;const result=reviewGameHud(missing);assert.equal(result.status,"review-required");assert.ok(result.findings.some((finding)=>finding.code==="CAPTURE_EVIDENCE_REQUIRED"));});
test("accepts adaptive housing where gameplay crosses a permanent instrument",()=>{const overlap=structuredClone(base);overlap.states[0].gameplayOverlapElementIds=["systems-radar"];const result=reviewGameHud(overlap);assert.equal(result.status,"pass");assert.equal(result.genreProfile,"vertical-combat");});
test("blocks permanent housing that cannot yield to gameplay",()=>{const overlap=structuredClone(base);delete overlap.elements[1].adaptiveHousing;overlap.states[0].gameplayOverlapElementIds=["systems-radar"];const result=reviewGameHud(overlap);assert.equal(result.status,"blocked");assert.ok(result.findings.some((finding)=>finding.code==="GAMEPLAY_OCCLUSION_WITHOUT_YIELD"));});
