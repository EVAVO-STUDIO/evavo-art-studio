import { REQUEST_SCHEMA, booleanValue, deepFreeze, integer, objectValue, text } from './common.mjs';
import { CHARACTER_SETS } from './glyph-library.mjs';
import { normalizeFace } from './font-face.mjs';
import { CONFUSABLES, FACE_ROLES, KERNING, PRESETS, color, exactKeys } from './font-presets.mjs';
export { CONFUSABLES, FACE_ROLES, KERNING, PRESETS, color };

export function normalizeRequest(value) {
  const request = objectValue(value, 'Pixel-font family request');
  exactKeys(request, [
    'schema', 'familyId', 'displayName', 'version', 'copyright', 'license',
    'sourceGrid', 'characterSets', 'additionalGlyphs', 'faces', 'roleMap',
    'specimenLines', 'godot', 'quality', 'delivery',
  ], 'Pixel-font family request');
  if (request.schema !== REQUEST_SCHEMA) throw new Error(`Expected ${REQUEST_SCHEMA}.`);
  if (request.sourceGrid !== 'evavo-5x7-v1') throw new Error('sourceGrid must be evavo-5x7-v1.');
  if (!Array.isArray(request.characterSets) || request.characterSets.some((entry) => !CHARACTER_SETS[entry])) {
    throw new Error('characterSets is invalid.');
  }
  const additional = request.additionalGlyphs ?? [];
  if (!Array.isArray(additional)) throw new Error('additionalGlyphs must be an array.');
  if (!Array.isArray(request.faces) || request.faces.length < 1 || request.faces.length > 32) {
    throw new Error('faces must contain 1..32 entries.');
  }
  const faces = request.faces.map((face, index) => normalizeFace(face, index, request.characterSets, additional));
  if (new Set(faces.map((face) => face.id)).size !== faces.length) throw new Error('Face IDs must be unique.');
  const roleMap = objectValue(request.roleMap, 'roleMap');
  for (const [role, faceId] of Object.entries(roleMap)) {
    text(role, `roleMap.${role}`, 1, 96);
    if (!faces.some((face) => face.id === faceId)) throw new Error(`roleMap.${role} references unknown face ${faceId}.`);
  }
  const license = objectValue(request.license, 'license');
  exactKeys(license, ['type', 'holder', 'terms'], 'license');
  const godot = objectValue(request.godot, 'godot');
  exactKeys(godot, ['minimumVersion', 'targetVersion', 'resourceBasePath', 'textureFilter', 'integerScaleOnly', 'subpixelPositioning', 'mipmaps'], 'godot');
  if (godot.textureFilter !== 'nearest' || godot.integerScaleOnly !== true || godot.subpixelPositioning !== false || godot.mipmaps !== false) {
    throw new Error('Godot pixel-font policy requires nearest, integer scaling, no subpixel positioning and no mipmaps.');
  }
  const delivery = request.delivery === undefined
    ? { includeSpecimens: true, includeDetailedGlyphRecords: true }
    : objectValue(request.delivery, 'delivery');
  exactKeys(delivery, ['includeSpecimens', 'includeDetailedGlyphRecords'], 'delivery');
  const normalizedDelivery = deepFreeze({
    includeSpecimens: delivery.includeSpecimens === undefined
      ? true
      : booleanValue(delivery.includeSpecimens, 'delivery.includeSpecimens'),
    includeDetailedGlyphRecords: delivery.includeDetailedGlyphRecords === undefined
      ? true
      : booleanValue(delivery.includeDetailedGlyphRecords, 'delivery.includeDetailedGlyphRecords'),
  });
  const quality = objectValue(request.quality, 'quality');
  exactKeys(quality, ['maximumAtlasEdge', 'maximumGlyphs', 'minimumVisiblePixels', 'requireDistinctConfusables'], 'quality');
  const specimenLines = request.specimenLines;
  if (!Array.isArray(specimenLines) || specimenLines.length < 1 || specimenLines.length > 64) throw new Error('specimenLines is invalid.');
  return deepFreeze({
    schema: REQUEST_SCHEMA,
    familyId: text(request.familyId, 'familyId', 1, 96),
    displayName: text(request.displayName, 'displayName', 1, 160),
    version: text(request.version, 'version', 1, 32),
    copyright: text(request.copyright, 'copyright', 1, 512),
    license: deepFreeze({ type: text(license.type, 'license.type', 1, 80), holder: text(license.holder, 'license.holder', 1, 160), terms: text(license.terms, 'license.terms', 1, 2048) }),
    sourceGrid: 'evavo-5x7-v1',
    characterSets: Object.freeze([...request.characterSets]),
    additionalGlyphs: Object.freeze([...additional]),
    faces: Object.freeze(faces),
    roleMap: Object.freeze({ ...roleMap }),
    specimenLines: Object.freeze(specimenLines.map((line, index) => text(line, `specimenLines[${index}]`, 0, 512))),
    godot: deepFreeze({
      minimumVersion: text(godot.minimumVersion, 'godot.minimumVersion', 1, 32),
      targetVersion: text(godot.targetVersion, 'godot.targetVersion', 1, 32),
      resourceBasePath: text(godot.resourceBasePath, 'godot.resourceBasePath', 1, 512),
      textureFilter: 'nearest', integerScaleOnly: true, subpixelPositioning: false, mipmaps: false,
    }),
    delivery: normalizedDelivery,
    quality: deepFreeze({
      maximumAtlasEdge: integer(quality.maximumAtlasEdge, 'quality.maximumAtlasEdge', 64, 4096),
      maximumGlyphs: integer(quality.maximumGlyphs, 'quality.maximumGlyphs', 1, 4096),
      minimumVisiblePixels: integer(quality.minimumVisiblePixels, 'quality.minimumVisiblePixels', 1, 512),
      requireDistinctConfusables: booleanValue(quality.requireDistinctConfusables, 'quality.requireDistinctConfusables'),
    }),
  });
}
