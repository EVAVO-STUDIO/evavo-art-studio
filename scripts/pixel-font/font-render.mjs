import { deepFreeze, nextPowerOfTwo, sha256, stable } from './common.mjs';
import { color } from './font-config.mjs';
import { glyphPattern } from './glyph-library.mjs';

export function copyPixel(target, targetWidth, x, y, source, sourceWidth, sourceX, sourceY) {
  const destination = (y * targetWidth + x) * 4;
  const origin = (sourceY * sourceWidth + sourceX) * 4;
  const alpha = source[origin + 3] / 255;
  if (alpha <= 0) return;
  const destinationAlpha = target[destination + 3] / 255;
  const outputAlpha = alpha + destinationAlpha * (1 - alpha);
  target[destination] = Math.round((source[origin] * alpha + target[destination] * destinationAlpha * (1 - alpha)) / outputAlpha);
  target[destination + 1] = Math.round((source[origin + 1] * alpha + target[destination + 1] * destinationAlpha * (1 - alpha)) / outputAlpha);
  target[destination + 2] = Math.round((source[origin + 2] * alpha + target[destination + 2] * destinationAlpha * (1 - alpha)) / outputAlpha);
  target[destination + 3] = Math.round(outputAlpha * 255);
}

export function fillPixel(target, width, height, x, y, fill) {
  if (x < 0 || y < 0 || x >= width || y >= height || fill.a <= 0) return;
  const offset = (y * width + x) * 4;
  const alpha = fill.a / 255;
  const destinationAlpha = target[offset + 3] / 255;
  const outputAlpha = alpha + destinationAlpha * (1 - alpha);
  target[offset] = Math.round((fill.r * alpha + target[offset] * destinationAlpha * (1 - alpha)) / outputAlpha);
  target[offset + 1] = Math.round((fill.g * alpha + target[offset + 1] * destinationAlpha * (1 - alpha)) / outputAlpha);
  target[offset + 2] = Math.round((fill.b * alpha + target[offset + 2] * destinationAlpha * (1 - alpha)) / outputAlpha);
  target[offset + 3] = Math.round(outputAlpha * 255);
}
function trimMatrix(matrix, codepoint) {
  if (codepoint === 32) return matrix;
  let left = 5;
  let right = -1;
  for (const row of matrix) {
    row.forEach((pixel, index) => {
      if (pixel) {
        left = Math.min(left, index);
        right = Math.max(right, index);
      }
    });
  }
  return right < left ? matrix : matrix.map((row) => row.slice(left, right + 1));
}

function faceMatrix(face, codepoint) {
  let source = codepoint;
  const character = String.fromCodePoint(codepoint);
  if (face.uppercaseOnly && /[a-z]/u.test(character)) source = character.toUpperCase().codePointAt(0);
  let matrix = glyphPattern(source) ?? glyphPattern(face.fallbackCodepoint);
  if (!matrix) throw new Error(`No glyph for U+${codepoint.toString(16).toUpperCase()}.`);
  matrix = matrix.map((row) => [...row]);
  for (let count = 0; count < face.boldPixels; count += 1) {
    matrix = matrix.map((row) => row.map((pixel, x) => pixel || (x > 0 && row[x - 1])));
  }
  return trimMatrix(matrix, codepoint);
}

export function renderGlyph(face, codepoint) {
  const matrix = faceMatrix(face, codepoint);
  const scale = face.pixelScale;
  const width = Math.max(1, matrix[0].length * scale + face.outline * 2 + face.shadowX);
  const height = Math.max(1, matrix.length * scale + face.outline * 2 + face.shadowY);
  const rgba = Buffer.alloc(width * height * 4);
  const fill = color(face.fill, `${face.id}.fill`);
  const outline = color(face.outlineColor, `${face.id}.outlineColor`);
  const shadow = color(face.shadowColor, `${face.id}.shadowColor`);
  const pixels = [];
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix[y].length; x += 1) {
      if (!matrix[y][x]) continue;
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) pixels.push({ x: face.outline + x * scale + sx, y: face.outline + y * scale + sy });
      }
    }
  }
  for (const pixel of pixels) fillPixel(rgba, width, height, pixel.x + face.shadowX, pixel.y + face.shadowY, shadow);
  for (const pixel of pixels) {
    for (let oy = -face.outline; oy <= face.outline; oy += 1) {
      for (let ox = -face.outline; ox <= face.outline; ox += 1) fillPixel(rgba, width, height, pixel.x + ox, pixel.y + oy, outline);
    }
  }
  for (const pixel of pixels) fillPixel(rgba, width, height, pixel.x, pixel.y, fill);
  const advance = face.monospace
    ? 5 * scale + face.outline * 2 + face.tracking + face.boldPixels * scale
    : matrix[0].length * scale + face.outline * 2 + face.tracking;
  return deepFreeze({ codepoint, width, height, xadvance: Math.max(1, advance), matrixSha256: sha256(stable(matrix)), visiblePixels: pixels.length, rgba });
}

export function packGlyphs(glyphs, maximumEdge) {
  const padding = 2;
  const area = glyphs.reduce((total, glyph) => total + (glyph.width + padding) * (glyph.height + padding), 0);
  let width = Math.min(maximumEdge, nextPowerOfTwo(Math.max(64, Math.ceil(Math.sqrt(area)))));
  for (;;) {
    let x = padding;
    let y = padding;
    let shelf = 0;
    const placements = [];
    let impossible = false;
    for (const glyph of glyphs) {
      if (glyph.width + padding * 2 > width) {
        impossible = true;
        break;
      }
      if (x + glyph.width + padding > width) {
        x = padding;
        y += shelf + padding;
        shelf = 0;
      }
      placements.push(deepFreeze({ ...glyph, x, y }));
      x += glyph.width + padding;
      shelf = Math.max(shelf, glyph.height);
    }
    const usedHeight = y + shelf + padding;
    if (!impossible && usedHeight <= maximumEdge) {
      const height = nextPowerOfTwo(Math.max(32, usedHeight));
      if (height <= maximumEdge) return deepFreeze({ width, height, placements });
    }
    if (width >= maximumEdge) throw new Error('Glyphs exceed the configured atlas edge.');
    width = Math.min(maximumEdge, width * 2);
  }
}

export function blit(target, targetWidth, targetHeight, glyph) {
  for (let y = 0; y < glyph.height; y += 1) {
    for (let x = 0; x < glyph.width; x += 1) {
      if (glyph.x + x >= targetWidth || glyph.y + y >= targetHeight) throw new Error('Glyph placement escaped atlas.');
      copyPixel(target, targetWidth, glyph.x + x, glyph.y + y, glyph.rgba, glyph.width, x, y);
    }
  }
}

