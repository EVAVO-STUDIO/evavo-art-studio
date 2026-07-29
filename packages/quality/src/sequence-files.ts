import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { analyseSpriteSequence } from "./analyse-sequence.js";
import { decodeSpriteFrame } from "./decode.js";
import {
  SpriteQualityInputError,
  type AnalyseSpriteSequenceFileOptions,
  type DecodedSpriteFrame,
  type SpriteSequenceQualityReport,
} from "./types.js";
import { validateSpriteSequenceManifest } from "./validation.js";

async function assertWithinAllowedRoots(
  candidate: string,
  allowedRoots: readonly string[],
): Promise<string> {
  const resolved = await realpath(candidate);
  if (allowedRoots.length === 0) return resolved;
  const allowed = await Promise.all(
    allowedRoots.map(async (root) => {
      const base = await realpath(root);
      const relative = path.relative(base, resolved);
      return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    }),
  );
  if (!allowed.some(Boolean)) {
    throw new SpriteQualityInputError(
      "SPRITE_SEQUENCE_PATH_OUTSIDE_ALLOWED_ROOTS",
      `Path is outside the configured quality roots: ${candidate}`,
    );
  }
  return resolved;
}

export async function analyseSpriteSequenceManifestFile(
  manifestInputPath: string,
  options: AnalyseSpriteSequenceFileOptions = {},
): Promise<SpriteSequenceQualityReport> {
  const allowedRoots = options.allowedRoots ?? [];
  const manifestPath = await assertWithinAllowedRoots(manifestInputPath, allowedRoots);
  const manifest = validateSpriteSequenceManifest(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
  );
  const manifestDirectory = path.dirname(manifestPath);
  const frames = new Map<string, DecodedSpriteFrame>();
  for (const frame of manifest.frames) {
    const candidate = path.resolve(manifestDirectory, frame.path);
    const safePath = await assertWithinAllowedRoots(candidate, allowedRoots);
    frames.set(frame.id, await decodeSpriteFrame(safePath, options));
  }
  return analyseSpriteSequence(manifest, frames);
}
