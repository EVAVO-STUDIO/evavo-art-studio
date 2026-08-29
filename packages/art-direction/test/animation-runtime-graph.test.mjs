import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  ANIMATION_RUNTIME_GRAPH_KIND,
  ANIMATION_RUNTIME_GRAPH_PROTOCOL_VERSION,
  assertAnimationRuntimeGraphIntegrity,
  animationRuntimeGraphSha256,
  compileAnimationRuntimeGraph,
  compileGodotAnimationRuntimeGraph,
  resolveAnimationRuntimeTransition,
} from "../dist/index.js";

const hash = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

test("locks the shared runtime-graph schema to its recorded SHA-256", () => {
  const schema = readFileSync(
    new URL("../../../contracts/animation-runtime-graph-v1.schema.json", import.meta.url),
  );
  const lock = JSON.parse(
    readFileSync(
      new URL("../../../contracts/animation-runtime-graph-v1.lock.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(lock.protocolVersion, ANIMATION_RUNTIME_GRAPH_PROTOCOL_VERSION);
  assert.equal(lock.sha256, `sha256:${createHash("sha256").update(schema).digest("hex")}`);
});

function clip({
  id,
  kind,
  frameCount,
  loopMode,
  phaseFamily,
  markers = [],
  direction = "right",
  mirrorPolicy = "forbidden",
  asymmetricVisualAnchors = [],
}) {
  return {
    id,
    animationName: id.replace("clip.", ""),
    kind,
    direction,
    cameraProfileId: "side-stage-90s",
    sourcePlanDigest: hash(id),
    frameCount,
    framesPerSecond: 12,
    frameDurations: Array.from({ length: frameCount }, () => 1),
    loopMode,
    ...(phaseFamily ? { phaseFamily } : {}),
    mirrorPolicy,
    asymmetricVisualAnchors,
    markers,
  };
}

function request() {
  return {
    protocolVersion: ANIMATION_RUNTIME_GRAPH_PROTOCOL_VERSION,
    kind: ANIMATION_RUNTIME_GRAPH_KIND,
    id: "hero.side-stage.runtime",
    revision: 1,
    subjectId: "hero",
    cameraProfileId: "side-stage-90s",
    initialStateId: "idle.right",
    parameters: [
      { id: "moving", type: "boolean", defaultValue: false },
      { id: "running", type: "boolean", defaultValue: false },
      { id: "hit", type: "trigger", defaultValue: null },
      { id: "die", type: "trigger", defaultValue: null },
    ],
    clips: [
      clip({ id: "clip.idle.right", kind: "idle", frameCount: 4, loopMode: "linear" }),
      clip({
        id: "clip.walk.right",
        kind: "locomotion",
        frameCount: 8,
        loopMode: "linear",
        phaseFamily: "locomotion.right",
        markers: [
          { id: "left.contact", frame: 1, kind: "left-contact" },
          { id: "right.contact", frame: 5, kind: "right-contact" },
        ],
      }),
      clip({
        id: "clip.run.right",
        kind: "locomotion",
        frameCount: 6,
        loopMode: "linear",
        phaseFamily: "locomotion.right",
        markers: [
          { id: "left.contact", frame: 1, kind: "left-contact" },
          { id: "right.contact", frame: 4, kind: "right-contact" },
        ],
      }),
      clip({
        id: "clip.attack.right",
        kind: "action",
        frameCount: 7,
        loopMode: "none",
        asymmetricVisualAnchors: ["sword.right-hand"],
        markers: [
          { id: "attack.cancel.open", frame: 5, kind: "cancel-open" },
          { id: "attack.hitbox.on", frame: 3, kind: "hitbox-on", payload: "sword.primary" },
          { id: "attack.hitbox.off", frame: 5, kind: "hitbox-off", payload: "sword.primary" },
        ],
      }),
      clip({ id: "clip.hit.right", kind: "reaction", frameCount: 4, loopMode: "none" }),
      clip({ id: "clip.death.right", kind: "death", frameCount: 9, loopMode: "none" }),
    ],
    states: [
      { id: "idle.right", clipId: "clip.idle.right", entryFrame: 1, speedScale: 1, terminal: false },
      { id: "walk.right", clipId: "clip.walk.right", entryFrame: 1, speedScale: 1, terminal: false },
      { id: "run.right", clipId: "clip.run.right", entryFrame: 1, speedScale: 1, terminal: false },
      { id: "attack.right", clipId: "clip.attack.right", entryFrame: 1, speedScale: 1, terminal: false },
      { id: "hit.right", clipId: "clip.hit.right", entryFrame: 1, speedScale: 1, terminal: false },
      { id: "death.right", clipId: "clip.death.right", entryFrame: 1, speedScale: 1, terminal: true },
    ],
    transitions: [
      {
        id: "idle.to.walk",
        fromStateId: "idle.right",
        toStateId: "walk.right",
        trigger: { kind: "parameter", parameterId: "moving" },
        priority: 30,
        switchMode: "immediate",
        resetTarget: true,
        preserveCyclePhase: false,
        conditions: [],
      },
      {
        id: "walk.to.idle",
        fromStateId: "walk.right",
        toStateId: "idle.right",
        trigger: { kind: "automatic" },
        priority: 30,
        switchMode: "immediate",
        resetTarget: true,
        preserveCyclePhase: false,
        conditions: [{ parameterId: "moving", operator: "equals", value: false }],
      },
      {
        id: "walk.to.run",
        fromStateId: "walk.right",
        toStateId: "run.right",
        trigger: { kind: "parameter", parameterId: "running" },
        priority: 20,
        switchMode: "synchronized",
        resetTarget: false,
        preserveCyclePhase: true,
        conditions: [{ parameterId: "moving", operator: "equals", value: true }],
      },
      {
        id: "run.to.walk",
        fromStateId: "run.right",
        toStateId: "walk.right",
        trigger: { kind: "automatic" },
        priority: 20,
        switchMode: "synchronized",
        resetTarget: false,
        preserveCyclePhase: true,
        conditions: [{ parameterId: "running", operator: "equals", value: false }],
      },
      {
        id: "any.to.attack",
        fromStateId: "*",
        excludedFromStateIds: ["attack.right", "death.right", "hit.right"],
        toStateId: "attack.right",
        trigger: { kind: "command", command: "attack.primary" },
        priority: 10,
        switchMode: "immediate",
        resetTarget: true,
        preserveCyclePhase: false,
        conditions: [],
      },
      {
        id: "attack.to.idle",
        fromStateId: "attack.right",
        toStateId: "idle.right",
        trigger: { kind: "automatic" },
        priority: 50,
        switchMode: "at-end",
        resetTarget: true,
        preserveCyclePhase: false,
        conditions: [],
      },
      {
        id: "any.to.hit",
        fromStateId: "*",
        excludedFromStateIds: ["death.right", "hit.right"],
        toStateId: "hit.right",
        trigger: { kind: "parameter", parameterId: "hit" },
        priority: 1,
        switchMode: "immediate",
        resetTarget: true,
        preserveCyclePhase: false,
        conditions: [],
      },
      {
        id: "hit.to.idle",
        fromStateId: "hit.right",
        toStateId: "idle.right",
        trigger: { kind: "automatic" },
        priority: 50,
        switchMode: "at-end",
        resetTarget: true,
        preserveCyclePhase: false,
        conditions: [],
      },
      {
        id: "any.to.death",
        fromStateId: "*",
        excludedFromStateIds: ["death.right"],
        toStateId: "death.right",
        trigger: { kind: "parameter", parameterId: "die" },
        priority: 0,
        switchMode: "immediate",
        resetTarget: true,
        preserveCyclePhase: false,
        conditions: [],
      },
    ],
  };
}

test("uses a browser-safe SHA-256 implementation and rejects malformed JSON shapes", () => {
  assert.equal(
    animationRuntimeGraphSha256("abc"),
    "sha256:6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25",
  );
  assert.throws(
    () => compileAnimationRuntimeGraph({ ...request(), clips: null }),
    /CLIPS_INVALID|COLLECTIONS_INVALID/,
  );
});

test("compiles a promotable complete character graph and Godot descriptor", () => {
  const plan = compileAnimationRuntimeGraph(request(), new Date("2026-08-30T00:00:00.000Z"));
  assert.equal(plan.quality.promotable, true);
  assert.equal(plan.quality.blockerCount, 0);
  assert.deepEqual(plan.quality.unreachableStateIds, []);
  assert.match(plan.contentDigest, /^sha256:[0-9a-f]{64}$/);
  assert.doesNotThrow(() => assertAnimationRuntimeGraphIntegrity(plan));

  const godot = compileGodotAnimationRuntimeGraph(plan);
  assert.equal(godot.targetEngine, "Godot 4.6.2");
  assert.equal(godot.driver, "animated-sprite2d-controller");
  assert.equal(godot.blendMode, "discrete");
  assert.equal(godot.states.length, 6);
  assert.equal(godot.transitions.find((entry) => entry.id === "walk.to.run")?.godotSwitchModeValue, 1);
  assert.equal(godot.transitions.find((entry) => entry.id === "attack.to.idle")?.runtimeGate, "animation-finished");
  assert.equal(godot.eventMarkers.some((entry) => entry.kind === "hitbox-on"), true);
});

test("preserves weighted locomotion cycle phase and prefers lower numeric priority", () => {
  const plan = compileAnimationRuntimeGraph(request());
  const locomotion = resolveAnimationRuntimeTransition({
    plan,
    currentStateId: "walk.right",
    currentFrame: 5,
    frameProgress: 0.5,
    parameterValues: { moving: true, running: true },
  });
  assert.equal(locomotion?.transitionId, "walk.to.run");
  assert.equal(locomotion?.toStateId, "run.right");
  assert.equal(locomotion?.targetFrame, 4);
  assert.ok(Math.abs((locomotion?.targetFrameProgress ?? 0) - 0.375) < 1e-9);
  assert.ok(Math.abs((locomotion?.carriedCyclePhase ?? 0) - 0.5625) < 1e-9);

  const death = resolveAnimationRuntimeTransition({
    plan,
    currentStateId: "walk.right",
    currentFrame: 2,
    activeTriggers: ["hit", "die"],
    parameterValues: { moving: true, running: false },
  });
  assert.equal(death?.transitionId, "any.to.death");
  assert.equal(death?.toStateId, "death.right");
});

test("respects at-end gates and keeps non-triggered automatic conditions inert", () => {
  const plan = compileAnimationRuntimeGraph(request());
  assert.equal(
    resolveAnimationRuntimeTransition({
      plan,
      currentStateId: "attack.right",
      currentFrame: 7,
      atEnd: false,
    }),
    null,
  );
  const finished = resolveAnimationRuntimeTransition({
    plan,
    currentStateId: "attack.right",
    currentFrame: 7,
    atEnd: true,
  });
  assert.equal(finished?.transitionId, "attack.to.idle");
  assert.equal(finished?.targetFrame, 1);
});

test("normalises collection order into one deterministic digest", () => {
  const first = request();
  const second = request();
  second.parameters.reverse();
  second.clips.reverse();
  second.states.reverse();
  second.transitions.reverse();
  const a = compileAnimationRuntimeGraph(first, new Date("2026-08-30T00:00:00.000Z"));
  const b = compileAnimationRuntimeGraph(second, new Date("2026-08-30T01:00:00.000Z"));
  assert.equal(a.contentDigest, b.contentDigest);
  assert.notEqual(a.generatedAt, b.generatedAt);
});

test("blocks unsafe runtime graphs instead of weakening transition rules", () => {
  const unsafe = request();
  unsafe.transitions.push({
    id: "walk.to.hit.ambiguous",
    fromStateId: "walk.right",
    toStateId: "hit.right",
    trigger: { kind: "parameter", parameterId: "running" },
    priority: 20,
    switchMode: "synchronized",
    resetTarget: false,
    preserveCyclePhase: true,
    conditions: [{ parameterId: "moving", operator: "equals", value: true }],
  });
  unsafe.transitions.push({
    id: "death.to.idle.invalid",
    fromStateId: "death.right",
    toStateId: "idle.right",
    trigger: { kind: "automatic" },
    priority: 99,
    switchMode: "at-end",
    resetTarget: true,
    preserveCyclePhase: false,
    conditions: [],
  });
  const plan = compileAnimationRuntimeGraph(unsafe);
  const codes = new Set(plan.quality.findings.map((entry) => entry.code));
  assert.equal(plan.quality.promotable, false);
  assert.ok(codes.has("ANIMATION_RUNTIME_TRANSITION_AMBIGUOUS"));
  assert.ok(codes.has("ANIMATION_RUNTIME_PHASE_FAMILY_MISMATCH"));
  assert.ok(codes.has("ANIMATION_RUNTIME_TERMINAL_STATE_HAS_TRANSITION"));
  assert.throws(() => compileGodotAnimationRuntimeGraph(plan), /NOT_PROMOTABLE/);
});

test("blocks at-end transitions from looping clips and unconditional automatic cycles", () => {
  const unsafe = request();
  unsafe.transitions = unsafe.transitions.filter((entry) => entry.id !== "walk.to.idle");
  unsafe.transitions.push({
    id: "walk.to.hit.at-end.invalid",
    fromStateId: "walk.right",
    toStateId: "hit.right",
    trigger: { kind: "command", command: "finish.walk" },
    priority: 60,
    switchMode: "at-end",
    resetTarget: true,
    preserveCyclePhase: false,
    conditions: [],
  });
  unsafe.transitions.push({
    id: "idle.to.walk.automatic",
    fromStateId: "idle.right",
    toStateId: "walk.right",
    trigger: { kind: "automatic" },
    priority: 31,
    switchMode: "immediate",
    resetTarget: true,
    preserveCyclePhase: false,
    conditions: [],
  });
  unsafe.transitions.push({
    id: "walk.to.idle.automatic",
    fromStateId: "walk.right",
    toStateId: "idle.right",
    trigger: { kind: "automatic" },
    priority: 32,
    switchMode: "immediate",
    resetTarget: true,
    preserveCyclePhase: false,
    conditions: [],
  });
  const plan = compileAnimationRuntimeGraph(unsafe);
  const codes = new Set(plan.quality.findings.map((entry) => entry.code));
  assert.ok(codes.has("ANIMATION_RUNTIME_AT_END_FROM_LOOPING_CLIP"));
  assert.ok(codes.has("ANIMATION_RUNTIME_AUTOMATIC_TRANSITION_CYCLE"));
});

test("detects tampering and unsafe mirroring", () => {
  const unsafe = request();
  unsafe.clips.find((entry) => entry.id === "clip.attack.right").mirrorPolicy = "safe-horizontal";
  const plan = compileAnimationRuntimeGraph(unsafe);
  assert.ok(plan.quality.findings.some((entry) => entry.code === "ANIMATION_RUNTIME_UNSAFE_MIRROR_POLICY"));

  const valid = compileAnimationRuntimeGraph(request());
  const tampered = { ...valid, initialStateId: "walk.right" };
  assert.throws(() => assertAnimationRuntimeGraphIntegrity(tampered), /DIGEST_MISMATCH|QUALITY_MISMATCH/);
});

test("rejects duplicate runtime names and impossible transition conditions", () => {
  const duplicateName = request();
  duplicateName.clips[1].animationName = duplicateName.clips[0].animationName;
  assert.throws(
    () => compileAnimationRuntimeGraph(duplicateName),
    /ANIMATION_RUNTIME_CLIP_ANIMATION_NAME_DUPLICATE/,
  );

  const contradictory = request();
  contradictory.transitions.push({
    id: "idle.to.hit.never",
    fromStateId: "idle.right",
    toStateId: "hit.right",
    trigger: { kind: "automatic" },
    priority: 80,
    switchMode: "immediate",
    resetTarget: true,
    preserveCyclePhase: false,
    conditions: [
      { parameterId: "moving", operator: "equals", value: true },
      { parameterId: "moving", operator: "equals", value: false },
    ],
  });
  const plan = compileAnimationRuntimeGraph(contradictory);
  assert.equal(plan.quality.promotable, false);
  assert.ok(
    plan.quality.findings.some(
      (entry) => entry.code === "ANIMATION_RUNTIME_TRANSITION_CONDITIONS_UNSATISFIABLE",
    ),
  );
});

test("blocks terminal looping and misaligned locomotion contact phases", () => {
  const terminalLoop = request();
  terminalLoop.clips.find((entry) => entry.id === "clip.death.right").loopMode = "linear";
  const terminalPlan = compileAnimationRuntimeGraph(terminalLoop);
  assert.ok(
    terminalPlan.quality.findings.some(
      (entry) => entry.code === "ANIMATION_RUNTIME_TERMINAL_STATE_LOOPS",
    ),
  );

  const misaligned = request();
  const run = misaligned.clips.find((entry) => entry.id === "clip.run.right");
  run.markers = [
    { id: "left.contact", frame: 1, kind: "left-contact" },
    { id: "right.contact", frame: 5, kind: "right-contact" },
  ];
  const phasePlan = compileAnimationRuntimeGraph(misaligned);
  assert.ok(
    phasePlan.quality.findings.some(
      (entry) => entry.code === "ANIMATION_RUNTIME_CONTACT_PHASE_MISMATCH",
    ),
  );
});

test("binds runtime marker and completion evidence to the current frame", () => {
  const source = request();
  source.transitions.push({
    id: "attack.cancel.to.idle",
    fromStateId: "attack.right",
    toStateId: "idle.right",
    trigger: { kind: "command", command: "attack.cancel" },
    priority: 5,
    switchMode: "at-marker",
    markerId: "attack.cancel.open",
    resetTarget: true,
    preserveCyclePhase: false,
    conditions: [],
  });
  const plan = compileAnimationRuntimeGraph(source);
  assert.equal(plan.quality.promotable, true);

  assert.throws(
    () =>
      resolveAnimationRuntimeTransition({
        plan,
        currentStateId: "attack.right",
        currentFrame: 4,
        firedMarkerIds: ["attack.cancel.open"],
        activeCommands: ["attack.cancel"],
      }),
    /ANIMATION_RUNTIME_FIRED_MARKER_FRAME_MISMATCH/,
  );
  assert.throws(
    () =>
      resolveAnimationRuntimeTransition({
        plan,
        currentStateId: "attack.right",
        currentFrame: 6,
        atEnd: true,
      }),
    /ANIMATION_RUNTIME_AT_END_FRAME_MISMATCH/,
  );
  assert.throws(
    () =>
      resolveAnimationRuntimeTransition({
        plan,
        currentStateId: "walk.right",
        currentFrame: 2,
        parameterValues: { running: 1 },
      }),
    /ANIMATION_RUNTIME_PARAMETER_VALUE_TYPE_INVALID/,
  );

  const resolved = resolveAnimationRuntimeTransition({
    plan,
    currentStateId: "attack.right",
    currentFrame: 5,
    firedMarkerIds: ["attack.cancel.open"],
    activeCommands: ["attack.cancel"],
  });
  assert.equal(resolved?.transitionId, "attack.cancel.to.idle");
  assert.equal(resolved?.targetFrame, 1);
});
