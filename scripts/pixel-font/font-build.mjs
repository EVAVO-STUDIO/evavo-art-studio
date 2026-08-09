import { lstat, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { AUTHORITY, FACE_SCHEMA, FAMILY_SCHEMA, RECEIPT_SCHEMA, deepFreeze, encodePng, hashObject, isHash, readJson, sha256, stable, writeCreateOnly, writeJsonCreateOnly } from './common.mjs';
import { compilePlan } from './font-plan.mjs';
import { blit, packGlyphs, renderGlyph } from './font-render.mjs';
import { bmfont, godotResource, renderSpecimen } from './font-output.mjs';
import { faceQa, identity, license, readRequest, readme } from './font-qa.mjs';
import { validateFamily } from './font-validate.mjs';

export async function buildFamily({ requestPath, outputRoot, planPath }) {
  const source = await readRequest(requestPath);
  const root = path.resolve(outputRoot);
  await mkdir(root, { recursive: true });
  const rootState = await lstat(root);
  if (!rootState.isDirectory() || rootState.isSymbolicLink() || (await realpath(root)) !== root) {
    throw new Error('Pixel-font output root must be a canonical non-symlink directory.');
  }
  const plan = compilePlan(source.request, source.binding, root);
  if (planPath) {
    const supplied = await readJson(planPath, 'Pixel-font family plan');
    const body = { ...supplied.value };
    delete body.planSha256;
    delete body.runId;
    if (!isHash(supplied.value.planSha256) || hashObject(body) !== supplied.value.planSha256 || supplied.value.runId !== supplied.value.planSha256.slice(0, 20) || stable(supplied.value) !== stable(plan)) {
      throw new Error('Supplied plan differs from the exact current request and output root.');
    }
  }
  const faceDocuments = [];
  for (const facePlan of plan.faces) {
    const face = source.request.faces.find((candidate) => candidate.id === facePlan.id);
    const glyphs = face.codepoints.map((codepoint) => renderGlyph(face, codepoint));
    const packed = packGlyphs(glyphs, source.request.quality.maximumAtlasEdge);
    const atlas = Buffer.alloc(packed.width * packed.height * 4);
    for (const glyph of packed.placements) blit(atlas, packed.width, packed.height, glyph);
    const atlasBytes = encodePng(packed.width, packed.height, atlas);
    const specimenBytes = source.request.delivery.includeSpecimens
      ? renderSpecimen(source.request, face, packed, atlas)
      : null;
    const qa = faceQa(source.request, face, glyphs, packed, atlasBytes, specimenBytes);
    const outputs = facePlan.outputs;
    const absolute = Object.fromEntries(Object.entries(outputs).map(([key, relative]) => [key, path.join(root, relative)]));
    await writeCreateOnly(absolute.atlas, atlasBytes, root);
    await writeCreateOnly(absolute.bmfont, bmfont(face, packed), root);
    await writeCreateOnly(absolute.godotResource, godotResource(source.request.godot.resourceBasePath, outputs.bmfont), root);
    if (specimenBytes) await writeCreateOnly(absolute.specimen, specimenBytes, root);
    const outputBindings = {};
    for (const [kind, relativePath] of Object.entries(outputs)) {
      if (kind === 'face') continue;
      outputBindings[kind] = { relativePath, ...(await identity(path.join(root, relativePath))) };
    }
    const faceBody = {
      schema: FACE_SCHEMA,
      familyId: source.request.familyId,
      faceId: face.id,
      displayName: face.displayName,
      role: face.role,
      preset: face.preset,
      metrics: { pixelScale: face.pixelScale, tracking: face.tracking, lineGap: face.lineGap, monospace: face.monospace, uppercaseOnly: face.uppercaseOnly, boldPixels: face.boldPixels, outline: face.outline, shadowX: face.shadowX, shadowY: face.shadowY },
      palette: { fill: face.fill, outline: face.outlineColor, shadow: face.shadowColor },
      codepoints: face.codepoints,
      coverageSha256: sha256(stable(face.codepoints)),
      ...(source.request.delivery.includeDetailedGlyphRecords
        ? { glyphs: packed.placements.map((glyph) => ({ codepoint: glyph.codepoint, x: glyph.x, y: glyph.y, width: glyph.width, height: glyph.height, xadvance: glyph.xadvance, matrixSha256: glyph.matrixSha256 })) }
        : {}),
      outputs: outputBindings,
      qa,
      authority: AUTHORITY,
    };
    const faceSha256 = hashObject(faceBody);
    const faceDocument = deepFreeze({ ...faceBody, faceSha256, runId: faceSha256.slice(0, 20) });
    await writeJsonCreateOnly(absolute.face, faceDocument, root);
    faceDocuments.push(deepFreeze({ ...faceDocument, outputs: { ...outputBindings, face: { relativePath: outputs.face, ...(await identity(absolute.face)) } } }));
  }
  const roleMapBody = {
    schema: 'evavo.pixel-font-godot-role-map.v1',
    familyId: source.request.familyId,
    roles: Object.fromEntries(Object.entries(source.request.roleMap).map(([role, faceId]) => {
      const face = faceDocuments.find((candidate) => candidate.faceId === faceId);
      return [role, { faceId, bmfont: face.outputs.bmfont.relativePath, godotResource: face.outputs.godotResource.relativePath }];
    })),
    policy: source.request.godot,
    authority: AUTHORITY,
  };
  const roleMapSha256 = hashObject(roleMapBody);
  const roleMap = deepFreeze({ ...roleMapBody, roleMapSha256, runId: roleMapSha256.slice(0, 20) });
  const roleMapPath = path.join(root, plan.familyOutputs.roleMap);
  await writeJsonCreateOnly(roleMapPath, roleMap, root);
  const readmePath = path.join(root, plan.familyOutputs.readme);
  const licensePath = path.join(root, plan.familyOutputs.license);
  await writeCreateOnly(readmePath, readme(source.request), root);
  await writeCreateOnly(licensePath, license(source.request), root);
  const familyBody = {
    schema: FAMILY_SCHEMA,
    familyId: source.request.familyId,
    displayName: source.request.displayName,
    version: source.request.version,
    sourceGrid: source.request.sourceGrid,
    request: source.binding,
    planDefinitionSha256: plan.definitionSha256,
    godot: source.request.godot,
    roleMap: { relativePath: plan.familyOutputs.roleMap, ...(await identity(roleMapPath)), documentSha256: roleMap.roleMapSha256 },
    faces: faceDocuments.map((face) => ({ faceId: face.faceId, role: face.role, faceSha256: face.faceSha256, qa: face.qa, outputs: face.outputs })),
    auxiliary: { readme: { relativePath: plan.familyOutputs.readme, ...(await identity(readmePath)) }, license: { relativePath: plan.familyOutputs.license, ...(await identity(licensePath)) } },
    delivery: source.request.delivery,
    buildPolicy: { deterministic: true, dependencyFree: true, createOnly: true, externalFontBinaryUsed: false },
    authority: AUTHORITY,
  };
  const familySha256 = hashObject(familyBody);
  const family = deepFreeze({ ...familyBody, familySha256, runId: familySha256.slice(0, 20) });
  const familyPath = path.join(root, plan.familyOutputs.family);
  await writeJsonCreateOnly(familyPath, family, root);
  const validation = await validateFamily({ familyPath });
  const validationPath = path.join(root, plan.familyOutputs.validation);
  await writeJsonCreateOnly(validationPath, validation, root);
  const receiptBody = {
    schema: RECEIPT_SCHEMA,
    status: validation.status,
    familyId: family.familyId,
    family: { path: familyPath, ...(await identity(familyPath)), documentSha256: family.familySha256 },
    validation: { path: validationPath, ...(await identity(validationPath)), documentSha256: validation.validationSha256 },
    faces: faceDocuments.map((face) => ({ faceId: face.faceId, status: face.qa.status, faceSha256: face.faceSha256 })),
    authority: AUTHORITY,
  };
  const receiptSha256 = hashObject(receiptBody);
  const receipt = deepFreeze({ ...receiptBody, receiptSha256, runId: receiptSha256.slice(0, 20) });
  const receiptPath = path.join(root, plan.familyOutputs.receipt);
  await writeJsonCreateOnly(receiptPath, receipt, root);
  return deepFreeze({ plan, family, validation, receipt, familyPath, validationPath, receiptPath });
}

