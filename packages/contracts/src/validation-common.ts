import type { AssetKind } from "./constants.js";

export type ValidationIssue = Readonly<{
  readonly path: string;
  readonly message: string;
}>;

export type ValidationResult<T> =
  | Readonly<{ readonly success: true; readonly value: T }>
  | Readonly<{ readonly success: false; readonly issues: readonly ValidationIssue[] }>;

export const SPRITE_ASSET_KINDS = new Set<AssetKind>([
  "character",
  "animation",
  "sprite-sheet",
  "particle",
]);

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const isFinitePositiveNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value > 0;

export const isFinitePositiveInteger = (value: unknown): value is number =>
  isFinitePositiveNumber(value) && Number.isInteger(value);

export const isNonNegativeInteger = (value: unknown): value is number =>
  isFiniteNumber(value) && Number.isInteger(value) && value >= 0;

export const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isNonEmptyString);

export const inUnitInterval = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0 && value <= 1;

export function issue(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

export function validateAnimation(
  animation: Record<string, unknown>,
  base: string,
  issues: ValidationIssue[],
): void {
  if (!isNonEmptyString(animation.name)) issue(issues, `${base}.name`, "name is required.");
  if (!isFinitePositiveInteger(animation.frameCount)) {
    issue(issues, `${base}.frameCount`, "frameCount must be a positive integer.");
  }
  if (!isFinitePositiveNumber(animation.framesPerSecond)) {
    issue(issues, `${base}.framesPerSecond`, "framesPerSecond must be greater than zero.");
  }
  if (typeof animation.loop !== "boolean") issue(issues, `${base}.loop`, "loop must be boolean.");

  if (animation.loopMode !== undefined && !["none", "linear", "ping-pong"].includes(String(animation.loopMode))) {
    issue(issues, `${base}.loopMode`, "loopMode must be none, linear or ping-pong.");
  }
  if (animation.directions !== undefined && !isFinitePositiveInteger(animation.directions)) {
    issue(issues, `${base}.directions`, "directions must be a positive integer.");
  }
  if (animation.directionNames !== undefined) {
    if (!isStringArray(animation.directionNames)) {
      issue(issues, `${base}.directionNames`, "directionNames must be a string array.");
    } else if (
      isFinitePositiveInteger(animation.directions) &&
      animation.directionNames.length !== animation.directions
    ) {
      issue(issues, `${base}.directionNames`, "directionNames length must equal directions.");
    }
  }
  if (animation.pivot !== undefined) {
    if (!isRecord(animation.pivot) || !isFiniteNumber(animation.pivot.x) || !isFiniteNumber(animation.pivot.y)) {
      issue(issues, `${base}.pivot`, "pivot must contain finite x and y values.");
    }
  }
  if (animation.baseline !== undefined && !isFiniteNumber(animation.baseline)) {
    issue(issues, `${base}.baseline`, "baseline must be finite.");
  }
  if (animation.frameDurationsMs !== undefined) {
    if (!Array.isArray(animation.frameDurationsMs) || !animation.frameDurationsMs.every(isFinitePositiveInteger)) {
      issue(issues, `${base}.frameDurationsMs`, "frameDurationsMs must contain positive integer milliseconds.");
    } else if (
      isFinitePositiveInteger(animation.frameCount) &&
      animation.frameDurationsMs.length !== animation.frameCount
    ) {
      issue(issues, `${base}.frameDurationsMs`, "frameDurationsMs length must equal frameCount.");
    }
  }
  if (animation.keyPoseFrames !== undefined) {
    if (!Array.isArray(animation.keyPoseFrames) || !animation.keyPoseFrames.every(isNonNegativeInteger)) {
      issue(issues, `${base}.keyPoseFrames`, "keyPoseFrames must contain zero-based integer frame indices.");
    } else if (isFinitePositiveInteger(animation.frameCount)) {
      const seen = new Set<number>();
      const frameCount = animation.frameCount;
      const keyPoseFrames = animation.keyPoseFrames as number[];
      keyPoseFrames.forEach((frame, index) => {
        if (frame >= frameCount) {
          issue(issues, `${base}.keyPoseFrames[${index}]`, "Key-pose frame is outside frameCount.");
        }
        if (seen.has(frame)) {
          issue(issues, `${base}.keyPoseFrames[${index}]`, "Key-pose frame indices must be unique.");
        }
        seen.add(frame);
      });
    }
  }
  if (animation.frameOrder !== undefined && !["direction-major", "frame-major"].includes(String(animation.frameOrder))) {
    issue(issues, `${base}.frameOrder`, "frameOrder must be direction-major or frame-major.");
  }
  if (animation.motionNotes !== undefined && !isStringArray(animation.motionNotes)) {
    issue(issues, `${base}.motionNotes`, "motionNotes must be a string array.");
  }
}
