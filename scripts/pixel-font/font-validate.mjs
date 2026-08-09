import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AUTHORITY, FAMILY_SCHEMA, VALIDATION_SCHEMA, decodePng, deepFreeze, hashObject, isHash, objectValue, readJson, sha256, stable } from './common.mjs';
import { identity } from './font-qa.mjs';

function verifySelfHash(value, key) {
  if (!isHash(value[key]) || value.runId !== value[key].slice(0, 20)) throw new Error(`${key} or runId is invalid.`);
  const body = { ...value };
  delete body[key];
  delete body.runId;
  if (hashObject(body) !== value[key]) throw new Error(`${key} differs.`);
}

export async function validateFamily({ familyPath }) {
  const source = await readJson(familyPath, 'Pixel-font family');
  const family = objectValue(source.value, 'Pixel-font family');
  if (family.schema !== FAMILY_SCHEMA) throw new Error(`Expected ${FAMILY_SCHEMA}.`);
  verifySelfHash(family, 'familySha256');
  const root = path.dirname(source.path);
  const blockers = [];
  const verifiedFiles = [];
  for (const faceSummary of family.faces ?? []) {
    const faceRecord = faceSummary.outputs?.face;
    if (!faceRecord) {
      blockers.push(`missing-face-document:${faceSummary.faceId}`);
      continue;
    }
    const facePath = path.join(root, faceRecord.relativePath);
    const faceSource = await readJson(facePath, `Face ${faceSummary.faceId}`);
    if (sha256(faceSource.bytes) !== faceRecord.sha256 || faceSource.bytes.length !== faceRecord.sizeBytes) blockers.push(`face-identity:${faceSummary.faceId}`);
    verifySelfHash(faceSource.value, 'faceSha256');
    if (faceSource.value.faceSha256 !== faceSummary.faceSha256) blockers.push(`face-document-hash:${faceSummary.faceId}`);
    if (faceSource.value.qa?.status !== 'passed' || faceSource.value.qa?.blockers?.length) blockers.push(`face-qa:${faceSummary.faceId}`);
    for (const [kind, record] of Object.entries(faceSource.value.outputs ?? {})) {
      const target = path.join(root, record.relativePath);
      const binding = await identity(target);
      if (binding.sha256 !== record.sha256 || binding.sizeBytes !== record.sizeBytes) blockers.push(`output-identity:${faceSummary.faceId}:${kind}`);
      verifiedFiles.push({ faceId: faceSummary.faceId, kind, relativePath: record.relativePath, ...binding });
    }
    const atlas = decodePng(await readFile(path.join(root, faceSource.value.outputs.atlas.relativePath)));
    const fnt = await readFile(path.join(root, faceSource.value.outputs.bmfont.relativePath), 'utf8');
    const dimensions = /^common .*scaleW=(\d+) scaleH=(\d+)/mu.exec(fnt);
    if (!dimensions || Number(dimensions[1]) !== atlas.width || Number(dimensions[2]) !== atlas.height) blockers.push(`fnt-atlas-size:${faceSummary.faceId}`);
    const charRows = [...fnt.matchAll(/^char id=(\d+) x=(\d+) y=(\d+) width=(\d+) height=(\d+) xoffset=(-?\d+) yoffset=(-?\d+) xadvance=(\d+) page=0 chnl=15$/gmu)];
    const observed = charRows.map((match) => Number(match[1])).sort((a, b) => a - b);
    if (sha256(stable(observed)) !== faceSource.value.coverageSha256) blockers.push(`fnt-coverage:${faceSummary.faceId}`);
    for (const row of charRows) {
      const x = Number(row[2]); const y = Number(row[3]); const width = Number(row[4]); const height = Number(row[5]);
      if (x < 0 || y < 0 || width < 1 || height < 1 || x + width > atlas.width || y + height > atlas.height) blockers.push(`fnt-bounds:${faceSummary.faceId}:${row[1]}`);
    }
  }
  const roleSource = await readJson(path.join(root, family.roleMap.relativePath), 'Godot pixel-font role map');
  if (sha256(roleSource.bytes) !== family.roleMap.sha256 || roleSource.bytes.length !== family.roleMap.sizeBytes) blockers.push('role-map-identity');
  verifySelfHash(roleSource.value, 'roleMapSha256');
  const policy = roleSource.value.policy;
  if (policy?.textureFilter !== 'nearest' || policy?.integerScaleOnly !== true || policy?.subpixelPositioning !== false || policy?.mipmaps !== false) blockers.push('godot-pixel-policy');
  if (Object.values(AUTHORITY).some((value) => value !== false) || stable(family.authority) !== stable(AUTHORITY)) blockers.push('authority');
  const body = {
    schema: VALIDATION_SCHEMA,
    status: blockers.length ? 'blocked' : 'passed',
    familyId: family.familyId,
    familySha256: family.familySha256,
    blockers: blockers.sort(),
    verifiedFiles: verifiedFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    authority: AUTHORITY,
  };
  const validationSha256 = hashObject(body);
  return deepFreeze({ ...body, validationSha256, runId: validationSha256.slice(0, 20) });
}
