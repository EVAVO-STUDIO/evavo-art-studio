import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPABILITY_CATALOG,
  VISUAL_CONTINUITY_CAPABILITIES,
} from "../dist/index.js";

test("standard Art Studio discovery includes project-wide continuity capabilities", () => {
  const expected = [
    "continuity.bible.compile",
    "continuity.session.compile",
    "continuity.packet.compile",
    "continuity.batch.evaluate",
    "continuity.approval.receipt",
    "continuity.workspace.persist",
    "continuity.handoff.approved",
    "continuity.map-grammar",
    "continuity.sequence-grammar",
  ];
  const allIds = CAPABILITY_CATALOG.map((capability) => capability.id);
  const continuityIds = VISUAL_CONTINUITY_CAPABILITIES.map(
    (capability) => capability.id,
  );
  assert.deepEqual(continuityIds, expected);
  for (const id of expected) {
    assert.ok(allIds.includes(id), `standard capability catalogue is missing ${id}`);
  }
  assert.equal(new Set(allIds).size, allIds.length);
  assert.ok(Object.isFrozen(CAPABILITY_CATALOG));
  assert.ok(Object.isFrozen(VISUAL_CONTINUITY_CAPABILITIES));
});

test("continuity capabilities remain governed control-plane contracts", () => {
  for (const capability of VISUAL_CONTINUITY_CAPABILITIES) {
    assert.equal(capability.deterministic, true);
    assert.equal(capability.workerClass, "control");
    assert.match(capability.description, /continuity|visual|art|map|sprite|storyboard|handoff|memory|approval/i);
  }
});
