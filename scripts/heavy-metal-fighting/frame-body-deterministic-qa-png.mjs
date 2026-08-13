import { inflateSync } from "node:zlib";

import {
  AIRBORNE_BANKS,
  GROUNDED_PHASES,
  assert,
  fail,
  freeze,
} from "./frame-body-deterministic-qa-common.mjs";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}
function decodeRgbaPng(bytes) {
  assert(Buffer.isBuffer(bytes) && bytes.length >= 45, "candidate is not a complete PNG.");
  assert(bytes.subarray(0, 8).equals(PNG_SIGNATURE), "candidate lacks the PNG signature.");
  let offset = 8;
  let ihdr = null;
  const idat = [];
  const chunkTypes = [];
  let sawIend = false;
  let sawIdat = false;
  let idatClosed = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    assert(/^[A-Za-z]{4}$/u.test(type), "candidate PNG contains an invalid chunk type.");
    assert(dataEnd + 4 <= bytes.length, `candidate PNG chunk ${type} is truncated.`);
    const data = bytes.subarray(dataStart, dataEnd);
    const expectedCrc = bytes.readUInt32BE(dataEnd);
    assert(crc32(Buffer.concat([typeBytes, data])) === expectedCrc, `candidate PNG chunk ${type} failed CRC validation.`);
    chunkTypes.push(type);
    if (type === "IHDR") {
      assert(ihdr === null && chunkTypes.length === 1 && length === 13, "candidate PNG must begin with one valid IHDR chunk.");
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      assert(!idatClosed, "candidate PNG IDAT chunks must remain contiguous.");
      sawIdat = true;
      idat.push(data);
    } else if (type === "IEND") {
      assert(length === 0 && sawIdat, "candidate PNG IEND is malformed or precedes image data.");
      sawIend = true;
      offset = dataEnd + 4;
      break;
    } else {
      if (sawIdat) idatClosed = true;
      const critical = type.charCodeAt(0) >= 65 && type.charCodeAt(0) <= 90;
      assert(!critical, `candidate PNG contains unsupported critical chunk ${type}.`);
      assert(type !== "PLTE", "candidate 8-bit RGBA PNG may not carry a palette chunk.");
    }
    offset = dataEnd + 4;
  }
  assert(ihdr && sawIend && idat.length >= 1, "candidate PNG is missing IHDR, IDAT, or IEND data.");
  assert(offset === bytes.length, "candidate PNG contains trailing bytes after IEND.");
  const rowBytes = ihdr.width * 4;
  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(idat));
  } catch (error) {
    fail(`candidate PNG image data cannot be inflated: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(inflated.length === (rowBytes + 1) * ihdr.height, "candidate PNG decoded byte length is invalid.");
  const pixels = Buffer.alloc(rowBytes * ihdr.height);
  for (let y = 0; y < ihdr.height; y += 1) {
    const filterType = inflated[y * (rowBytes + 1)];
    assert(filterType >= 0 && filterType <= 4, `candidate PNG row ${y} uses unsupported filter ${filterType}.`);
    const encoded = inflated.subarray(y * (rowBytes + 1) + 1, (y + 1) * (rowBytes + 1));
    const decodedOffset = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= 4 ? pixels[decodedOffset + x - 4] : 0;
      const up = y > 0 ? pixels[decodedOffset - rowBytes + x] : 0;
      const upLeft = y > 0 && x >= 4 ? pixels[decodedOffset - rowBytes + x - 4] : 0;
      let value = encoded[x];
      if (filterType === 1) value = (value + left) & 0xff;
      else if (filterType === 2) value = (value + up) & 0xff;
      else if (filterType === 3) value = (value + Math.floor((left + up) / 2)) & 0xff;
      else if (filterType === 4) value = (value + paeth(left, up, upLeft)) & 0xff;
      pixels[decodedOffset + x] = value;
    }
  }
  return freeze({ ihdr: freeze(ihdr), pixels, chunkTypes: freeze(chunkTypes) });
}
function connectedComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const sizes = [];
  const queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    let size = 0;
    while (head < tail) {
      const index = queue[head++];
      size += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbours = [];
      if (x > 0) neighbours.push(index - 1);
      if (x + 1 < width) neighbours.push(index + 1);
      if (y > 0) neighbours.push(index - width);
      if (y + 1 < height) neighbours.push(index + width);
      for (const neighbour of neighbours) {
        if (mask[neighbour] && !visited[neighbour]) {
          visited[neighbour] = 1;
          queue[tail++] = neighbour;
        }
      }
    }
    sizes.push(size);
  }
  sizes.sort((a, b) => b - a);
  return sizes;
}
function pixelMetrics(decoded, policy) {
  const { width, height } = decoded.ihdr;
  const totalPixels = width * height;
  const mask = new Uint8Array(totalPixels);
  const colours = new Set();
  let opaquePixels = 0;
  let transparentPixels = 0;
  let semiTransparentPixels = 0;
  let unsafeTransparentRgbPixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let pivotGap = Number.POSITIVE_INFINITY;
  let belowGroundLinePixels = 0;
  const cornerAlpha = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const r = decoded.pixels[offset];
      const g = decoded.pixels[offset + 1];
      const b = decoded.pixels[offset + 2];
      const alpha = decoded.pixels[offset + 3];
      if (alpha === 0) {
        transparentPixels += 1;
        if (r !== 0 || g !== 0 || b !== 0) unsafeTransparentRgbPixels += 1;
      } else {
        mask[y * width + x] = 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        pivotGap = Math.min(pivotGap, Math.abs(x - policy.geometry.pivot.x));
        if (y > policy.geometry.groundLineY) belowGroundLinePixels += 1;
        colours.add(`${r},${g},${b}`);
        if (alpha === 255) opaquePixels += 1;
        else semiTransparentPixels += 1;
      }
    }
  }
  for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]) {
    cornerAlpha.push(decoded.pixels[(y * width + x) * 4 + 3]);
  }
  const alphaPixels = opaquePixels + semiTransparentPixels;
  const bounds = alphaPixels === 0 ? null : freeze({
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    topMargin: minY,
    leftMargin: minX,
    rightMargin: width - 1 - maxX,
    bottomMargin: height - 1 - maxY,
  });
  const components = connectedComponents(mask, width, height);
  const largestComponentPixels = components[0] ?? 0;
  const tinyComponents = components.filter((size) => size <= policy.cluster.tinyComponentMaximumPixels).length;
  return freeze({
    totalPixels,
    alphaPixels,
    opaquePixels,
    transparentPixels,
    semiTransparentPixels,
    unsafeTransparentRgbPixels,
    alphaCoverageRatio: totalPixels ? alphaPixels / totalPixels : 0,
    uniqueOpaqueRgbColors: colours.size,
    bounds,
    cornerAlpha: freeze(cornerAlpha),
    pivotGap: Number.isFinite(pivotGap) ? pivotGap : null,
    belowGroundLinePixels,
    connectedComponents: components.length,
    largestComponentPixels,
    largestComponentRatio: alphaPixels ? largestComponentPixels / alphaPixels : 0,
    tinyComponents,
  });
}
function passedCheck(id, observed, expected, scope = "decoded-pixels") {
  return freeze({ id, status: "passed", failureCode: null, scope, observed, expected });
}
function failedCheck(id, failureCode, observed, expected, scope = "decoded-pixels") {
  return freeze({ id, status: "failed", failureCode, scope, observed, expected });
}
function notApplicableCheck(id, reason, scope = "semantic-role") {
  return freeze({ id, status: "not-applicable", failureCode: null, scope, observed: null, expected: reason });
}
function check(id, condition, failureCode, observed, expected, scope) {
  return condition ? passedCheck(id, observed, expected, scope) : failedCheck(id, failureCode, observed, expected, scope);
}
function groundExpectation(role) {
  if (AIRBORNE_BANKS.has(role.bankId) || role.phase === "air") return "airborne";
  if (GROUNDED_PHASES.has(role.phase) || role.bankId === "landing" || role.bankId === "grounded-hold") return "grounded";
  return "not-enforced";
}
function evaluateChecks({ decoded, metrics, policy, order, role, duplicateUnitIds }) {
  const checks = [];
  const expected = policy.candidate;
  checks.push(check(
    "native-png-contract",
    decoded.ihdr.width === expected.width
      && decoded.ihdr.height === expected.height
      && decoded.ihdr.bitDepth === expected.bitDepth
      && decoded.ihdr.colorType === expected.colorType
      && decoded.ihdr.compression === expected.compression
      && decoded.ihdr.filter === expected.filter
      && decoded.ihdr.interlace === expected.interlace,
    "wrong-native-dimensions",
    decoded.ihdr,
    freeze({ width: expected.width, height: expected.height, bitDepth: expected.bitDepth, colorType: expected.colorType, compression: expected.compression, filter: expected.filter, interlace: expected.interlace }),
    "png-structure",
  ));
  checks.push(check(
    "authoring-canvas-contract",
    order.assetContract.authoringCanvas?.width === 640 && order.assetContract.authoringCanvas?.height === 640,
    "wrong-authoring-canvas",
    order.assetContract.authoringCanvas,
    freeze({ width: 640, height: 640 }),
    "immutable-work-order",
  ));
  checks.push(check("opaque-content-minimum", metrics.opaquePixels >= policy.alpha.minimumOpaquePixels, "alpha-contamination", metrics.opaquePixels, `>= ${policy.alpha.minimumOpaquePixels}`));
  checks.push(check("binary-alpha", metrics.semiTransparentPixels === 0, "alpha-contamination", metrics.semiTransparentPixels, 0));
  checks.push(check("transparent-rgb-safety", metrics.unsafeTransparentRgbPixels === 0, "unsafe-transparent-rgb", metrics.unsafeTransparentRgbPixels, 0));
  checks.push(check("alpha-coverage", metrics.alphaCoverageRatio <= policy.alpha.maximumCoverageRatio, "matte-or-checkerboard", metrics.alphaCoverageRatio, `<= ${policy.alpha.maximumCoverageRatio}`));
  checks.push(check("transparent-corners", metrics.cornerAlpha.every((alpha) => alpha === 0), "matte-or-checkerboard", metrics.cornerAlpha, freeze([0, 0, 0, 0])));
  const bounds = metrics.bounds;
  checks.push(check(
    "transparent-crop-margins",
    Boolean(bounds)
      && bounds.topMargin >= policy.geometry.minimumTopMargin
      && bounds.leftMargin >= policy.geometry.minimumLeftMargin
      && bounds.rightMargin >= policy.geometry.minimumRightMargin
      && metrics.belowGroundLinePixels === 0,
    "crop-risk",
    bounds ? freeze({ ...bounds, belowGroundLinePixels: metrics.belowGroundLinePixels }) : null,
    freeze({ minimumTopMargin: policy.geometry.minimumTopMargin, minimumLeftMargin: policy.geometry.minimumLeftMargin, minimumRightMargin: policy.geometry.minimumRightMargin, maximumY: policy.geometry.groundLineY }),
  ));
  checks.push(check("pivot-proximity", metrics.pivotGap !== null && metrics.pivotGap <= policy.geometry.maximumPivotGap, "pivot-drift", metrics.pivotGap, `<= ${policy.geometry.maximumPivotGap}`));
  const ground = groundExpectation(role);
  if (ground === "grounded") {
    const minBottom = policy.geometry.groundLineY - policy.geometry.groundedBottomTolerance;
    checks.push(check("ground-contact", Boolean(bounds) && bounds.maxY >= minBottom && bounds.maxY <= policy.geometry.groundLineY, "ground-contact-drift", bounds?.maxY ?? null, `${minBottom}-${policy.geometry.groundLineY}`));
  } else {
    checks.push(notApplicableCheck("ground-contact", ground === "airborne" ? "airborne role does not require floor contact" : "dynamic role requires later continuity review"));
  }
  checks.push(check("connected-body-cluster", metrics.largestComponentRatio >= policy.cluster.minimumLargestComponentRatio && metrics.tinyComponents <= policy.cluster.maximumTinyComponents, "random-greebles", freeze({ largestComponentRatio: metrics.largestComponentRatio, tinyComponents: metrics.tinyComponents, connectedComponents: metrics.connectedComponents }), freeze({ minimumLargestComponentRatio: policy.cluster.minimumLargestComponentRatio, maximumTinyComponents: policy.cluster.maximumTinyComponents })));
  checks.push(check("palette-complexity", metrics.uniqueOpaqueRgbColors <= policy.palette.maximumOpaqueRgbColors, "palette-contract-drift", metrics.uniqueOpaqueRgbColors, `<= ${policy.palette.maximumOpaqueRgbColors}`));
  checks.push(check("same-content-duplicate", duplicateUnitIds.length === 0, "duplicate-candidate", duplicateUnitIds, freeze([]), "content-address-comparison"));
  return freeze(checks);
}
function deferredChecks(policy) {
  const notes = {
    "continuity-break": ["creative-sequence-review", "Compare previous and next approved cels, body landmarks and hold cadence."],
    "runtime-mirror-failure": ["runtime-stage-validation", "Verify the authored right-facing body after the game runtime mirror path."],
    "weapon-side-drift": ["creative-identity-review", "Compare declared hardpoints and asymmetric weapon side against canonical Frame references."],
    "joint-length-drift": ["creative-identity-review", "Compare limb proportions against construction and landmark authorities."],
    "microdetail-crawl": ["creative-sequence-review", "Compare panel clusters across the coherent animation bank."],
    "effect-hides-unreadable-body": ["creative-stage-composite-review", "Review the physical body separately and in a stage composite with effects still isolated."],
  };
  return freeze(policy.deferredFailureCodes.map((failureCode) => freeze({
    failureCode,
    status: "deferred",
    nextAuthority: notes[failureCode]?.[0] ?? "creative-review",
    reason: notes[failureCode]?.[1] ?? "This failure class cannot be proven from one decoded candidate in isolation.",
  })));
}

export { decodeRgbaPng, deferredChecks, evaluateChecks, groundExpectation, pixelMetrics };
