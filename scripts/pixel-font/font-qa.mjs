import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { canonicalRegularFile, decodePng, deepFreeze, readJson, sha256 } from './common.mjs';
import { CONFUSABLES, normalizeRequest } from './font-config.mjs';
import { compilePlan } from './font-plan.mjs';

export function faceQa(request, face, glyphs, packed, atlasBytes, specimenBytes) {
  const blockers = [];
  const warnings = [];
  if (glyphs.length > request.quality.maximumGlyphs) blockers.push('maximum-glyphs-exceeded');
  if (packed.width > request.quality.maximumAtlasEdge || packed.height > request.quality.maximumAtlasEdge) blockers.push('maximum-atlas-edge-exceeded');
  if (glyphs.some((glyph) => glyph.codepoint !== 32 && glyph.visiblePixels < request.quality.minimumVisiblePixels)) blockers.push('glyph-below-minimum-visible-pixels');
  const duplicates = [];
  for (const group of CONFUSABLES) {
    const seen = new Map();
    for (const character of group) {
      const glyph = glyphs.find((candidate) => candidate.codepoint === character.codePointAt(0));
      if (!glyph) continue;
      const list = seen.get(glyph.matrixSha256) ?? [];
      list.push(character);
      seen.set(glyph.matrixSha256, list);
    }
    for (const values of seen.values()) if (values.length > 1) duplicates.push(values.join('='));
  }
  if (duplicates.length) {
    (request.quality.requireDistinctConfusables ? blockers : warnings).push('confusable-glyphs-duplicate');
  }
  const atlas = decodePng(atlasBytes);
  const specimen = specimenBytes ? decodePng(specimenBytes) : null;
  const visible = (image) => {
    let count = 0;
    for (let offset = 3; offset < image.rgba.length; offset += 4) if (image.rgba[offset]) count += 1;
    return count;
  };
  if (!visible(atlas)) blockers.push('atlas-blank');
  if (specimen && !visible(specimen)) blockers.push('specimen-blank');
  return deepFreeze({ status: blockers.length ? 'blocked' : 'passed', blockers: blockers.sort(), warnings: warnings.sort(), duplicateConfusables: duplicates.sort(), atlas: { width: packed.width, height: packed.height, visiblePixels: visible(atlas) }, specimen: specimen ? { width: specimen.width, height: specimen.height, visiblePixels: visible(specimen) } : null });
}

export async function identity(filePath) {
  const file = await canonicalRegularFile(filePath, 'Generated pixel-font file');
  const bytes = await readFile(file.path);
  return deepFreeze({ sha256: sha256(bytes), sizeBytes: bytes.length });
}

export function readme(request) {
  const roles = Object.entries(request.roleMap).map(([role, face]) => `- \`${role}\` → \`${face}\``).join('\n');
  return Buffer.from(`# ${request.displayName}\n\nOriginal EVAVO bitmap-font family generated from the committed \`${request.sourceGrid}\` grid. No external font binary is traced, converted, subsetted or redistributed.\n\n## Roles\n\n${roles}\n\n## Runtime\n\nLoad the generated AngelCode BMFont \`.fnt\` files as Godot \`FontFile\` resources. Keep nearest filtering, no mipmaps, no subpixel positioning and integer-multiple scaling.\n`, 'utf8');
}

export function license(request) {
  return Buffer.from(`${request.displayName}\n${request.copyright}\n\n${request.license.type}\nRights holder: ${request.license.holder}\n\n${request.license.terms}\n\nThis family is generated from original EVAVO-authored pixel glyph primitives and contains no third-party font binary.\n`, 'utf8');
}

export async function readRequest(requestPath) {
  const source = await readJson(requestPath, 'Pixel-font family request');
  return deepFreeze({
    request: normalizeRequest(source.value),
    binding: {
      file: path.basename(source.path),
      sha256: sha256(source.bytes),
      sizeBytes: source.bytes.length,
    },
  });
}

export async function planFamily({ requestPath, outputRoot }) {
  const source = await readRequest(requestPath);
  return compilePlan(source.request, source.binding, outputRoot);
}

