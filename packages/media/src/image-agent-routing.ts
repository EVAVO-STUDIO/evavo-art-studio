export const IMAGE_AGENT_ROUTE_CONTRACT = "evavo.image-agent-route.v1" as const;

export type ImageAgentGoal =
  | "quality-review"
  | "frame-consistency"
  | "fake-transparency"
  | "natural-background-cutout"
  | "local-technical-repair"
  | "semantic-repair"
  | "resize-or-export"
  | "learned-enhancement-review"
  | "texture-review"
  | "runtime-effect"
  | "raster-effect"
  | "ai-artifact-assessment"
  | "finalize-image";

export type ImageAgentWriteClass =
  | "read-only"
  | "write-gated-create-only"
  | "candidate-and-mask-required"
  | "provider-or-human-candidate-required";

export interface ImageAgentRoute {
  readonly contract: typeof IMAGE_AGENT_ROUTE_CONTRACT;
  readonly goal: ImageAgentGoal;
  readonly primarySurface: string;
  readonly orderedTools: readonly string[];
  readonly writeClass: ImageAgentWriteClass;
  readonly prerequisites: readonly string[];
  readonly stopConditions: readonly string[];
  readonly evidenceExpected: readonly string[];
  readonly notes: readonly string[];
}

const ROUTES: Readonly<Record<ImageAgentGoal, Omit<ImageAgentRoute, "contract" | "goal">>> = Object.freeze({
  "quality-review": Object.freeze({
    primarySurface: "evavo-image-finishing-artist",
    orderedTools: Object.freeze(["evavo_review_image_for_finishing"]),
    writeClass: "read-only",
    prerequisites: Object.freeze(["local image path beneath EVAVO_IMAGE_REVIEW_ALLOWED_ROOTS"]),
    stopConditions: Object.freeze(["technical blockers", "manual-review finishing route", "semantic/identity uncertainty"]),
    evidenceExpected: Object.freeze(["quality metrics", "defect regions", "artifact signals", "finishing plan", "visual checklist"]),
    notes: Object.freeze(["Use this before changing an image when the defect is not already known."]),
  }),
  "frame-consistency": Object.freeze({
    primarySurface: "evavo-image-finishing-artist",
    orderedTools: Object.freeze(["evavo_review_image_set_consistency", "quality-sequence"]),
    writeClass: "read-only",
    prerequisites: Object.freeze(["2-128 related frames/images", "correct intended role/profile when known"]),
    stopConditions: Object.freeze(["canvas/aspect mismatch", "alpha-state mismatch", "high-priority continuity outliers", "identity/style uncertainty"]),
    evidenceExpected: Object.freeze(["median technical baseline", "ranked outliers", "sequence timing/pivot/baseline evidence when manifest exists"]),
    notes: Object.freeze(["Technical continuity does not replace visual identity, anatomy, pose arc or art-direction review."]),
  }),
  "fake-transparency": Object.freeze({
    primarySurface: "evavo-raster-finishing",
    orderedTools: Object.freeze(["evavo_master_transparent_asset", "evavo_create_transparency_proof", "evavo_review_image_for_finishing"]),
    writeClass: "write-gated-create-only",
    prerequisites: Object.freeze(["source is native-alpha, painted checkerboard, declared matte or confidently recoverable border-connected matte"]),
    stopConditions: Object.freeze(["ambiguous natural background", "missing thin parts after recovery", "failed hostile-background proof"]),
    evidenceExpected: Object.freeze(["alpha recovery strategy", "real-alpha admission", "hostile-background proof", "unapproved receipt"]),
    notes: Object.freeze(["Do not treat a painted checkerboard as real transparency."]),
  }),
  "natural-background-cutout": Object.freeze({
    primarySurface: "evavo-raster-finishing",
    orderedTools: Object.freeze(["approved segmentation/provider mask", "evavo_finish_raster_asset", "evavo_create_transparency_proof", "evavo_review_image_for_finishing"]),
    writeClass: "provider-or-human-candidate-required",
    prerequisites: Object.freeze(["same-size reviewed alpha/segmentation mask from an approved provider or artist"]),
    stopConditions: Object.freeze(["ambiguous subject boundary", "hair/glass/thin-part loss", "mask not reviewed", "edge contamination regression"]),
    evidenceExpected: Object.freeze(["mask lineage", "alpha proof", "post-cutout quality review"]),
    notes: Object.freeze(["Natural-background removal must not be approximated with chroma-key heuristics when segmentation is ambiguous."]),
  }),
  "local-technical-repair": Object.freeze({
    primarySurface: "evavo-image-repair",
    orderedTools: Object.freeze(["evavo_plan_image_repair", "evavo_apply_preservation_image_repair", "evavo_apply_masked_candidate_image_repair"]),
    writeClass: "write-gated-create-only",
    prerequisites: Object.freeze(["fresh deterministic review", "explicit mask/candidate when route is localized"]),
    stopConditions: Object.freeze(["blur/invented-detail risk", "repair exceeds mask budget", "post-edit regression", "semantic defect"]),
    evidenceExpected: Object.freeze(["repair decision", "difference proof", "post-edit review", "unapproved receipt"]),
    notes: Object.freeze(["Preservation polish is the only direct deterministic auto-repair admission; other changes remain bounded by mask/candidate evidence."]),
  }),
  "semantic-repair": Object.freeze({
    primarySurface: "evavo-image-repair",
    orderedTools: Object.freeze(["evavo_plan_image_repair", "governed provider edit/inpaint", "evavo_apply_masked_candidate_image_repair", "evavo_review_image_for_finishing"]),
    writeClass: "provider-or-human-candidate-required",
    prerequisites: Object.freeze(["explicit visual finding", "reviewed edit mask", "identity/style/content reference when required"]),
    stopConditions: Object.freeze(["candidate changes outside mask", "identity/style still wrong", "post-edit technical regression"]),
    evidenceExpected: Object.freeze(["visual finding", "candidate/mask/reference lineage", "outside-mask preservation", "post-edit review"]),
    notes: Object.freeze(["Broken anatomy, malformed text, identity drift and wrong content are semantic defects, not sharpening/filter problems."]),
  }),
  "resize-or-export": Object.freeze({
    primarySurface: "evavo-raster-finishing",
    orderedTools: Object.freeze(["evavo_finish_raster_asset", "evavo_review_image_for_finishing"]),
    writeClass: "write-gated-create-only",
    prerequisites: Object.freeze(["declared target size/format", "pixel-art vs continuous-tone sampling choice"]),
    stopConditions: Object.freeze(["upscale would invent detail", "alpha/edge regression", "target format conflicts with transparency"]),
    evidenceExpected: Object.freeze(["finishing evidence", "output dimensions/format", "post-export review"]),
    notes: Object.freeze(["Prefer source reacquisition or governed learned enhancement when the requested size materially exceeds available source detail."]),
  }),
  "learned-enhancement-review": Object.freeze({
    primarySurface: "Enhancement Studio + Art Studio review session",
    orderedTools: Object.freeze(["evavo_create_image_review_session", "reviewEnhancementStudioCandidate", "evavo_verify_image_review_session"]),
    writeClass: "read-only",
    prerequisites: Object.freeze(["immutable source bytes", "candidate bytes", "current enhancement review manifest and SHA", "page context for website media"]),
    stopConditions: Object.freeze(["local invented-detail risk", "oversmoothing risk", "macro redraw risk", "alpha/silhouette drift", "no material benefit over source"]),
    evidenceExpected: Object.freeze(["source-space edit review", "local detail risk", "macro structure risk", "page-context evidence when required"]),
    notes: Object.freeze(["An upscale is not accepted merely because it is larger or sharper. Learned candidates must prove benefit without redrawing the source."]),
  }),
  "texture-review": Object.freeze({
    primarySurface: "evavo-texture-review + evavo-texture-preprocess + evavo-godot-material-delivery + evavo-godot-material-validator",
    orderedTools: Object.freeze([
      "evavo_review_texture_map",
      "evavo_review_texture_set",
      "evavo_review_obj_uv_layout",
      "evavo_convert_tangent_normal_y",
      "evavo_compose_opacity_into_albedo_alpha",
      "evavo_create_texture_tile_proof",
      "evavo_pack_godot_orm_texture",
      "evavo_plan_godot_material_delivery",
      "evavo_write_godot_material_resource",
      "evavo_validate_godot_material_resource",
    ]),
    writeClass: "write-gated-create-only",
    prerequisites: Object.freeze([
      "declared semantic map kinds",
      "declare seamless expectation when applicable",
      "OBJ mesh or extracted triangle UV/world-position data when UV assurance is required",
      "target Godot material workflow before final delivery planning",
      "Godot project res:// paths for material resource materialization",
      "separate native execution admission and environment-configured Godot executable when native validation is requested",
    ]),
    stopConditions: Object.freeze([
      "scalar colour contamination",
      "normal-vector or normal-convention failure",
      "texture seam failure",
      "material-set dimension/role conflict",
      "UV overlap, degenerate, range, spacing or texel-density blocker",
      "unsupported standalone specular workflow without re-authoring/custom shader decision",
      "Godot binding plan reject or needs-preprocess after explicit preprocessing",
      "generated material fails native Godot load or expected-class validation",
      "representative runtime visual review fails",
    ]),
    evidenceExpected: Object.freeze([
      "per-map channel and seam evidence",
      "coherent material-set review",
      "topology-aware UV/OBJ evidence when a mesh is available",
      "explicit preprocessing receipts for normal-Y or opacity-alpha conversion when used",
      "optional diagnostic tile proof",
      "optional lossless ORM packing receipt",
      "explicit StandardMaterial3D or ORMMaterial3D delivery plan",
      "optional create-only unapproved .tres material and receipt",
      "optional native Godot load/class evidence",
    ]),
    notes: Object.freeze([
      "Map, material-set, UV and Godot delivery planning are read-only. Texture preprocessing, tile proofs, ORM packing and .tres materialization are separately write-gated create-only operations.",
      "Use evavo_review_uv_layout instead of OBJ review when the calling 3D pipeline already has extracted triangles; provide vertexKeys whenever possible for topology-aware island detection.",
      "Native validation is a separate execution privilege: the executable is operator-configured, shell execution is disabled, the exact call needs confirmLocalExecution=true, and Godot may update normal project cache/import data.",
      "A written or native-load-valid .tres remains unapproved until representative geometry is visually reviewed under target lighting.",
      "Never silently flip normal channels, repack PBR maps, compose opacity, or reinterpret specular maps without an explicit target-engine preprocessing decision.",
    ]),
  }),
  "runtime-effect": Object.freeze({
    primarySurface: "evavo-image-effects",
    orderedTools: Object.freeze(["evavo_plan_godot_sprite_effect", "evavo_compile_godot_sprite_effect_pack", "evavo_write_godot_sprite_effect_pack"]),
    writeClass: "write-gated-create-only",
    prerequisites: Object.freeze(["Godot 4.6.2 renderer target", "sprite role", "effect intent", "atlas region/padding contract when applicable"]),
    stopConditions: Object.freeze(["role incompatibility", "performance budget mismatch", "native renderer compile/capture failure"]),
    evidenceExpected: Object.freeze(["agent effect plan", "static shader validation", "checksummed pack receipt", "native renderer approval later"]),
    notes: Object.freeze(["Runtime effects stay dynamic and should not be destructively baked into canonical art masters by default."]),
  }),
  "raster-effect": Object.freeze({
    primarySurface: "evavo-image-effects",
    orderedTools: Object.freeze(["evavo_create_raster_effect_layer"]),
    writeClass: "write-gated-create-only",
    prerequisites: Object.freeze(["alpha-bearing source", "effect preset or bounded explicit shadow/glow spec"]),
    stopConditions: Object.freeze(["unsafe output dimensions/pixel budget", "insufficient padding", "unreviewed destructive bake"]),
    evidenceExpected: Object.freeze(["effect parameters", "separate transparent output layer", "subject anchor", "unapproved receipt"]),
    notes: Object.freeze(["Keep effect layers separate until a reviewed delivery explicitly composites them."]),
  }),
  "ai-artifact-assessment": Object.freeze({
    primarySurface: "evavo-image-finishing-artist",
    orderedTools: Object.freeze(["evavo_review_image_for_finishing", "trusted provenance/lineage review", "human visual review"]),
    writeClass: "read-only",
    prerequisites: Object.freeze(["actual image", "references/adjacent frames when consistency matters"]),
    stopConditions: Object.freeze(["do not infer authorship from pixel heuristics"]),
    evidenceExpected: Object.freeze(["artifact signals", "defect evidence", "similarity/consistency evidence", "provenance status"]),
    notes: Object.freeze(["Art Studio may identify suspicious artifacts and low-quality generative-looking defects, but it must not claim pixels alone prove AI authorship."]),
  }),
  "finalize-image": Object.freeze({
    primarySurface: "Art Studio finishing + promotion gates",
    orderedTools: Object.freeze(["evavo_review_image_for_finishing", "evavo_finish_raster_asset", "evavo_create_transparency_proof", "existing promotion/approval tools"]),
    writeClass: "write-gated-create-only",
    prerequisites: Object.freeze(["approved source/candidate lineage", "declared delivery target", "all role-specific visual checks"]),
    stopConditions: Object.freeze(["technical blocker", "semantic concern", "missing proof", "unapproved candidate"]),
    evidenceExpected: Object.freeze(["final technical review", "delivery evidence", "proofs", "explicit approval/promotion record"]),
    notes: Object.freeze(["Finishing output remains unapproved until the existing promotion boundary is explicitly satisfied."]),
  }),
});

export function listImageAgentGoals(): readonly ImageAgentGoal[] {
  return Object.freeze(Object.keys(ROUTES) as ImageAgentGoal[]);
}

export function routeImageAgentTask(goal: ImageAgentGoal): ImageAgentRoute {
  const route = ROUTES[goal];
  if (!route) throw new Error(`Unknown image agent goal ${JSON.stringify(goal)}.`);
  return Object.freeze({ contract: IMAGE_AGENT_ROUTE_CONTRACT, goal, ...route });
}
