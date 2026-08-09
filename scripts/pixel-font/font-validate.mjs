import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  AUTHORITY,
  FACE_SCHEMA,
  FAMILY_SCHEMA,
  VALIDATION_SCHEMA,
  canonicalRegularFile,
  decodePng,
  deepFreeze,
  hashObject,
  isHash,
  objectValue,
  pathInside,
  readJson,
  sha256,
  stable,
} from "./common.mjs";

function verifySelfHash(value, key) {
  if (!isHash(value[key]) || value.runId !== value[key].slice(0, 20)) {
    throw new Error(`${key} or runId is invalid.`);
  }
  const body = { ...value };
  delete body[key];
  delete body.runId;
  if (hashObject(body) !== value[key]) throw new Error(`${key} differs.`);
}

function exactKeys(value, expected, label) {
  const observed = Object.keys(objectValue(value, label)).sort();
  if (stable(observed) !== stable([...expected].sort())) {
    throw new Error(`${label} fields differ.`);
  }
}

function oneOfExactKeySets(value, expectedSets, label) {
  const observed = Object.keys(objectValue(value, label)).sort();
  if (
    !expectedSets.some(
      (expected) => stable(observed) === stable([...expected].sort()),
    )
  ) {
    throw new Error(`${label} fields differ.`);
  }
}

function resolveInside(root, relativePath, label) {
  if (
    typeof relativePath !== "string" ||
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\u0000")
  ) {
    throw new Error(`${label} relativePath is invalid.`);
  }
  const target = path.resolve(root, relativePath);
  if (!pathInside(target, root)) {
    throw new Error(`${label} escapes the family root.`);
  }
  return target;
}

async function readBoundFile(root, recordValue, label) {
  const record = objectValue(recordValue, `${label} binding`);
  oneOfExactKeySets(
    record,
    [
      ["relativePath", "sha256", "sizeBytes"],
      ["relativePath", "sha256", "sizeBytes", "documentSha256"],
    ],
    `${label} binding`,
  );
  if (
    !isHash(record.sha256) ||
    !Number.isSafeInteger(record.sizeBytes) ||
    record.sizeBytes < 1 ||
    (record.documentSha256 !== undefined && !isHash(record.documentSha256))
  ) {
    throw new Error(`${label} binding is invalid.`);
  }
  const target = resolveInside(root, record.relativePath, label);
  const file = await canonicalRegularFile(target, label, root);
  const bytes = await readFile(file.path);
  if (sha256(bytes) !== record.sha256 || bytes.length !== record.sizeBytes) {
    throw new Error(`${label} identity differs.`);
  }
  return { path: file.path, bytes, record };
}

async function readBoundJson(root, recordValue, label) {
  const file = await readBoundFile(root, recordValue, label);
  let value;
  try {
    value = JSON.parse(file.bytes.toString("utf8").replace(/^\uFEFF/u, ""));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
  return { ...file, value: objectValue(value, label) };
}

function authorityPassed(value) {
  return (
    stable(value) === stable(AUTHORITY) &&
    Object.values(objectValue(value, "authority")).every(
      (entry) => entry === false,
    )
  );
}

function visiblePixels(image) {
  let count = 0;
  for (let offset = 3; offset < image.rgba.length; offset += 4) {
    if (image.rgba[offset] > 0) count += 1;
  }
  return count;
}

function parseBmfont(value, faceId) {
  const common =
    /^common lineHeight=(\d+) base=(\d+) scaleW=(\d+) scaleH=(\d+) pages=(\d+) packed=(\d+) /mu.exec(
      value,
    );
  const page = /^page id=0 file="([^"]+)"$/mu.exec(value);
  const chars = /^chars count=(\d+)$/mu.exec(value);
  const kernings = /^kernings count=(\d+)$/mu.exec(value);
  if (!common || !page || !chars || !kernings) {
    throw new Error(`BMFont ${faceId} lacks required headers.`);
  }
  const rows = [
    ...value.matchAll(
      /^char id=(\d+) x=(\d+) y=(\d+) width=(\d+) height=(\d+) xoffset=(-?\d+) yoffset=(-?\d+) xadvance=(\d+) page=0 chnl=15$/gmu,
    ),
  ].map((match) => ({
    codepoint: Number(match[1]),
    x: Number(match[2]),
    y: Number(match[3]),
    width: Number(match[4]),
    height: Number(match[5]),
    xoffset: Number(match[6]),
    yoffset: Number(match[7]),
    xadvance: Number(match[8]),
  }));
  const kerningRows = [
    ...value.matchAll(
      /^kerning first=(\d+) second=(\d+) amount=(-?\d+)$/gmu,
    ),
  ];
  return {
    lineHeight: Number(common[1]),
    base: Number(common[2]),
    scaleW: Number(common[3]),
    scaleH: Number(common[4]),
    pages: Number(common[5]),
    packed: Number(common[6]),
    pageFile: page[1],
    declaredCharacters: Number(chars[1]),
    declaredKernings: Number(kernings[1]),
    rows,
    kerningRows,
  };
}

function verifyGodotPolicy(value, blockers) {
  const policy = objectValue(value, "Godot pixel-font policy");
  exactKeys(
    policy,
    [
      "minimumVersion",
      "targetVersion",
      "resourceBasePath",
      "textureFilter",
      "integerScaleOnly",
      "subpixelPositioning",
      "mipmaps",
    ],
    "Godot pixel-font policy",
  );
  const version = /^\d+\.\d+(?:\.\d+)?$/u;
  const resourcePath = String(policy.resourceBasePath ?? "");
  if (
    !version.test(String(policy.minimumVersion ?? "")) ||
    !version.test(String(policy.targetVersion ?? "")) ||
    !resourcePath ||
    resourcePath.startsWith("/") ||
    resourcePath.startsWith("res://") ||
    resourcePath.includes("\\") ||
    resourcePath.split("/").includes("..") ||
    !/^[A-Za-z0-9._/-]+$/u.test(resourcePath) ||
    policy.textureFilter !== "nearest" ||
    policy.integerScaleOnly !== true ||
    policy.subpixelPositioning !== false ||
    policy.mipmaps !== false
  ) {
    blockers.push("godot-pixel-policy");
  }
}

export async function validateFamily({ familyPath }) {
  const source = await readJson(familyPath, "Pixel-font family");
  const family = objectValue(source.value, "Pixel-font family");
  if (family.schema !== FAMILY_SCHEMA) {
    throw new Error(`Expected ${FAMILY_SCHEMA}.`);
  }
  verifySelfHash(family, "familySha256");
  const root = path.dirname(source.path);
  const blockers = [];
  const verifiedFiles = [];
  const outputPaths = new Set();

  if (!authorityPassed(family.authority)) blockers.push("family-authority");
  if (
    stable(family.buildPolicy) !==
    stable({
      deterministic: true,
      dependencyFree: true,
      createOnly: true,
      externalFontBinaryUsed: false,
    })
  ) {
    blockers.push("build-policy");
  }
  verifyGodotPolicy(family.godot, blockers);
  if (!Array.isArray(family.faces) || family.faces.length < 1) {
    throw new Error("Pixel-font family has no faces.");
  }
  const faceIds = family.faces.map((face) => String(face?.faceId ?? ""));
  if (
    new Set(faceIds).size !== faceIds.length ||
    faceIds.some((faceId) => !faceId)
  ) {
    throw new Error("Pixel-font family face IDs are invalid or duplicated.");
  }

  const faces = new Map();
  for (const faceSummaryValue of family.faces) {
    const faceSummary = objectValue(faceSummaryValue, "Face summary");
    exactKeys(
      faceSummary,
      ["faceId", "role", "faceSha256", "qa", "outputs"],
      "Face summary",
    );
    const faceId = String(faceSummary.faceId);
    const summaryOutputs = objectValue(
      faceSummary.outputs,
      `Face ${faceId} summary outputs`,
    );
    const faceRecord = summaryOutputs.face;
    if (!faceRecord) {
      blockers.push(`missing-face-document:${faceId}`);
      continue;
    }
    const faceSource = await readBoundJson(
      root,
      faceRecord,
      `Face ${faceId}`,
    );
    verifiedFiles.push({
      faceId,
      kind: "face",
      relativePath: faceRecord.relativePath,
      sha256: faceRecord.sha256,
      sizeBytes: faceRecord.sizeBytes,
    });
    if (faceSource.value.schema !== FACE_SCHEMA) {
      blockers.push(`face-schema:${faceId}`);
    }
    verifySelfHash(faceSource.value, "faceSha256");
    if (
      faceSource.value.faceSha256 !== faceSummary.faceSha256 ||
      faceSource.value.faceId !== faceId ||
      faceSource.value.familyId !== family.familyId ||
      faceSource.value.role !== faceSummary.role
    ) {
      blockers.push(`face-document-binding:${faceId}`);
    }
    if (!authorityPassed(faceSource.value.authority)) {
      blockers.push(`face-authority:${faceId}`);
    }
    if (
      faceSource.value.qa?.status !== "passed" ||
      (faceSource.value.qa?.blockers ?? []).length > 0 ||
      stable(faceSource.value.qa) !== stable(faceSummary.qa)
    ) {
      blockers.push(`face-qa:${faceId}`);
    }

    const outputs = objectValue(
      faceSource.value.outputs,
      `Face ${faceId} outputs`,
    );
    const expectedOutputKeys = ["atlas", "bmfont", "godotResource"];
    if (family.delivery?.includeSpecimens === true) {
      expectedOutputKeys.push("specimen");
    }
    exactKeys(outputs, expectedOutputKeys, `Face ${faceId} outputs`);
    const expectedSummary = { ...outputs, face: faceRecord };
    if (stable(summaryOutputs) !== stable(expectedSummary)) {
      blockers.push(`face-output-summary:${faceId}`);
    }
    for (const [kind, record] of Object.entries(outputs)) {
      const file = await readBoundFile(root, record, `${faceId} ${kind}`);
      if (outputPaths.has(file.record.relativePath)) {
        blockers.push(`duplicate-output-path:${file.record.relativePath}`);
      }
      outputPaths.add(file.record.relativePath);
      verifiedFiles.push({
        faceId,
        kind,
        relativePath: file.record.relativePath,
        sha256: file.record.sha256,
        sizeBytes: file.record.sizeBytes,
      });
    }

    const atlasFile = await readBoundFile(
      root,
      outputs.atlas,
      `${faceId} atlas`,
    );
    const atlas = decodePng(atlasFile.bytes);
    if (visiblePixels(atlas) < 1) blockers.push(`atlas-blank:${faceId}`);
    const fntFile = await readBoundFile(
      root,
      outputs.bmfont,
      `${faceId} BMFont`,
    );
    const parsed = parseBmfont(fntFile.bytes.toString("utf8"), faceId);
    if (
      parsed.scaleW !== atlas.width ||
      parsed.scaleH !== atlas.height ||
      parsed.pages !== 1 ||
      parsed.packed !== 0
    ) {
      blockers.push(`fnt-atlas-size:${faceId}`);
    }
    if (
      parsed.pageFile !== path.basename(outputs.atlas.relativePath) ||
      parsed.declaredCharacters !== parsed.rows.length ||
      parsed.declaredKernings !== parsed.kerningRows.length ||
      parsed.lineHeight < 1 ||
      parsed.base < 1 ||
      parsed.base > parsed.lineHeight
    ) {
      blockers.push(`fnt-header:${faceId}`);
    }
    const observed = parsed.rows
      .map((row) => row.codepoint)
      .sort((left, right) => left - right);
    if (
      new Set(observed).size !== observed.length ||
      sha256(stable(observed)) !== faceSource.value.coverageSha256 ||
      stable(observed) !== stable(faceSource.value.codepoints)
    ) {
      blockers.push(`fnt-coverage:${faceId}`);
    }
    for (const row of parsed.rows) {
      if (
        row.x < 0 ||
        row.y < 0 ||
        row.width < 1 ||
        row.height < 1 ||
        row.xadvance < 1 ||
        row.x + row.width > atlas.width ||
        row.y + row.height > atlas.height
      ) {
        blockers.push(`fnt-bounds:${faceId}:${row.codepoint}`);
      }
    }
    if (Array.isArray(faceSource.value.glyphs)) {
      const glyphs = [...faceSource.value.glyphs].sort(
        (left, right) => left.codepoint - right.codepoint,
      );
      if (
        stable(glyphs.map((glyph) => glyph.codepoint)) !== stable(observed) ||
        glyphs.some((glyph, index) => {
          const row = parsed.rows.find(
            (candidate) => candidate.codepoint === glyph.codepoint,
          );
          return (
            !row ||
            glyph.x !== row.x ||
            glyph.y !== row.y ||
            glyph.width !== row.width ||
            glyph.height !== row.height ||
            glyph.xadvance !== row.xadvance ||
            !isHash(glyph.matrixSha256) ||
            index >= observed.length
          );
        })
      ) {
        blockers.push(`glyph-records:${faceId}`);
      }
    }

    const godotFile = await readBoundFile(
      root,
      outputs.godotResource,
      `${faceId} Godot resource`,
    );
    const expectedFontPath = `res://${family.godot.resourceBasePath.replace(
      /\/$/u,
      "",
    )}/${outputs.bmfont.relativePath}`;
    const godotText = godotFile.bytes.toString("utf8");
    if (
      !godotText.includes('[gd_resource type="FontVariation"') ||
      !godotText.includes(
        `[ext_resource type="FontFile" path="${expectedFontPath}"`,
      ) ||
      !godotText.includes('base_font = ExtResource("1_font")')
    ) {
      blockers.push(`godot-resource:${faceId}`);
    }
    if (outputs.specimen) {
      const specimenFile = await readBoundFile(
        root,
        outputs.specimen,
        `${faceId} specimen`,
      );
      if (visiblePixels(decodePng(specimenFile.bytes)) < 1) {
        blockers.push(`specimen-blank:${faceId}`);
      }
    }
    faces.set(faceId, {
      summary: faceSummary,
      document: faceSource.value,
      outputs,
    });
  }

  const roleSource = await readBoundJson(
    root,
    family.roleMap,
    "Godot pixel-font role map",
  );
  verifiedFiles.push({
    faceId: null,
    kind: "roleMap",
    relativePath: family.roleMap.relativePath,
    sha256: family.roleMap.sha256,
    sizeBytes: family.roleMap.sizeBytes,
  });
  if (
    roleSource.value.schema !== "evavo.pixel-font-godot-role-map.v1" ||
    roleSource.value.familyId !== family.familyId ||
    roleSource.value.roleMapSha256 !== family.roleMap.documentSha256
  ) {
    blockers.push("role-map-binding");
  }
  verifySelfHash(roleSource.value, "roleMapSha256");
  if (!authorityPassed(roleSource.value.authority)) {
    blockers.push("role-map-authority");
  }
  if (stable(roleSource.value.policy) !== stable(family.godot)) {
    blockers.push("godot-pixel-policy");
  }
  const roles = objectValue(roleSource.value.roles, "Godot pixel-font roles");
  if (Object.keys(roles).length < 1) blockers.push("role-map-empty");
  for (const [role, value] of Object.entries(roles)) {
    const entry = objectValue(value, `Role ${role}`);
    exactKeys(
      entry,
      ["faceId", "bmfont", "godotResource"],
      `Role ${role}`,
    );
    const face = faces.get(entry.faceId);
    if (
      !face ||
      entry.bmfont !== face.outputs.bmfont.relativePath ||
      entry.godotResource !== face.outputs.godotResource.relativePath
    ) {
      blockers.push(`role-map-role:${role}`);
    }
  }

  const auxiliary = objectValue(family.auxiliary, "family auxiliary");
  exactKeys(auxiliary, ["readme", "license"], "family auxiliary");
  for (const [kind, record] of Object.entries(auxiliary)) {
    const file = await readBoundFile(root, record, `Family ${kind}`);
    verifiedFiles.push({
      faceId: null,
      kind,
      relativePath: file.record.relativePath,
      sha256: file.record.sha256,
      sizeBytes: file.record.sizeBytes,
    });
  }

  const body = {
    schema: VALIDATION_SCHEMA,
    status: blockers.length ? "blocked" : "passed",
    familyId: family.familyId,
    familySha256: family.familySha256,
    blockers: [...new Set(blockers)].sort(),
    verifiedFiles: verifiedFiles.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    ),
    authority: AUTHORITY,
  };
  const validationSha256 = hashObject(body);
  return deepFreeze({
    ...body,
    validationSha256,
    runId: validationSha256.slice(0, 20),
  });
}
