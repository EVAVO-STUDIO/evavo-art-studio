import path from 'node:path';
import { AUTHORITY, PLAN_SCHEMA, deepFreeze, hashObject } from './common.mjs';

function outputPaths(face, delivery) {
  const outputs = {
    atlas: `faces/${face.id}/${face.id}.png`,
    bmfont: `faces/${face.id}/${face.id}.fnt`,
    godotResource: `faces/${face.id}/${face.id}.tres`,
    face: `faces/${face.id}/${face.id}.face.json`,
  };
  if (delivery.includeSpecimens) outputs.specimen = `faces/${face.id}/${face.id}.specimen.png`;
  return deepFreeze(outputs);
}

export function compilePlan(request, requestBinding, outputRoot) {
  const definition = {
    schema: PLAN_SCHEMA,
    familyId: request.familyId,
    version: request.version,
    request: requestBinding,
    faces: request.faces.map((face) => ({
      id: face.id,
      role: face.role,
      preset: face.preset,
      codepoints: face.codepoints,
      outputs: outputPaths(face, request.delivery),
    })),
    familyOutputs: {
      family: 'pixel-font-family.json',
      validation: 'pixel-font-validation.json',
      receipt: 'pixel-font-build-receipt.json',
      roleMap: 'godot/pixel-font-role-map.json',
      readme: 'README.md',
      license: 'EVAVO-ORIGINAL-PIXEL-FONT-LICENSE.txt',
    },
    authority: AUTHORITY,
  };
  const definitionSha256 = hashObject(definition);
  const body = {
    ...definition,
    definitionSha256,
    outputRoot: path.resolve(outputRoot),
  };
  const planSha256 = hashObject(body);
  return deepFreeze({ ...body, planSha256, runId: planSha256.slice(0, 20) });
}
