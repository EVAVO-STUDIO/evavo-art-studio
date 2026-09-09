import { createHash } from "node:crypto";

import sharp from "sharp";

export type VehicleWheelAnchor = {
  id: string;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  axle: "front" | "rear";
  side: "left" | "right";
};

export type VehicleMotionLayerPacketSpec = {
  view: string;
  drivetrain: "FWD" | "RWD" | "MR" | "AWD";
  anchors: VehicleWheelAnchor[];
  reviewedAnchors: true;
  reviewer: string;
};

export type VehicleMotionLayer = {
  id: string;
  role: "wheel" | "tyre_contact_patch_mask" | "wheel_occlusion_mask";
  buffer: Buffer;
  sha256: string;
  nonTransparentPixels: number;
};

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function validateSpec(width: number, height: number, spec: VehicleMotionLayerPacketSpec): void {
  if (spec.reviewedAnchors !== true || !spec.reviewer.trim()) {
    throw new Error("Vehicle wheel anchors require an explicit reviewer and reviewedAnchors=true.");
  }
  if (!spec.view.trim() || spec.anchors.length === 0) throw new Error("A view and at least one wheel anchor are required.");
  const ids = new Set<string>();
  for (const anchor of spec.anchors) {
    if (!/^[a-z0-9_]+$/.test(anchor.id) || ids.has(anchor.id)) throw new Error(`Invalid or duplicate wheel anchor id ${JSON.stringify(anchor.id)}.`);
    ids.add(anchor.id);
    for (const [label, value] of Object.entries({ x: anchor.x, y: anchor.y, radiusX: anchor.radiusX, radiusY: anchor.radiusY })) {
      if (!Number.isFinite(value)) throw new Error(`${anchor.id}.${label} must be finite.`);
    }
    if (anchor.radiusX < 2 || anchor.radiusY < 2) throw new Error(`${anchor.id} radii must be at least two pixels.`);
    if (anchor.x - anchor.radiusX < 0 || anchor.x + anchor.radiusX >= width || anchor.y - anchor.radiusY < 0 || anchor.y + anchor.radiusY >= height) {
      throw new Error(`${anchor.id} ellipse must remain inside the ${width}x${height} canvas.`);
    }
  }
}

async function encodeRgba(data: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
}

export async function buildVehicleMotionLayerPacket(input: Buffer, spec: VehicleMotionLayerPacketSpec): Promise<{
  width: number;
  height: number;
  inputSha256: string;
  layers: VehicleMotionLayer[];
  evidence: Record<string, unknown>;
}> {
  const decoded = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = decoded.info;
  validateSpec(width, height, spec);
  let sourceAlphaPixels = 0;
  for (let offset = 3; offset < decoded.data.length; offset += 4) if (decoded.data[offset]! > 0) sourceAlphaPixels += 1;
  if (sourceAlphaPixels === 0 || sourceAlphaPixels === width * height) {
    throw new Error("Vehicle source must contain meaningful transparency before motion-layer extraction.");
  }

  const layers: VehicleMotionLayer[] = [];
  for (const anchor of spec.anchors) {
    const wheel = Buffer.alloc(width * height * 4);
    const contact = Buffer.alloc(width * height * 4);
    const occlusion = Buffer.alloc(width * height * 4);
    let wheelPixels = 0;
    let contactPixels = 0;
    let occlusionPixels = 0;
    for (let y = Math.floor(anchor.y - anchor.radiusY); y <= Math.ceil(anchor.y + anchor.radiusY); y += 1) {
      for (let x = Math.floor(anchor.x - anchor.radiusX); x <= Math.ceil(anchor.x + anchor.radiusX); x += 1) {
        const nx = (x - anchor.x) / anchor.radiusX;
        const ny = (y - anchor.y) / anchor.radiusY;
        if (nx * nx + ny * ny > 1) continue;
        const offset = (y * width + x) * 4;
        const alpha = decoded.data[offset + 3]!;
        if (alpha === 0) continue;
        decoded.data.copy(wheel, offset, offset, offset + 4);
        wheelPixels += 1;
        if (ny >= 0.42) {
          contact[offset] = 255; contact[offset + 1] = 255; contact[offset + 2] = 255; contact[offset + 3] = alpha;
          contactPixels += 1;
        }
        if (ny <= 0.18) {
          occlusion[offset] = 255; occlusion[offset + 1] = 255; occlusion[offset + 2] = 255; occlusion[offset + 3] = alpha;
          occlusionPixels += 1;
        }
      }
    }
    if (wheelPixels < 12 || contactPixels < 2 || occlusionPixels < 2) throw new Error(`${anchor.id} does not intersect enough opaque source pixels for a usable packet.`);
    for (const [role, data, count] of [
      ["wheel", wheel, wheelPixels],
      ["tyre_contact_patch_mask", contact, contactPixels],
      ["wheel_occlusion_mask", occlusion, occlusionPixels],
    ] as const) {
      const buffer = await encodeRgba(data, width, height);
      layers.push({ id: `${role}_${anchor.id}`, role, buffer, sha256: sha256(buffer), nonTransparentPixels: count });
    }
  }
  return {
    width,
    height,
    inputSha256: sha256(input),
    layers,
    evidence: {
      schema: "evavo.vehicle-motion-layer-packet.v1",
      view: spec.view,
      drivetrain: spec.drivetrain,
      reviewer: spec.reviewer,
      reviewedAnchors: true,
      sourceAlphaPixels,
      layerCount: layers.length,
      publicationAuthority: false,
      semanticOcclusionApprovalRequired: true,
    },
  };
}
