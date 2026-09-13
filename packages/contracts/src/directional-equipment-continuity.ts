export const DIRECTIONAL_EQUIPMENT_CONTINUITY_SCHEMA = "evavo.directional-equipment-continuity.v1" as const;

export type EquipmentFace = "outer" | "inner" | "edge" | "occluded";
export type CarryingSide = "left" | "right" | "both" | "not-applicable";

export interface DirectionalEquipmentFrameReview {
  frameId: string;
  sha256: string;
  cameraDirection: string;
  equipmentId: string;
  carryingSide: CarryingSide;
  visibleFace: EquipmentFace;
  attachmentVisible: boolean;
  gripVisible: boolean;
  strapRouting: "consistent" | "not-visible" | "not-applicable";
  shieldPlane: "side-carry" | "guard-forward" | "transition" | "not-applicable";
  occlusion: string;
  reviewer: string;
  reviewedAt: string;
  status: "approved" | "rejected";
  reason?: string;
}

export interface DirectionalEquipmentContinuityContract {
  schema: typeof DIRECTIONAL_EQUIPMENT_CONTINUITY_SCHEMA;
  characterId: string;
  canonicalIdentitySha256: string;
  runtimeAuthority: false;
  frames: DirectionalEquipmentFrameReview[];
}

const SHA256 = /^[a-f0-9]{64}$/;

export function validateDirectionalEquipmentContinuity(
  value: DirectionalEquipmentContinuityContract,
): string[] {
  const issues: string[] = [];
  if (value.schema !== DIRECTIONAL_EQUIPMENT_CONTINUITY_SCHEMA) issues.push("unsupported schema");
  if (!value.characterId.trim()) issues.push("characterId is required");
  if (!SHA256.test(value.canonicalIdentitySha256)) issues.push("canonicalIdentitySha256 must be lowercase SHA-256");
  if (value.runtimeAuthority !== false) issues.push("review evidence cannot grant runtime authority");
  if (!value.frames.length) issues.push("at least one frame review is required");
  const ids = new Set<string>();
  for (const frame of value.frames) {
    if (ids.has(frame.frameId)) issues.push(`duplicate frameId: ${frame.frameId}`);
    ids.add(frame.frameId);
    if (!SHA256.test(frame.sha256)) issues.push(`${frame.frameId}: invalid sha256`);
    if (!frame.cameraDirection.trim()) issues.push(`${frame.frameId}: cameraDirection is required`);
    if (!frame.equipmentId.trim()) issues.push(`${frame.frameId}: equipmentId is required`);
    if (!frame.occlusion.trim()) issues.push(`${frame.frameId}: occlusion declaration is required`);
    if (!frame.reviewer.trim() || !frame.reviewedAt.trim()) issues.push(`${frame.frameId}: named dated review is required`);
    if (frame.status === "rejected" && !frame.reason?.trim()) issues.push(`${frame.frameId}: rejection reason is required`);
    if (frame.shieldPlane === "side-carry" && frame.visibleFace === "inner") {
      if (!frame.attachmentVisible) issues.push(`${frame.frameId}: inner side-carry must show arm attachment`);
      if (!frame.gripVisible) issues.push(`${frame.frameId}: inner side-carry must show the controlling grip`);
      if (frame.strapRouting !== "consistent") issues.push(`${frame.frameId}: inner side-carry must declare consistent strap routing`);
    }
    if (frame.visibleFace === "outer" && frame.strapRouting === "consistent") {
      issues.push(`${frame.frameId}: outward face cannot expose inner strap routing`);
    }
  }
  return issues;
}

export function assertDirectionalEquipmentContinuity(value: DirectionalEquipmentContinuityContract): void {
  const issues = validateDirectionalEquipmentContinuity(value);
  if (issues.length) throw new Error(`Directional equipment continuity failed:\n- ${issues.join("\n- ")}`);
}
