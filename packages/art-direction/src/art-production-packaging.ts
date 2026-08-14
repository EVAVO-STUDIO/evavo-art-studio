import {
  fail,
  freeze,
  idValue,
  integerValue,
  record,
  sha256,
  stringValue,
} from "./layered-production-internal.js";
import type {
  CompiledLayeredProductionPlan,
  CompiledLayeredProductionUnit,
} from "./layered-production-types.js";
import {
  ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
  ART_PRODUCTION_PACKAGING_PLAN_KIND,
} from "./art-production-orchestrator-types.js";
import type {
  ArtProductionHumanApprovalInput,
  ArtProductionLoop,
  ArtProductionPackagingPlan,
} from "./art-production-orchestrator-types.js";
import { verifyArtProductionLoop } from "./art-production-loop.js";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const ARTIFACT_ID_PATTERN = /^artifact_[0-9a-f]{64}$/u;

function sha256Value(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail("ART_PRODUCTION_PACKAGING_INVALID", `${label} must be lowercase SHA-256.`);
  }
  return value;
}

function canonicalUtc(value: unknown, label: string): string {
  const output = stringValue(value, label, 64);
  const parsed = new Date(output);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== output) {
    fail(
      "ART_PRODUCTION_PACKAGING_INVALID",
      `${label} must be canonical UTC ISO-8601.`,
    );
  }
  return output;
}

function normalizeApprovals(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  value: unknown,
): readonly ArtProductionHumanApprovalInput[] {
  if (!Array.isArray(value) || value.length !== loop.unitStates.length) {
    fail(
      "ART_PRODUCTION_PACKAGING_INVALID",
      "Human approvals must cover every full-production source unit exactly once.",
    );
  }
  const seen = new Set<string>();
  const output = value.map((entryValue, index) => {
    const entry = record(entryValue, `approvals[${index}]`);
    const allowed = [
      "unitId",
      "sourceArtifactId",
      "sourceSha256",
      "sourceBytes",
      "reviewer",
      "reviewedAt",
      "approvalReceiptSha256",
    ];
    const unknown = Object.keys(entry).filter((key) => !allowed.includes(key));
    if (unknown.length > 0 || allowed.some((key) => !Object.hasOwn(entry, key))) {
      fail(
        "ART_PRODUCTION_PACKAGING_INVALID",
        `approvals[${index}] fields are incomplete or unsupported.`,
      );
    }
    const unitId = idValue(entry.unitId, `approvals[${index}].unitId`);
    if (seen.has(unitId)) {
      fail(
        "ART_PRODUCTION_PACKAGING_INVALID",
        `Human approval duplicates unit ${unitId}.`,
      );
    }
    seen.add(unitId);
    const state = loop.unitStates.find((candidate) => candidate.unitId === unitId);
    const unit = plan.layers
      .flatMap((layer) => layer.units)
      .find((candidate) => candidate.id === unitId);
    if (!state?.acceptedCandidate || state.status !== "review-passed" || !unit) {
      fail(
        "ART_PRODUCTION_PACKAGING_INVALID",
        `Human approval references source unit ${unitId} without a technical review pass.`,
      );
    }
    const sourceSha256 = sha256Value(
      entry.sourceSha256,
      `approvals[${index}].sourceSha256`,
    );
    const sourceArtifactId = entry.sourceArtifactId;
    if (
      typeof sourceArtifactId !== "string" ||
      !ARTIFACT_ID_PATTERN.test(sourceArtifactId) ||
      sourceArtifactId !== `artifact_${sourceSha256}`
    ) {
      fail(
        "ART_PRODUCTION_PACKAGING_INVALID",
        `approvals[${index}].sourceArtifactId is invalid.`,
      );
    }
    if (
      sourceArtifactId !== state.acceptedCandidate.artifactId ||
      sourceSha256 !== state.acceptedCandidate.sha256 ||
      entry.sourceBytes !== state.acceptedCandidate.bytes
    ) {
      fail(
        "ART_PRODUCTION_PACKAGING_INVALID",
        `Human approval for ${unitId} is not bound to the exact review-passed source candidate.`,
      );
    }
    return freeze({
      unitId,
      sourceArtifactId,
      sourceSha256,
      sourceBytes: integerValue(
        entry.sourceBytes,
        `approvals[${index}].sourceBytes`,
        1,
        256 * 1024 * 1024,
      ),
      reviewer: stringValue(entry.reviewer, `approvals[${index}].reviewer`, 300),
      reviewedAt: canonicalUtc(
        entry.reviewedAt,
        `approvals[${index}].reviewedAt`,
      ),
      approvalReceiptSha256: sha256Value(
        entry.approvalReceiptSha256,
        `approvals[${index}].approvalReceiptSha256`,
      ),
    });
  });
  for (const state of loop.unitStates) {
    if (!seen.has(state.unitId)) {
      fail(
        "ART_PRODUCTION_PACKAGING_INVALID",
        `Human approvals are missing source unit ${state.unitId}.`,
      );
    }
  }
  return freeze(
    [...output].sort((left, right) => {
      const leftSequence =
        loop.unitStates.find((state) => state.unitId === left.unitId)?.sequence ?? 0;
      const rightSequence =
        loop.unitStates.find((state) => state.unitId === right.unitId)?.sequence ?? 0;
      return leftSequence - rightSequence || left.unitId.localeCompare(right.unitId);
    }),
  );
}

function animationGroups(
  plan: CompiledLayeredProductionPlan,
): readonly Readonly<{
  familyId: string;
  clipId: string;
  units: readonly CompiledLayeredProductionUnit[];
}>[] {
  const groups = new Map<string, CompiledLayeredProductionUnit[]>();
  for (const unit of plan.layers.flatMap((layer) => layer.units)) {
    if (unit.kind !== "animation-frame" || !unit.frame) continue;
    const key = `${unit.continuityKey}\0${unit.frame.clipId}`;
    const group = groups.get(key) ?? [];
    group.push(unit);
    groups.set(key, group);
  }
  return freeze(
    [...groups.entries()]
      .map(([key, units]) => {
        const [familyId = "unknown", clipId = "unknown"] = key.split("\0");
        const ordered = [...units].sort(
          (left, right) =>
            (left.frame?.frameNumber ?? 0) -
              (right.frame?.frameNumber ?? 0) ||
            left.id.localeCompare(right.id),
        );
        const expectedCount = ordered[0]?.frame?.frameCount ?? 0;
        if (
          expectedCount < 1 ||
          ordered.length !== expectedCount ||
          ordered.some(
            (unit, index) =>
              unit.frame?.frameCount !== expectedCount ||
              unit.frame.frameNumber !== index + 1,
          )
        ) {
          fail(
            "ART_PRODUCTION_PACKAGING_GATED",
            `Animation family ${familyId}/${clipId} is incomplete or out of canonical frame order.`,
          );
        }
        return freeze({
          familyId,
          clipId,
          units: freeze(ordered),
        });
      })
      .sort(
        (left, right) =>
          left.familyId.localeCompare(right.familyId) ||
          left.clipId.localeCompare(right.clipId),
      ),
  );
}

function horizontalStrip(
  familyId: string,
  clipId: string,
  units: readonly CompiledLayeredProductionUnit[],
): ArtProductionPackagingPlan["animationSheets"][number] {
  let x = 0;
  const height = Math.max(...units.map((unit) => unit.dimensions.height));
  const frames = units.map((unit) => {
    const frame = freeze({
      unitId: unit.id,
      frameNumber: unit.frame?.frameNumber ?? 0,
      x,
      y: 0,
      width: unit.dimensions.width,
      height: unit.dimensions.height,
      ...(unit.pivot ? { pivot: unit.pivot } : {}),
      ...(unit.ySortOrigin ? { ySortOrigin: unit.ySortOrigin } : {}),
    });
    x += unit.dimensions.width;
    return frame;
  });
  return freeze({
    familyId,
    clipId,
    layout: "horizontal-strip" as const,
    width: x,
    height,
    columns: units.length,
    rows: 1,
    frames: freeze(frames),
  });
}

function fixedGrid(
  familyId: string,
  clipId: string,
  units: readonly CompiledLayeredProductionUnit[],
  columns: number,
): ArtProductionPackagingPlan["animationSheets"][number] {
  const cellWidth = Math.max(...units.map((unit) => unit.dimensions.width));
  const cellHeight = Math.max(...units.map((unit) => unit.dimensions.height));
  const rows = Math.ceil(units.length / columns);
  const frames = units.map((unit, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return freeze({
      unitId: unit.id,
      frameNumber: unit.frame?.frameNumber ?? 0,
      x: column * cellWidth,
      y: row * cellHeight,
      width: unit.dimensions.width,
      height: unit.dimensions.height,
      ...(unit.pivot ? { pivot: unit.pivot } : {}),
      ...(unit.ySortOrigin ? { ySortOrigin: unit.ySortOrigin } : {}),
    });
  });
  return freeze({
    familyId,
    clipId,
    layout: "fixed-grid" as const,
    width: columns * cellWidth,
    height: rows * cellHeight,
    columns,
    rows,
    frames: freeze(frames),
  });
}

function atlasPages(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
): ArtProductionPackagingPlan["atlasPages"] {
  if (!loop.profile.packaging.outputs.includes("atlas")) return freeze([]);
  const { maximumWidth, maximumHeight, padding } = loop.profile.packaging.atlas;
  const units = [...plan.layers.flatMap((layer) => layer.units)].sort(
    (left, right) =>
      right.dimensions.height - left.dimensions.height ||
      right.dimensions.width - left.dimensions.width ||
      left.id.localeCompare(right.id),
  );
  type MutablePage = {
    page: number;
    x: number;
    y: number;
    rowHeight: number;
    placements: Array<{
      unitId: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
  };
  const pages: MutablePage[] = [];
  let current: MutablePage | undefined;
  const createPage = (): MutablePage => {
    const page: MutablePage = {
      page: pages.length + 1,
      x: padding,
      y: padding,
      rowHeight: 0,
      placements: [],
    };
    pages.push(page);
    return page;
  };
  for (const unit of units) {
    if (
      unit.dimensions.width + padding * 2 > maximumWidth ||
      unit.dimensions.height + padding * 2 > maximumHeight
    ) {
      fail(
        "ART_PRODUCTION_PACKAGING_INVALID",
        `Source unit ${unit.id} cannot fit the configured atlas page without trimming or rotation.`,
      );
    }
    current ??= createPage();
    if (current.x + unit.dimensions.width + padding > maximumWidth) {
      current.x = padding;
      current.y += current.rowHeight + padding;
      current.rowHeight = 0;
    }
    if (current.y + unit.dimensions.height + padding > maximumHeight) {
      current = createPage();
    }
    current.placements.push({
      unitId: unit.id,
      x: current.x,
      y: current.y,
      width: unit.dimensions.width,
      height: unit.dimensions.height,
    });
    current.x += unit.dimensions.width + padding;
    current.rowHeight = Math.max(current.rowHeight, unit.dimensions.height);
  }
  return freeze(
    pages.map((page) =>
      freeze({
        page: page.page,
        width: maximumWidth,
        height: maximumHeight,
        padding,
        rotation: false as const,
        trim: false as const,
        placements: freeze(
          [...page.placements].sort((left, right) =>
            left.unitId.localeCompare(right.unitId),
          ),
        ),
      }),
    ),
  );
}

export function compileArtProductionPackagingPlan(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  approvalsInput: readonly ArtProductionHumanApprovalInput[] | unknown,
): ArtProductionPackagingPlan {
  verifyArtProductionLoop(plan, loop);
  if (loop.scope !== "full-production") {
    fail(
      "ART_PRODUCTION_PACKAGING_GATED",
      "Runtime packaging requires an approved style proof and a full-production loop.",
    );
  }
  if (
    loop.totals.blocked > 0 ||
    loop.totals.reviewPassed !== loop.unitStates.length
  ) {
    fail(
      "ART_PRODUCTION_PACKAGING_GATED",
      "Every source unit must pass deterministic technical review before human-approved packaging can be planned.",
    );
  }
  const approvals = normalizeApprovals(plan, loop, approvalsInput);
  const approvalByUnit = new Map(
    approvals.map((approval) => [approval.unitId, approval]),
  );
  const individualSources = freeze(
    plan.layers
      .flatMap((layer) => layer.units)
      .map((unit) => {
        const approval = approvalByUnit.get(unit.id);
        if (!approval) {
          fail(
            "ART_PRODUCTION_PACKAGING_INVALID",
            `Missing human approval for source unit ${unit.id}.`,
          );
        }
        return freeze({
          unitId: unit.id,
          artifactId: approval.sourceArtifactId,
          sha256: approval.sourceSha256,
          bytes: approval.sourceBytes,
          width: unit.dimensions.width,
          height: unit.dimensions.height,
          targetPath: unit.targetPath,
          approvalReceiptSha256: approval.approvalReceiptSha256,
        });
      }),
  );
  const sheets: ArtProductionPackagingPlan["animationSheets"][number][] = [];
  for (const group of animationGroups(plan)) {
    if (loop.profile.packaging.outputs.includes("animation-strip")) {
      sheets.push(horizontalStrip(group.familyId, group.clipId, group.units));
    }
    if (loop.profile.packaging.outputs.includes("animation-grid")) {
      sheets.push(
        fixedGrid(
          group.familyId,
          group.clipId,
          group.units,
          loop.profile.packaging.gridColumns,
        ),
      );
    }
  }
  const partial = {
    schemaVersion: "1.0" as const,
    kind: ART_PRODUCTION_PACKAGING_PLAN_KIND,
    protocolVersion: ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
    planId: plan.planId,
    planSha256: plan.planSha256,
    loopSha256: loop.loopSha256,
    profileSha256: loop.profileSha256,
    individualSources,
    animationSheets: freeze(sheets),
    atlasPages: atlasPages(plan, loop),
    authority: freeze({
      imageMutation: false as const,
      packagingExecution: false as const,
      creativeApproval: false as const,
      targetRepositoryMutation: false as const,
      gitCommit: false as const,
      gitPush: false as const,
      publication: false as const,
    }),
  };
  return freeze({ ...partial, packagingSha256: sha256(partial) });
}

export function verifyArtProductionPackagingPlan(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  approvals: readonly ArtProductionHumanApprovalInput[] | unknown,
  packagingPlan: ArtProductionPackagingPlan,
): true {
  const expected = compileArtProductionPackagingPlan(plan, loop, approvals);
  if (expected.packagingSha256 !== packagingPlan.packagingSha256) {
    fail(
      "ART_PRODUCTION_PACKAGING_INVALID",
      "Packaging plan is not the deterministic compilation of its plan, loop and human approvals.",
    );
  }
  return true;
}
