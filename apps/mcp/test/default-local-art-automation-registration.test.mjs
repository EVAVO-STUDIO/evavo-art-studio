import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("default MCP registers the full governed local art automation stack", async () => {
  const index = await read("src/index.ts");
  const requiredImports = [
    'registerArtDirectionTools',
    'registerArtProductionTools',
    'registerSpritePlanTools',
    'registerSpriteSupervisorTools',
    'registerRepairTools',
    'registerLayeredGodotTools',
    'registerLocalGenerationTools',
    'registerLocalGenerationBatchTools',
  ];
  for (const token of requiredImports) {
    assert.ok(index.includes(token), `missing default MCP registration: ${token}`);
    assert.ok(
      index.includes(`${token}(server);`),
      `default MCP does not invoke: ${token}`,
    );
  }
});

test("default MCP exposes the brokered local two-stage animation execution tool", async () => {
  const local = await read("src/local-generation-tools.ts");
  const supervisor = await read("src/sprite-supervisor-tools.ts");

  for (const token of [
    '"run_two_stage_animation_clip_local"',
    'executeTwoStageAnimationClip(request)',
    'invokeDrawThingsCommission("Prepare")',
    'readPreparedDrawThingsCatalog()',
    'invokeLocalComputeSupervisor(packetPath)',
    'SUPERVISOR_PACKET_SCHEMA',
    '"compile_two_stage_animation_clip"',
    'compileTwoStageAnimationClip(',
  ]) {
    assert.ok(
      local.includes(token) || supervisor.includes(token),
      `missing two-stage automation invariant: ${token}`,
    );
  }

  for (const forbidden of [
    'godotExecutable:',
    'OPENAI_API_KEY =',
    'allowedAdapterIds: ["openai',
  ]) {
    assert.ok(
      !local.includes(forbidden),
      `local execution MCP contains forbidden caller/cloud shortcut: ${forbidden}`,
    );
  }
});
