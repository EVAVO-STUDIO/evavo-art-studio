import assert from "node:assert/strict";
import test from "node:test";

import { parseGodotMaterialValidationOutput, renderGodotMaterialValidationScript, runGodotMaterialValidation } from "../dist/index.js";

test("renders a SceneTree validator that loads the requested resource", () => {
  const script = renderGodotMaterialValidationScript();
  assert.match(script, /^extends SceneTree/m);
  assert.match(script, /ResourceLoader\.load\(resource_path\)/);
  assert.match(script, /OS\.get_cmdline_user_args\(\)/);
  assert.match(script, /EVAVO_MATERIAL_VALIDATION=/);
});

test("parses the structured Godot validation marker", () => {
  const parsed = parseGodotMaterialValidationOutput(
    'Godot Engine\nEVAVO_MATERIAL_VALIDATION={"ok":true,"resource_path":"res://brick.tres","resource_class":"StandardMaterial3D","expected_class":"StandardMaterial3D"}\n',
  );
  assert.deepEqual(parsed, {
    ok: true,
    resource_path: "res://brick.tres",
    resource_class: "StandardMaterial3D",
    expected_class: "StandardMaterial3D",
  });
});

test("fails closed when the native marker is absent or malformed", () => {
  assert.throws(() => parseGodotMaterialValidationOutput("Godot Engine\n"), /did not emit/);
  assert.throws(
    () => parseGodotMaterialValidationOutput("EVAVO_MATERIAL_VALIDATION={}\n"),
    /invalid shape/,
  );
});

test("native runner validates resource-path and timeout inputs before execution", async () => {
  await assert.rejects(
    runGodotMaterialValidation({ godotExecutable: "godot", projectPath: ".", resourcePath: "brick.tres" }),
    /resourcePath must be a res:\/\/ path ending in \.tres/,
  );
  await assert.rejects(
    runGodotMaterialValidation({ godotExecutable: "", projectPath: ".", resourcePath: "res://brick.tres" }),
    /godotExecutable is required/,
  );
});
