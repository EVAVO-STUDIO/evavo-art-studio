#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import readline from "node:readline";
import test from "node:test";

const serverPath = new URL("../tools/animation_character_family_v1_mcp.mjs", import.meta.url);

function request() {
  return {
    schema: "evavo.animation-character-family.request.v1",
    protocolVersion: "2026-09-01.2",
    familyId: "mcp-test-family",
    revision: 1,
    projectId: "mcp-test-project",
    title: "MCP test family",
    subject: {
      subjectId: "test-character",
      identityLockId: "test-identity",
      identityRevision: 1,
      identityReferenceArtifactId: `artifact_${"a".repeat(64)}`,
      asymmetricVisualAnchors: [],
      mirrorPolicy: "safe-horizontal",
    },
    style: {
      styleId: "test-style",
      styleRevision: 1,
      paletteLockId: "test-palette",
      motionStyle: "pixel-90s",
      lineTreatment: "Crisp authored pixel clusters.",
      antiGenericTraits: ["specific silhouette", "weighted timing", "purposeful frame economy"],
      exclusions: ["rubbery tweening", "generic posing", "camera drift"],
    },
    camera: {
      profileId: "test-side-camera",
      perspective: "side-stage",
      projection: "orthographic",
      motion: "locked",
      yawDegrees: 0,
      pitchDegrees: 0,
      rollDegrees: 0,
      scale: 1,
      groundLineNormalized: 0.8,
      movementPlane: "screen-x-ground-y",
      framing: "Full character.",
    },
    delivery: {
      canvas: { width: 128, height: 128 },
      pivot: { x: 0.5, y: 0.82 },
      alphaRequired: true,
      trim: false,
      textureFiltering: "nearest",
      targets: ["godot-sprite"],
    },
    coverage: {
      preset: "custom",
      actions: ["idle", "walk"],
      directionalResolution: "perspective-default",
      allowMirroredCoverage: true,
      preferredSourceDirection: "right",
      noMirrorActions: [],
      cycleFrames: { idle: 8, walk: 8 },
    },
    timing: {
      playbackFpsPolicy: "uniform",
      preferredPlaybackFps: 12,
      maximumTransitionGapFrames: 2,
      locomotionSyncMode: "cyclic-constant",
    },
  };
}

class Client {
  constructor(role) {
    this.child = spawn(process.execPath, [serverPath.pathname], {
      env: {
        ...process.env,
        EVAVO_ANIMATION_CHARACTER_FAMILY_ROLE: role,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.nextId = 1;
    this.pending = new Map();
    const lines = readline.createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => {
      const message = JSON.parse(line);
      const pending = this.pending.get(message.id);
      if (pending) {
        this.pending.delete(message.id);
        pending.resolve(message);
      }
    });
  }

  call(method, params = {}) {
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return promise;
  }

  async close() {
    this.child.stdin.end();
    if (this.child.exitCode === null) await once(this.child, "exit");
  }
}

async function initialize(client) {
  const response = await client.call("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0.0" },
  });
  assert.equal(response.result.serverInfo.name, "evavo-animation-character-family-v1");
}

test("Art role owns planning but cannot compile the independent Cel receipt", async () => {
  const client = new Client("art-studio");
  try {
    await initialize(client);
    const listed = await client.call("tools/list");
    const names = listed.result.tools.map((tool) => tool.name);
    assert.equal(names.includes("compile_animation_character_family_plan_v1"), true);
    assert.equal(names.includes("compile_animation_character_family_review_receipt_v1"), false);

    const compiled = await client.call("tools/call", {
      name: "compile_animation_character_family_plan_v1",
      arguments: { request: request() },
    });
    assert.equal(compiled.result.structuredContent.schema, "evavo.animation-character-family.plan.v1");
    assert.equal(compiled.result.structuredContent.summary.authoredSourceSlots, 2);
    assert.equal(compiled.result.structuredContent.authority.creativeApproval, false);

    const denied = await client.call("tools/call", {
      name: "compile_animation_character_family_review_receipt_v1",
      arguments: {},
    });
    assert.match(denied.error.message, /CEL_REVIEW_AUTHORITY_REQUIRED/u);
  } finally {
    await client.close();
  }
});

test("Cel role owns independent receipt compilation but cannot create plans", async () => {
  const client = new Client("cel-animation-studio");
  try {
    await initialize(client);
    const listed = await client.call("tools/list");
    const names = listed.result.tools.map((tool) => tool.name);
    assert.equal(names.includes("compile_animation_character_family_review_receipt_v1"), true);
    assert.equal(names.includes("compile_animation_character_family_plan_v1"), false);

    const denied = await client.call("tools/call", {
      name: "compile_animation_character_family_plan_v1",
      arguments: { request: request() },
    });
    assert.match(denied.error.message, /ART_AUTHORITY_REQUIRED/u);
  } finally {
    await client.close();
  }
});

test("MCP rejects embedded credential fields before invoking family logic", async () => {
  const client = new Client("art-studio");
  try {
    await initialize(client);
    const response = await client.call("tools/call", {
      name: "compile_animation_character_family_plan_v1",
      arguments: { request: { ...request(), apiKey: "should-never-enter-a-contract" } },
    });
    assert.match(response.error.message, /CREDENTIAL_KEY_FORBIDDEN/u);
  } finally {
    await client.close();
  }
});

test("invalid server roles fail closed", async () => {
  const child = spawn(process.execPath, [serverPath.pathname], {
    env: { ...process.env, EVAVO_ANIMATION_CHARACTER_FAMILY_ROLE: "provider" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [code] = await once(child, "exit");
  assert.equal(code, 1);
});
