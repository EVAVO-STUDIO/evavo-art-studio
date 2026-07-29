import type { SpriteDuplicateGroup, SpriteFrameQualityReport, SpriteQualityGateResult, SpriteSequenceManifest } from "./types.js";

export function sequenceGate(
  id: string,
  status: SpriteQualityGateResult["status"],
  blocking: boolean,
  message: string,
  evidence: Readonly<Record<string, unknown>>,
  value?: number | string | boolean,
  threshold?: number | string | boolean,
): SpriteQualityGateResult {
  return {
    id,
    status,
    blocking,
    message,
    ...(value === undefined ? {} : { value }),
    ...(threshold === undefined ? {} : { threshold }),
    evidence,
  };
}

export function samePoint(
  left: Readonly<{ x: number; y: number }>,
  right: Readonly<{ x: number; y: number }>,
): boolean {
  return left.x === right.x && left.y === right.y;
}

export function frameOrderEvidence(manifest: SpriteSequenceManifest): Readonly<{
  globalOrderValid: boolean;
  directionOrderValid: boolean;
  globalIndices: readonly number[];
  directionIndices: Readonly<Record<string, readonly number[]>>;
}> {
  const globalIndices = manifest.frames.map((frame) => frame.globalFrameIndex);
  const globalOrderValid = globalIndices.every((entry, index) => entry === index);
  const byDirection = new Map<string, number[]>();
  for (const frame of manifest.frames) {
    const direction = frame.direction ?? "default";
    const entries = byDirection.get(direction) ?? [];
    entries.push(frame.frameIndex);
    byDirection.set(direction, entries);
  }
  const directionIndices = Object.fromEntries(
    [...byDirection.entries()].map(([direction, indices]) => [direction, indices] as const),
  );
  const directionOrderValid = [...byDirection.values()].every((indices) =>
    indices.every((entry, index) => entry === index),
  );
  return { globalOrderValid, directionOrderValid, globalIndices, directionIndices };
}

export function duplicateEvidence(
  manifest: SpriteSequenceManifest,
  reports: readonly SpriteFrameQualityReport[],
): readonly SpriteDuplicateGroup[] {
  const hashes = new Map<string, string[]>();
  reports.forEach((report) => {
    const entries = hashes.get(report.rawRgbaSha256) ?? [];
    entries.push(report.frameId);
    hashes.set(report.rawRgbaSha256, entries);
  });
  const specs = new Map(manifest.frames.map((frame) => [frame.id, frame] as const));
  return [...hashes.entries()]
    .filter(([, frameIds]) => frameIds.length > 1)
    .map(([hash, frameIds]) => {
      const group = new Set(frameIds);
      const declared = frameIds.slice(1).every((frameId) => {
        const declaration = specs.get(frameId)?.intentionalDuplicateOf;
        return declaration !== undefined && group.has(declaration);
      });
      return { hash, frameIds, declared };
    });
}
