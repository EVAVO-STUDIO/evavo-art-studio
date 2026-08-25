import { createHash } from "node:crypto";
import sharp from "sharp";

export const POSE_CONTROL_RENDER_VERSION = "2026-08-26.1" as const;
export const POSE_CONTROL_RENDER_KIND = "evavo.animation.pose-control-render" as const;

interface PoseControlManifestLike {
  readonly kind: "evavo.animation.pose-control";
  readonly version: "2026-08-26.1";
  readonly clipId: string;
  readonly frameId: string;
  readonly frameNumber: number;
  readonly canvas: Readonly<{ width: number; height: number }>;
  readonly coordinateSpace: "normalized-0-1";
  readonly landmarks: Readonly<Record<string, Readonly<{ x: number; y: number; confidence: number }>>>;
  readonly requiredLandmarkIds: readonly string[];
  readonly source: Readonly<Record<string, unknown>>;
  readonly manifestSha256: string;
  readonly authority: Readonly<Record<string, false>>;
}

export interface PoseControlRenderResult {
  readonly kind: typeof POSE_CONTROL_RENDER_KIND;
  readonly version: typeof POSE_CONTROL_RENDER_VERSION;
  readonly poseControlManifestSha256: string;
  readonly clipId: string;
  readonly frameId: string;
  readonly frameNumber: number;
  readonly width: number;
  readonly height: number;
  readonly mediaType: "image/png";
  readonly bytes: Uint8Array;
  readonly contentSha256: string;
  readonly renderer: Readonly<{
    id: "evavo-structural-pose-svg-sharp";
    version: typeof POSE_CONTROL_RENDER_VERSION;
  }>;
  readonly authority: Readonly<{
    creativeApproval: false;
    artifactPromotion: false;
    repositoryMutation: false;
    publication: false;
  }>;
}

const SHA256 = /^[a-f0-9]{64}$/;
const CONNECTIONS: readonly (readonly [string, string])[] = [
  ["head", "neck"],
  ["neck", "leftShoulder"],
  ["neck", "rightShoulder"],
  ["leftShoulder", "leftElbow"],
  ["leftElbow", "leftHand"],
  ["rightShoulder", "rightElbow"],
  ["rightElbow", "rightHand"],
  ["neck", "root"],
  ["root", "leftHip"],
  ["root", "rightHip"],
  ["leftHip", "leftKnee"],
  ["leftKnee", "leftFoot"],
  ["rightHip", "rightKnee"],
  ["rightKnee", "rightFoot"],
] as const;

function fail(message: string): never {
  throw new Error(`Pose-control render failed: ${message}`);
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function verifyManifest(input: unknown): PoseControlManifestLike {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("manifest must be an object.");
  const manifest = input as PoseControlManifestLike;
  if (
    manifest.kind !== "evavo.animation.pose-control" ||
    manifest.version !== "2026-08-26.1" ||
    manifest.coordinateSpace !== "normalized-0-1" ||
    typeof manifest.manifestSha256 !== "string" ||
    !SHA256.test(manifest.manifestSha256)
  ) {
    fail("manifest kind/version/hash/coordinate space is unsupported.");
  }
  if (
    !manifest.canvas ||
    !Number.isInteger(manifest.canvas.width) ||
    !Number.isInteger(manifest.canvas.height) ||
    manifest.canvas.width < 1 ||
    manifest.canvas.height < 1 ||
    manifest.canvas.width > 8192 ||
    manifest.canvas.height > 8192
  ) {
    fail("manifest canvas is invalid.");
  }
  if (!manifest.landmarks || typeof manifest.landmarks !== "object") fail("manifest landmarks are missing.");
  for (const [id, point] of Object.entries(manifest.landmarks)) {
    if (!id || !point || typeof point !== "object") fail("manifest contains an invalid landmark.");
    for (const [field, value] of [["x", point.x], ["y", point.y], ["confidence", point.confidence]] as const) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
        fail(`landmark ${id}.${field} must be normalized from 0 to 1.`);
      }
    }
  }
  const body = {
    kind: manifest.kind,
    version: manifest.version,
    clipId: manifest.clipId,
    frameId: manifest.frameId,
    frameNumber: manifest.frameNumber,
    canvas: manifest.canvas,
    coordinateSpace: manifest.coordinateSpace,
    landmarks: manifest.landmarks,
    requiredLandmarkIds: manifest.requiredLandmarkIds,
    source: manifest.source,
    authority: manifest.authority,
  };
  if (digest(body) !== manifest.manifestSha256) fail("manifest SHA-256 does not match canonical semantic pose content.");
  return manifest;
}

export async function renderAnimationPoseControlPng(
  input: unknown,
): Promise<PoseControlRenderResult> {
  const manifest = verifyManifest(input);
  const width = manifest.canvas.width;
  const height = manifest.canvas.height;
  const stroke = Math.max(1, Math.round(Math.min(width, height) / 96));
  const radius = Math.max(2, stroke * 2);

  const point = (id: string) => {
    const value = manifest.landmarks[id];
    return value
      ? { x: value.x * (width - 1), y: value.y * (height - 1), confidence: value.confidence }
      : undefined;
  };

  const lines = CONNECTIONS.flatMap(([fromId, toId]) => {
    const from = point(fromId);
    const to = point(toId);
    if (!from || !to) return [];
    const opacity = Math.max(0.25, Math.min(from.confidence, to.confidence));
    return [
      `<line x1="${from.x.toFixed(3)}" y1="${from.y.toFixed(3)}" x2="${to.x.toFixed(3)}" y2="${to.y.toFixed(3)}" stroke="#ffffff" stroke-opacity="${opacity.toFixed(3)}" stroke-width="${stroke}" stroke-linecap="round"/>`,
    ];
  });
  const joints = Object.entries(manifest.landmarks)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, value]) => {
      const x = value.x * (width - 1);
      const y = value.y * (height - 1);
      return `<circle cx="${x.toFixed(3)}" cy="${y.toFixed(3)}" r="${radius}" fill="#ffffff" fill-opacity="${Math.max(0.25, value.confidence).toFixed(3)}"><title>${escapeXml(id)}</title></circle>`;
    });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#000000"/>${lines.join("")}${joints.join("")}</svg>`;
  const buffer = await sharp(Buffer.from(svg, "utf8"), { density: 72 })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  const bytes = new Uint8Array(buffer);
  const contentSha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    kind: POSE_CONTROL_RENDER_KIND,
    version: POSE_CONTROL_RENDER_VERSION,
    poseControlManifestSha256: manifest.manifestSha256,
    clipId: manifest.clipId,
    frameId: manifest.frameId,
    frameNumber: manifest.frameNumber,
    width,
    height,
    mediaType: "image/png",
    bytes,
    contentSha256,
    renderer: {
      id: "evavo-structural-pose-svg-sharp",
      version: POSE_CONTROL_RENDER_VERSION,
    },
    authority: {
      creativeApproval: false,
      artifactPromotion: false,
      repositoryMutation: false,
      publication: false,
    },
  };
}
