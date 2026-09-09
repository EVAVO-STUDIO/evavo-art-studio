import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runGodotMaterialValidation } from "../dist/index.js";

const godotExecutable = process.env.EVAVO_GODOT_EXECUTABLE?.trim() ?? "";

test("loads a generated-format material through a real Godot runtime when configured", {
  skip: godotExecutable ? false : "EVAVO_GODOT_EXECUTABLE is not configured",
}, async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), "evavo-godot-native-fixture-"));
  try {
    await writeFile(
      path.join(projectPath, "project.godot"),
      '[application]\nconfig/name="EVAVO Native Material Validation"\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n',
      "utf8",
    );
    await writeFile(
      path.join(projectPath, "material.tres"),
      '[gd_resource type="StandardMaterial3D" format=3]\n\n[resource]\nroughness = 0.5\n',
      "utf8",
    );

    const result = await runGodotMaterialValidation({
      godotExecutable,
      projectPath,
      resourcePath: "res://material.tres",
      expectedClass: "StandardMaterial3D",
      timeoutMs: 60_000,
    });

    assert.equal(result.ok, true);
    assert.equal(result.resourceClass, "StandardMaterial3D");
    assert.equal(result.expectedClass, "StandardMaterial3D");
    assert.equal(result.exitCode, 0);
    assert.equal(result.headless, true);
    assert.equal(result.sourceMutationAllowed, false);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});
