import { deepFreeze, objectValue, text } from './common.mjs';
import { CHARACTER_SETS, codepointsForSets } from './glyph-library.mjs';
import { FACE_ROLES, PRESETS, color, exactKeys, optionalBoolean, optionalInteger } from './font-presets.mjs';

export function normalizeFace(value, index, globalSets, globalAdditional) {
  const face = objectValue(value, `faces[${index}]`);
  exactKeys(face, [
    'id', 'displayName', 'role', 'preset', 'characterSets', 'additionalGlyphs',
    'pixelScale', 'tracking', 'lineGap', 'monospace', 'uppercaseOnly',
    'boldPixels', 'outline', 'shadowX', 'shadowY', 'fill', 'outlineColor',
    'shadowColor', 'fallbackCodepoint',
  ], `faces[${index}]`);
  const id = text(face.id, `faces[${index}].id`, 1, 96);
  if (!/^[a-z0-9][a-z0-9_-]*$/u.test(id)) throw new Error(`faces[${index}].id is invalid.`);
  const presetId = text(face.preset, `faces[${index}].preset`, 1, 64);
  const preset = PRESETS[presetId];
  if (!preset) throw new Error(`Unknown preset ${presetId}.`);
  const role = text(face.role, `faces[${index}].role`, 1, 32);
  if (!FACE_ROLES.includes(role)) throw new Error(`Unknown role ${role}.`);
  const characterSets = face.characterSets ?? globalSets;
  if (!Array.isArray(characterSets) || characterSets.length < 1 || characterSets.some((entry) => !CHARACTER_SETS[entry])) {
    throw new Error(`faces[${index}].characterSets is invalid.`);
  }
  const additionalGlyphs = [...globalAdditional, ...(face.additionalGlyphs ?? [])];
  if (!Array.isArray(additionalGlyphs) || additionalGlyphs.length > 512) throw new Error(`faces[${index}].additionalGlyphs is invalid.`);
  const normalized = {
    id,
    displayName: text(face.displayName, `faces[${index}].displayName`, 1, 160),
    role,
    preset: presetId,
    characterSets: Object.freeze([...characterSets]),
    additionalGlyphs: Object.freeze([...additionalGlyphs]),
    pixelScale: optionalInteger(face.pixelScale, preset.pixelScale, `faces[${index}].pixelScale`, 1, 8),
    tracking: optionalInteger(face.tracking, preset.tracking, `faces[${index}].tracking`, 0, 8),
    lineGap: optionalInteger(face.lineGap, preset.lineGap, `faces[${index}].lineGap`, 0, 16),
    monospace: optionalBoolean(face.monospace, preset.monospace, `faces[${index}].monospace`),
    uppercaseOnly: optionalBoolean(face.uppercaseOnly, preset.uppercaseOnly, `faces[${index}].uppercaseOnly`),
    boldPixels: optionalInteger(face.boldPixels, preset.boldPixels, `faces[${index}].boldPixels`, 0, 3),
    outline: optionalInteger(face.outline, preset.outline, `faces[${index}].outline`, 0, 4),
    shadowX: optionalInteger(face.shadowX, preset.shadowX, `faces[${index}].shadowX`, 0, 8),
    shadowY: optionalInteger(face.shadowY, preset.shadowY, `faces[${index}].shadowY`, 0, 8),
    fill: face.fill ?? '#FFFFFFFF',
    outlineColor: face.outlineColor ?? '#0B0608FF',
    shadowColor: face.shadowColor ?? '#00000088',
    fallbackCodepoint: optionalInteger(face.fallbackCodepoint, 63, `faces[${index}].fallbackCodepoint`, 32, 0x10ffff),
  };
  color(normalized.fill, `faces[${index}].fill`);
  color(normalized.outlineColor, `faces[${index}].outlineColor`);
  color(normalized.shadowColor, `faces[${index}].shadowColor`);
  normalized.codepoints = codepointsForSets(normalized.characterSets, normalized.additionalGlyphs);
  return deepFreeze(normalized);
}
