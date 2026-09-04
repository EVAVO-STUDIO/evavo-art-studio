import crypto from 'node:crypto';

export const FX_DECAL_SVG_FORMAT = 'evavo.fx-decal-svg-candidate/v1';

function hashSeed(seed) {
  const digest = crypto.createHash('sha256').update(String(seed)).digest();
  return digest.readUInt32LE(0) || 1;
}

function rng(seed) {
  let state = hashSeed(seed);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value)));
const fmt = (value) => Number(value).toFixed(3).replace(/\.000$/, '');

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(stable(value)).digest('hex');
}

function ellipse(cx, cy, rx, ry, opacity = 1, fill = 'white', rotation = 0) {
  const transform = rotation ? ` transform="rotate(${fmt(rotation)} ${fmt(cx)} ${fmt(cy)})"` : '';
  return `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${fill}" fill-opacity="${fmt(opacity)}"${transform}/>`;
}

function path(points, width, opacity = 1, stroke = 'white') {
  if (!points.length) return '';
  const d = points.map((point, index) => `${index ? 'L' : 'M'} ${fmt(point[0])} ${fmt(point[1])}`).join(' ');
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-opacity="${fmt(opacity)}" stroke-width="${fmt(width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function bulletHole(rand, substrate, size) {
  const cx = 512;
  const cy = 512;
  const inner = 20 + size * 28;
  const chip = 44 + size * 58;
  const parts = [ellipse(cx, cy, inner * 0.7, inner, 1)];
  const chipCount = substrate === 'metal' ? 7 : substrate === 'glass' ? 5 : 12;
  for (let index = 0; index < chipCount; index += 1) {
    const angle = rand() * Math.PI * 2;
    const distance = inner * (0.8 + rand() * 1.5);
    const radius = chip * (0.05 + rand() * 0.08);
    parts.push(ellipse(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance, radius * (0.6 + rand()), radius, 0.45 + rand() * 0.45, 'white', rand() * 180));
  }
  if (substrate === 'plaster' || substrate === 'brick' || substrate === 'glass') {
    const crackCount = substrate === 'glass' ? 12 : 7;
    for (let index = 0; index < crackCount; index += 1) {
      const angle = rand() * Math.PI * 2;
      const points = [[cx, cy]];
      let x = cx;
      let y = cy;
      const segments = 2 + Math.floor(rand() * 3);
      for (let segment = 0; segment < segments; segment += 1) {
        const step = chip * (0.35 + rand() * 0.5);
        x += Math.cos(angle + (rand() - 0.5) * 0.28) * step;
        y += Math.sin(angle + (rand() - 0.5) * 0.28) * step;
        points.push([x, y]);
      }
      parts.push(path(points, substrate === 'glass' ? 2.2 : 5.0, 0.45 + rand() * 0.4));
    }
  }
  return parts;
}

function splatter(rand, viscosity, directionDegrees, amount) {
  const cx = 512;
  const cy = 512;
  const angle = directionDegrees * Math.PI / 180;
  const parts = [];
  const mainRx = 95 + amount * 120;
  const mainRy = mainRx * (0.38 + viscosity * 0.42);
  parts.push(ellipse(cx, cy, mainRx, mainRy, 0.9, 'white', directionDegrees));
  const satellites = Math.round(10 + amount * 24 + (1 - viscosity) * 18);
  for (let index = 0; index < satellites; index += 1) {
    const travel = 50 + rand() * (240 + amount * 240);
    const spread = (rand() - 0.5) * (0.45 + (1 - viscosity) * 0.75);
    const px = cx + Math.cos(angle + spread) * travel;
    const py = cy + Math.sin(angle + spread) * travel;
    const radius = 5 + rand() * (18 + amount * 20);
    parts.push(ellipse(px, py, radius * (0.5 + rand() * 0.8), radius, 0.45 + rand() * 0.55, 'white', directionDegrees + (rand() - 0.5) * 60));
  }
  return parts;
}

function stain(rand, porosity, gravity, amount) {
  const parts = [];
  const cx = 512;
  const cy = 420;
  const base = 105 + amount * 170;
  for (let index = 0; index < 7; index += 1) {
    const angle = rand() * Math.PI * 2;
    const distance = rand() * base * 0.4;
    parts.push(ellipse(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance, base * (0.35 + rand() * 0.35), base * (0.24 + rand() * 0.34), 0.2 + rand() * 0.35, 'white', rand() * 180));
  }
  const dripCount = Math.round((gravity ? 2 : 0) + amount * 5 + (1 - porosity) * 3);
  for (let index = 0; index < dripCount; index += 1) {
    const x = cx - base * 0.55 + rand() * base * 1.1;
    const start = cy + base * 0.1 + rand() * base * 0.35;
    const length = base * (0.25 + rand() * 0.75);
    parts.push(path([[x, start], [x + (rand() - 0.5) * 18, start + length]], 4 + rand() * 13, 0.25 + rand() * 0.5));
  }
  return parts;
}

function puddle(rand, amount) {
  const parts = [];
  const cx = 512;
  const cy = 560;
  const width = 160 + amount * 260;
  const height = width * 0.22;
  for (let index = 0; index < 10; index += 1) {
    const offsetX = (rand() - 0.5) * width * 0.55;
    const offsetY = (rand() - 0.5) * height * 0.75;
    parts.push(ellipse(cx + offsetX, cy + offsetY, width * (0.18 + rand() * 0.22), height * (0.5 + rand() * 0.5), 0.15 + rand() * 0.35, 'white', (rand() - 0.5) * 18));
  }
  return parts;
}

export function compileFxDecalSvgCandidate(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('request must be object');
  const kind = request.kind;
  if (!['bullet-hole','splatter','stain','puddle'].includes(kind)) throw new Error(`unsupported decal kind: ${kind}`);
  if (typeof request.id !== 'string' || !/^[A-Za-z0-9._-]{1,96}$/.test(request.id)) throw new Error('request.id invalid');
  const substrate = request.substrate ?? 'plaster';
  const seed = request.seed ?? request.id;
  const amount = clamp(request.amount ?? 0.5);
  const rand = rng(`${seed}:${kind}:${substrate}`);
  let shapes;
  if (kind === 'bullet-hole') shapes = bulletHole(rand, substrate, amount);
  else if (kind === 'splatter') shapes = splatter(rand, clamp(request.viscosity ?? 0.5), Number(request.directionDegrees ?? 90), amount);
  else if (kind === 'stain') shapes = stain(rand, clamp(request.porosity ?? 0.5), request.gravity !== false, amount);
  else shapes = puddle(rand, amount);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">\n<g id="candidate-mask">${shapes.join('')}</g>\n</svg>\n`;
  const withoutDigest = {
    format: FX_DECAL_SVG_FORMAT,
    authority: 'candidate_vector_mask_only',
    id: request.id,
    kind,
    substrate,
    seed: String(seed),
    canvas: { width: 1024, height: 1024, background: 'transparent', maskColour: 'white' },
    svg,
    finishing: {
      trueAlphaRequired: true,
      rasterizeThroughExistingArtStudioProcessing: true,
      edgeFringeCheckRequired: true,
      substrateIntegrationReviewRequired: true,
      persistentResidueOnly: true,
    },
    authorityBoundary: {
      automaticApproval: false,
      canonicalPromotion: false,
      publication: false,
      textureMaterialResponseRemainsTextureStudioAuthority: true,
      transientBurstRemainsParticleStudioAuthority: true,
    },
  };
  return { ...withoutDigest, candidateSha256: sha256(withoutDigest) };
}
