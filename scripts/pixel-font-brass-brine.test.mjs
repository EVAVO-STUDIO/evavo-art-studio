import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildFamily,
  validateFamily,
} from "./pixel-font/builder.mjs";
import { hashObject, sha256 } from "./pixel-font/common.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const requestPath = path.join(
  repositoryRoot,
  "config",
  "pixel-font-family.brass-brine.v1.json",
);

const jsonBytes = (value) =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

function rehash(value, key) {
  const body = { ...value };
  delete body[key];
  delete body.runId;
  const digest = hashObject(body);
  return { ...body, [key]: digest, runId: digest.slice(0, 20) };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-brass-font-"));
  const outputRoot = path.join(root, "brass-brine-dos");
  const result = await buildFamily({ requestPath, outputRoot });
  return { root, outputRoot, result };
}

test("Brass & Brine builds five coordinated DOS faces and an exact Godot role map", async () => {
  const value = await fixture();
  try {
    assert.equal(value.result.validation.status, "passed");
    assert.deepEqual(
      value.result.family.faces.map((face) => face.faceId),
      [
        "bb_dos_display",
        "bb_dos_ui",
        "bb_dos_ledger",
        "bb_dos_micro",
        "bb_dos_symbols",
      ],
    );
    const roleMap = JSON.parse(
      await readFile(
        path.join(value.outputRoot, "godot", "pixel-font-role-map.json"),
        "utf8",
      ),
    );
    for (const role of [
      "title",
      "body",
      "button",
      "numeric_hud",
      "caption",
      "symbols",
      "weather",
      "wind",
    ]) {
      assert.ok(roleMap.roles[role], `missing role ${role}`);
    }
    assert.equal(roleMap.roles.title.faceId, "bb_dos_display");
    assert.equal(roleMap.roles.body.faceId, "bb_dos_ui");
    assert.equal(roleMap.roles.numeric_hud.faceId, "bb_dos_ledger");
    assert.equal(roleMap.roles.caption.faceId, "bb_dos_micro");
    assert.equal(roleMap.roles.symbols.faceId, "bb_dos_symbols");
    assert.deepEqual(roleMap.policy, {
      minimumVersion: "4.6.2",
      targetVersion: "4.6.2",
      resourceBasePath: "assets/fonts/evavo/brass-brine-dos",
      textureFilter: "nearest",
      integerScaleOnly: true,
      subpixelPositioning: false,
      mipmaps: false,
    });

    const display = JSON.parse(
      await readFile(
        path.join(
          value.outputRoot,
          "faces",
          "bb_dos_display",
          "bb_dos_display.face.json",
        ),
        "utf8",
      ),
    );
    const ui = JSON.parse(
      await readFile(
        path.join(value.outputRoot, "faces", "bb_dos_ui", "bb_dos_ui.face.json"),
        "utf8",
      ),
    );
    const ledgerFnt = await readFile(
      path.join(
        value.outputRoot,
        "faces",
        "bb_dos_ledger",
        "bb_dos_ledger.fnt",
      ),
      "utf8",
    );
    const symbolsFnt = await readFile(
      path.join(
        value.outputRoot,
        "faces",
        "bb_dos_symbols",
        "bb_dos_symbols.fnt",
      ),
      "utf8",
    );
    const displayA = display.glyphs.find((glyph) => glyph.codepoint === 65);
    const displayLowerA = display.glyphs.find((glyph) => glyph.codepoint === 97);
    const uiA = ui.glyphs.find((glyph) => glyph.codepoint === 65);
    const uiLowerA = ui.glyphs.find((glyph) => glyph.codepoint === 97);
    assert.equal(displayA.matrixSha256, displayLowerA.matrixSha256);
    assert.notEqual(uiA.matrixSha256, uiLowerA.matrixSha256);

    const digitAdvances = [...ledgerFnt.matchAll(/^char id=(4[8-9]|5[0-7]) .* xadvance=(\d+) /gmu)]
      .map((match) => Number(match[2]));
    assert.equal(digitAdvances.length, 10);
    assert.equal(new Set(digitAdvances).size, 1);
    assert.match(symbolsFnt, /^char id=9875 /mu);
    assert.match(symbolsFnt, /^char id=57344 /mu);

    for (const face of value.result.family.faces) {
      assert.equal(face.qa.status, "passed");
      assert.equal(face.qa.blockers.length, 0);
    }
    assert.equal(
      Object.values(value.result.family.authority).every((entry) => entry === false),
      true,
    );
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("rehashed family output path escape fails closed", async () => {
  const value = await fixture();
  try {
    const familyPath = value.result.familyPath;
    const family = JSON.parse(await readFile(familyPath, "utf8"));
    const originalRoleMap = await readFile(
      path.join(value.outputRoot, family.roleMap.relativePath),
    );
    await writeFile(path.join(value.root, "outside-role-map.json"), originalRoleMap);
    family.roleMap.relativePath = "../outside-role-map.json";
    const rehashed = rehash(family, "familySha256");
    await writeFile(familyPath, jsonBytes(rehashed));
    await assert.rejects(
      () => validateFamily({ familyPath }),
      /escapes the family root/iu,
    );
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("rehashed role-map substitution is independently blocked", async () => {
  const value = await fixture();
  try {
    const familyPath = value.result.familyPath;
    let family = JSON.parse(await readFile(familyPath, "utf8"));
    const roleMapPath = path.join(value.outputRoot, family.roleMap.relativePath);
    let roleMap = JSON.parse(await readFile(roleMapPath, "utf8"));
    roleMap.roles.body.godotResource = roleMap.roles.symbols.godotResource;
    roleMap = rehash(roleMap, "roleMapSha256");
    const roleBytes = jsonBytes(roleMap);
    await writeFile(roleMapPath, roleBytes);
    family.roleMap.sha256 = sha256(roleBytes);
    family.roleMap.sizeBytes = roleBytes.length;
    family.roleMap.documentSha256 = roleMap.roleMapSha256;
    family = rehash(family, "familySha256");
    await writeFile(familyPath, jsonBytes(family));
    const validation = await validateFamily({ familyPath });
    assert.equal(validation.status, "blocked");
    assert.equal(validation.blockers.includes("role-map-role:body"), true);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("rehashed BMFont page substitution is independently blocked", async () => {
  const value = await fixture();
  try {
    const familyPath = value.result.familyPath;
    let family = JSON.parse(await readFile(familyPath, "utf8"));
    const summary = family.faces.find((face) => face.faceId === "bb_dos_ui");
    const facePath = path.join(value.outputRoot, summary.outputs.face.relativePath);
    let face = JSON.parse(await readFile(facePath, "utf8"));
    const fntPath = path.join(value.outputRoot, face.outputs.bmfont.relativePath);
    const changedFnt = Buffer.from(
      (await readFile(fntPath, "utf8")).replace(
        'page id=0 file="bb_dos_ui.png"',
        'page id=0 file="wrong-page.png"',
      ),
      "utf8",
    );
    await writeFile(fntPath, changedFnt);
    face.outputs.bmfont.sha256 = sha256(changedFnt);
    face.outputs.bmfont.sizeBytes = changedFnt.length;
    face = rehash(face, "faceSha256");
    const faceBytes = jsonBytes(face);
    await writeFile(facePath, faceBytes);
    summary.faceSha256 = face.faceSha256;
    summary.outputs.bmfont.sha256 = sha256(changedFnt);
    summary.outputs.bmfont.sizeBytes = changedFnt.length;
    summary.outputs.face.sha256 = sha256(faceBytes);
    summary.outputs.face.sizeBytes = faceBytes.length;
    family = rehash(family, "familySha256");
    await writeFile(familyPath, jsonBytes(family));
    const validation = await validateFamily({ familyPath });
    assert.equal(validation.status, "blocked");
    assert.equal(validation.blockers.includes("fnt-header:bb_dos_ui"), true);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
