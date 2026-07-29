import { greatestCommonDivisorOf } from "./math.js";
import type { PackedAtlasAnimation, SpriteAtlasAnimation } from "./types.js";

export function compileAtlasAnimation(
  animation: SpriteAtlasAnimation,
): PackedAtlasAnimation {
  const durationQuantumMs = greatestCommonDivisorOf(
    animation.frames.map((frame) => frame.durationMs),
  );
  const framesPerSecond = Number((1000 / durationQuantumMs).toFixed(9));
  return {
    name: animation.name,
    loopMode: animation.loopMode,
    framesPerSecond,
    durationQuantumMs,
    totalDurationMs: animation.frames.reduce(
      (total, frame) => total + frame.durationMs,
      0,
    ),
    frames: animation.frames.map((frame) => ({
      frameId: frame.frameId,
      durationMs: frame.durationMs,
      relativeDuration: frame.durationMs / durationQuantumMs,
    })),
  };
}
