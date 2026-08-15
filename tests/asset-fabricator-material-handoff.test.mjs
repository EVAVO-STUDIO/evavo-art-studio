import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  REQUEST_CONTRACT,
  compileMaterialHandoff,
  verifyMaterialHandoff,
} from "../scripts/game-art-production/asset-fabricator-material-handoff.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-art-fabricator-"));
  await writeFile(path.join(root, "materials.json"), JSON.stringify({ contractVersion: "evavo_art_procedural_material_program_v1", materials: [] }) + "\n");
  return {
    root,
    request: {
      contractVersion: REQUEST_CONTRACT,
      assetId: "falcon-rally-production-v1",
      subjectId: "falcon-rally",
      materialProgramPath: "materials.json",
      bindings: [
        { materialId: "body-paint", graphId: "weathered-rally-painted-metal", slotPattern: "Body*" },
        { materialId: "tyre-rubber", graphId: "worn-rally-rubber", slotPattern: "Tyre*" },
      ],
    },
  };
}

test("compiles deterministic Substance-style material handoff", async () => {
  const { root, request } = await fixture();
  const first = await compileMaterialHandoff(request, { baseDirectory: root });
  const second = await compileMaterialHandoff(request, { baseDirectory: root });
  assert.deepEqual(first, second);
  assert.equal(first.bindings.length, 2);
  assert.equal(first.bindings[0].outputs.length, 11);
  assert.deepEqual(first.bindings[0].orm, { r: "ao", g: "roughness", b: "metalness" });
  assert.equal(first.authority.automaticCreativeApproval, false);
  assert.equal(verifyMaterialHandoff(first), true);
});

test("rejects duplicate bindings and payload drift", async () => {
  const { root, request } = await fixture();
  request.bindings.push({ ...request.bindings[0] });
  await assert.rejects(() => compileMaterialHandoff(request, { baseDirectory: root }), /duplicate-material/);
  const good = await fixture();
  const handoff = await compileMaterialHandoff(good.request, { baseDirectory: good.root });
  handoff.bindings[0].normalConvention = "directx";
  assert.throws(() => verifyMaterialHandoff(handoff), /sha-mismatch|packing/);
});

test("rejects authority escalation even after rehash is unavailable", async () => {
  const { root, request } = await fixture();
  const handoff = await compileMaterialHandoff(request, { baseDirectory: root });
  handoff.authority.automaticCreativeApproval = true;
  assert.throws(() => verifyMaterialHandoff(handoff), /sha-mismatch|authority/);
});
