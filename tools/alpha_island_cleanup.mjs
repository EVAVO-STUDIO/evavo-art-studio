#!/usr/bin/env node
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(new URL("../packages/media/package.json", import.meta.url));
const sharp = require("sharp");

export async function cleanupAlphaIslands({ input, output, alphaThreshold = 8, minimumPixels = 0, clearBottomRows = 0 }) {
  if (!input || !output) throw new Error("input and output are required");
  if (path.resolve(input) === path.resolve(output)) throw new Error("source must remain immutable; output must differ from input");
  if (!Number.isInteger(alphaThreshold) || alphaThreshold < 0 || alphaThreshold > 254 ||
      !Number.isInteger(minimumPixels) || minimumPixels < 0 ||
      !Number.isInteger(clearBottomRows) || clearBottomRows < 0 || clearBottomRows > 16) throw new Error("invalid alpha-island cleanup thresholds");
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;
  const visited = new Uint8Array(pixelCount);
  const components = [];
  const neighbours = [-1, 0, 1];
  for (let seed = 0; seed < pixelCount; seed += 1) {
    if (visited[seed] || data[seed * 4 + 3] <= alphaThreshold) continue;
    const queue = [seed];
    const pixels = [];
    visited[seed] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      pixels.push(current);
      const x = current % info.width;
      const y = Math.floor(current / info.width);
      for (const dy of neighbours) for (const dx of neighbours) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) continue;
        const next = ny * info.width + nx;
        if (!visited[next] && data[next * 4 + 3] > alphaThreshold) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    components.push(pixels);
  }
  components.sort((a, b) => b.length - a.length);
  const retainedMinimum = minimumPixels > 0 ? minimumPixels : (components[0]?.length ?? 0);
  const rejected = components.filter((component) => component.length < retainedMinimum);
  const result = Buffer.from(data);
  let removedPixels = 0;
  for (const component of rejected) for (const pixel of component) {
    result.fill(0, pixel * 4, pixel * 4 + 4);
    removedPixels += 1;
  }
  let clearedEdgePixels = 0;
  for (let y = info.height - clearBottomRows; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const offset = (y * info.width + x) * 4;
    if (result[offset + 3] > 0) clearedEdgePixels += 1;
    result.fill(0, offset, offset + 4);
  }
  await sharp(result, { raw: info }).png().toFile(output);
  return {
    input, output, canvas: [info.width, info.height], alphaThreshold, minimumPixels: retainedMinimum,
    componentCount: components.length, retainedComponents: components.length - rejected.length,
    removedComponents: rejected.length, removedPixels, clearBottomRows, clearedEdgePixels,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const values = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
    return pairs;
  }, []));
  const receipt = await cleanupAlphaIslands({
    input: values.input,
    output: values.output,
    alphaThreshold: values["alpha-threshold"] === undefined ? 8 : Number(values["alpha-threshold"]),
    minimumPixels: values["minimum-pixels"] === undefined ? 0 : Number(values["minimum-pixels"]),
    clearBottomRows: values["clear-bottom-rows"] === undefined ? 0 : Number(values["clear-bottom-rows"]),
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
