import assert from "node:assert/strict";
import test from "node:test";

import { listImageAgentGoals, routeImageAgentTask } from "../dist/index.js";

test("all image agent goals resolve to deterministic routes", () => {
  const goals = listImageAgentGoals();
  assert.equal(goals.length, 13);
  for (const goal of goals) {
    const route = routeImageAgentTask(goal);
    assert.equal(route.goal, goal);
    assert.ok(route.primarySurface.length > 0);
    assert.ok(route.orderedTools.length > 0);
    assert.ok(route.evidenceExpected.length > 0);
  }
});

test("fake transparency routes to real-alpha mastering and proof", () => {
  const route = routeImageAgentTask("fake-transparency");
  assert.equal(route.primarySurface, "evavo-raster-finishing");
  assert.ok(route.orderedTools.includes("evavo_master_transparent_asset"));
  assert.ok(route.orderedTools.includes("evavo_create_transparency_proof"));
  assert.equal(route.writeClass, "write-gated-create-only");
});

test("semantic defects require a candidate/provider route rather than filters", () => {
  const route = routeImageAgentTask("semantic-repair");
  assert.equal(route.writeClass, "provider-or-human-candidate-required");
  assert.match(route.notes.join(" "), /Broken anatomy/);
});

test("learned enhancement explicitly checks micro detail and macro redraw risk", () => {
  const route = routeImageAgentTask("learned-enhancement-review");
  assert.match(route.stopConditions.join(" "), /macro redraw risk/);
  assert.match(route.evidenceExpected.join(" "), /macro structure risk/);
});

test("texture route spans map, material, UV, ORM, Godot planning and guarded materialization", () => {
  const route = routeImageAgentTask("texture-review");
  assert.match(route.primarySurface, /evavo-texture-review/);
  assert.match(route.primarySurface, /evavo-godot-material-delivery/);
  assert.ok(route.orderedTools.includes("evavo_review_texture_set"));
  assert.ok(route.orderedTools.includes("evavo_review_obj_uv_layout"));
  assert.ok(route.orderedTools.includes("evavo_pack_godot_orm_texture"));
  assert.ok(route.orderedTools.includes("evavo_plan_godot_material_delivery"));
  assert.ok(route.orderedTools.includes("evavo_write_godot_material_resource"));
  assert.equal(route.writeClass, "write-gated-create-only");
  assert.match(route.stopConditions.join(" "), /UV overlap/);
  assert.match(route.stopConditions.join(" "), /needs-preprocess/);
  assert.match(route.evidenceExpected.join(" "), /StandardMaterial3D or ORMMaterial3D/);
  assert.match(route.evidenceExpected.join(" "), /\.tres/);
  assert.match(route.notes.join(" "), /unapproved/);
});

test("AI artifact assessment never claims pixel-origin detection", () => {
  const route = routeImageAgentTask("ai-artifact-assessment");
  assert.match(route.stopConditions.join(" "), /do not infer authorship/);
  assert.match(route.notes.join(" "), /must not claim pixels alone prove AI authorship/);
});
