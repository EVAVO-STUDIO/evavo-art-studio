import assert from "node:assert/strict";
import test from "node:test";

import { listImageAgentGoals, routeImageAgentTask } from "../dist/index.js";

test("all image agent goals resolve to deterministic routes", () => {
  const goals = listImageAgentGoals();
  assert.equal(goals.length, 14);
  for (const goal of goals) {
    const route = routeImageAgentTask(goal);
    assert.equal(route.goal, goal);
    assert.ok(route.primarySurface.length > 0);
    assert.ok(route.orderedTools.length > 0);
    assert.ok(route.evidenceExpected.length > 0);
  }
});

test("ordinary quality review prefers the unified finishing packet", () => {
  const route = routeImageAgentTask("quality-review");
  assert.equal(route.primarySurface, "evavo-image-finishing-packet");
  assert.equal(route.orderedTools[0], "evavo_review_image_finishing_packet");
  assert.ok(route.orderedTools.includes("evavo_review_image_for_finishing"));
  assert.equal(route.writeClass, "read-only");
  assert.match(route.evidenceExpected.join(" "), /combined disposition and priority/);
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

test("approved-reference consistency is separate from frame continuity and never claims identity or AI origin", () => {
  const route = routeImageAgentTask("reference-consistency");
  assert.equal(route.primarySurface, "evavo-image-reference-consistency");
  assert.equal(route.writeClass, "read-only");
  assert.ok(route.orderedTools.includes("evavo_review_image_against_references"));
  assert.ok(route.orderedTools.includes("evavo_review_image_batch_against_references"));
  assert.ok(route.orderedTools.includes("evavo_create_image_reference_consistency_proof"));
  assert.match(route.stopConditions.join(" "), /reference set is unstable/);
  assert.match(route.evidenceExpected.join(" "), /palette\/tone\/detail\/silhouette\/framing/);
  assert.match(route.evidenceExpected.join(" "), /visual proof/);
  assert.match(route.notes.join(" "), /not character\/object identity recognition/);
  assert.match(route.notes.join(" "), /does not detect or prove AI authorship/);
});

test("texture route spans review, preprocessing, materialization and native Godot validation", () => {
  const route = routeImageAgentTask("texture-review");
  assert.match(route.primarySurface, /evavo-texture-review/);
  assert.match(route.primarySurface, /evavo-texture-preprocess/);
  assert.match(route.primarySurface, /evavo-godot-material-delivery/);
  assert.match(route.primarySurface, /evavo-godot-material-validator/);
  assert.ok(route.orderedTools.includes("evavo_review_texture_set"));
  assert.ok(route.orderedTools.includes("evavo_review_obj_uv_layout"));
  assert.ok(route.orderedTools.includes("evavo_convert_tangent_normal_y"));
  assert.ok(route.orderedTools.includes("evavo_compose_opacity_into_albedo_alpha"));
  assert.ok(route.orderedTools.includes("evavo_pack_godot_orm_texture"));
  assert.ok(route.orderedTools.includes("evavo_plan_godot_material_delivery"));
  assert.ok(route.orderedTools.includes("evavo_write_godot_material_resource"));
  assert.ok(route.orderedTools.includes("evavo_validate_godot_material_resource"));
  assert.equal(route.writeClass, "write-gated-create-only");
  assert.match(route.stopConditions.join(" "), /UV overlap/);
  assert.match(route.stopConditions.join(" "), /needs-preprocess/);
  assert.match(route.stopConditions.join(" "), /native Godot load/);
  assert.match(route.evidenceExpected.join(" "), /StandardMaterial3D or ORMMaterial3D/);
  assert.match(route.evidenceExpected.join(" "), /\.tres/);
  assert.match(route.evidenceExpected.join(" "), /native Godot load\/class evidence/);
  assert.match(route.notes.join(" "), /separate execution privilege/);
  assert.match(route.notes.join(" "), /unapproved/);
});

test("artifact assessment uses dedicated triage while refusing pixel-origin conclusions", () => {
  const route = routeImageAgentTask("ai-artifact-assessment");
  assert.match(route.primarySurface, /evavo-image-artifact-triage/);
  assert.match(route.primarySurface, /evavo-image-reference-consistency/);
  assert.ok(route.orderedTools.includes("evavo_review_image_artifact_risk"));
  assert.ok(route.orderedTools.includes("evavo_review_image_against_references"));
  assert.match(route.stopConditions.join(" "), /do not infer authorship/);
  assert.match(route.evidenceExpected.join(" "), /repeated nontrivial detail/);
  assert.match(route.evidenceExpected.join(" "), /provenance status/);
  assert.match(route.notes.join(" "), /not image authorship/);
  assert.match(route.notes.join(" "), /provenance records/);
});

test("finalization brackets pixel changes with the unified packet and keeps promotion explicit", () => {
  const route = routeImageAgentTask("finalize-image");
  assert.match(route.primarySurface, /evavo-image-finishing-packet/);
  assert.equal(route.orderedTools[0], "evavo_review_image_finishing_packet");
  assert.equal(route.orderedTools.filter((tool) => tool === "evavo_review_image_finishing_packet").length, 2);
  assert.match(route.stopConditions.join(" "), /finishing packet is not ready for visual review/);
  assert.match(route.evidenceExpected.join(" "), /pre\/post finishing decision packet/);
  assert.match(route.notes.join(" "), /Re-run the unified finishing packet/);
  assert.match(route.notes.join(" "), /remains unapproved/);
});
