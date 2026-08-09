import { encodePng } from './common.mjs';
import { KERNING } from './font-config.mjs';
import { copyPixel } from './font-render.mjs';

export function bmfont(face, packed) {
  const lineHeight = Math.max(...packed.placements.map((glyph) => glyph.height)) + face.lineGap;
  const base = Math.max(...packed.placements.map((glyph) => glyph.height - face.shadowY));
  const lines = [
    `info face="${face.displayName.replaceAll('"', '')}" size=${lineHeight} bold=${face.boldPixels > 0 ? 1 : 0} italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=1 padding=${face.outline},${face.outline},${face.outline},${face.outline} spacing=${face.tracking},${face.lineGap}`,
    `common lineHeight=${lineHeight} base=${base} scaleW=${packed.width} scaleH=${packed.height} pages=1 packed=0 alphaChnl=0 redChnl=4 greenChnl=4 blueChnl=4`,
    `page id=0 file="${face.id}.png"`,
    `chars count=${packed.placements.length}`,
  ];
  for (const glyph of packed.placements) {
    lines.push(`char id=${glyph.codepoint} x=${glyph.x} y=${glyph.y} width=${glyph.width} height=${glyph.height} xoffset=0 yoffset=0 xadvance=${glyph.xadvance} page=0 chnl=15`);
  }
  const codepoints = new Set(packed.placements.map((glyph) => glyph.codepoint));
  const kernings = face.monospace
    ? []
    : KERNING.filter(([first, second]) => codepoints.has(first.codePointAt(0)) && codepoints.has(second.codePointAt(0)))
      .map(([first, second]) => `kerning first=${first.codePointAt(0)} second=${second.codePointAt(0)} amount=${-Math.max(1, Math.floor(face.pixelScale / 2))}`);
  lines.push(`kernings count=${kernings.length}`, ...kernings);
  return Buffer.from(`${lines.join('\n')}\n`, 'utf8');
}

export function godotResource(resourceBasePath, relativeBmfont) {
  const resourcePath = `${resourceBasePath.replace(/\/$/u, '')}/${relativeBmfont}`;
  return Buffer.from(`[gd_resource type="FontVariation" load_steps=2 format=3]\n\n[ext_resource type="FontFile" path="res://${resourcePath}" id="1_font"]\n\n[resource]\nbase_font = ExtResource("1_font")\nspacing_glyph = 0\nspacing_space = 0\nspacing_top = 0\nspacing_bottom = 0\n`, 'utf8');
}

export function renderSpecimen(request, face, packed, atlas) {
  const lookup = new Map(packed.placements.map((glyph) => [glyph.codepoint, glyph]));
  const width = 1280;
  const margin = 12;
  const lineHeight = Math.max(...packed.placements.map((glyph) => glyph.height)) + face.lineGap + 4;
  const rawLines = face.role === 'symbols'
    ? [
        '← ↑ → ↓ ↔  ✓ ✕ ⚓',
        '─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼',
        '═ ║ ╔ ╗ ╚ ╝ ╬',
        String.fromCodePoint(...Array.from({ length: 16 }, (_, index) => 0xE000 + index)),
      ]
    : request.specimenLines;

  const supportedLines = rawLines
    .map((line) => {
      let unsupported = 0;
      let visible = 0;
      for (const character of line) {
        if (character === ' ') continue;
        if (lookup.has(character.codePointAt(0))) visible += 1;
        else unsupported += 1;
      }
      return { line, unsupported, visible };
    })
    .filter((entry) => entry.visible > 0 && entry.unsupported === 0)
    .map((entry) => entry.line);

  const textWidth = (line, factor) =>
    [...line].reduce((total, character) => {
      const glyph = lookup.get(character.codePointAt(0));
      return total + (glyph ? glyph.xadvance * factor : 0);
    }, 0);

  const wrapLine = (line, factor) => {
    const maximum = width - margin * 2;
    if (textWidth(line, factor) <= maximum) return [line];
    const words = line.split(/(\s+)/u).filter(Boolean);
    const output = [];
    let current = '';
    for (const word of words) {
      const candidate = `${current}${word}`;
      if (current.trim() && textWidth(candidate, factor) > maximum) {
        output.push(current.trimEnd());
        current = word.trimStart();
      } else {
        current = candidate;
      }
    }
    if (current.trim()) output.push(current.trimEnd());
    return output.length ? output : [''];
  };

  const lines = [];
  for (const factor of [1, 2]) {
    lines.push({ text: `${face.displayName}  ${factor}X`, factor });
    for (const line of supportedLines) {
      for (const wrapped of wrapLine(line, factor)) lines.push({ text: wrapped, factor });
    }
  }
  const height =
    margin * 2 +
    lines.reduce((total, line) => total + lineHeight * line.factor, 0);
  const rgba = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba[offset] = 4;
    rgba[offset + 1] = 2;
    rgba[offset + 2] = 4;
    rgba[offset + 3] = 255;
  }
  let y = margin;
  for (const line of lines) {
    let x = margin;
    for (const character of line.text) {
      const glyph = lookup.get(character.codePointAt(0));
      if (!glyph) continue;
      for (let gy = 0; gy < glyph.height; gy += 1) {
        for (let gx = 0; gx < glyph.width; gx += 1) {
          for (let sy = 0; sy < line.factor; sy += 1) {
            for (let sx = 0; sx < line.factor; sx += 1) {
              const targetX = x + gx * line.factor + sx;
              const targetY = y + gy * line.factor + sy;
              if (targetX < width && targetY < height) {
                copyPixel(
                  rgba,
                  width,
                  targetX,
                  targetY,
                  atlas,
                  packed.width,
                  glyph.x + gx,
                  glyph.y + gy,
                );
              }
            }
          }
        }
      }
      x += glyph.xadvance * line.factor;
    }
    y += lineHeight * line.factor;
  }
  return encodePng(width, height, rgba);
}

