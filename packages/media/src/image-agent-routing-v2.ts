export const IMAGE_AGENT_ROUTE_V2_CONTRACT = "evavo.image-agent-route.v2" as const;

export type ImageAgentGoalV2 =
  | "quality-review"
  | "frame-consistency"
  | "reference-consistency"
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
  | "delivery-preflight"
  | "finalize-image";

export type ImageAgentPrivilegeClassV2 =
  | "read-only"
  | "write-gated-create-only"
  | "candidate-and-mask-required"
  | "provider-or-human-candidate-required"
  | "execution-gated";

export interface ImageAgentRouteStepV2 {
  readonly surface: string;
  readonly tool: string;
  readonly privilege: ImageAgentPrivilegeClassV2;
  readonly optional?: boolean;
  readonly purpose: string;
}

export interface ImageAgentRouteV2 {
  readonly contract: typeof IMAGE_AGENT_ROUTE_V2_CONTRACT;
  readonly goal: ImageAgentGoalV2;
  readonly preferredSurface: string;
  readonly steps: readonly ImageAgentRouteStepV2[];
  readonly prerequisites: readonly string[];
  readonly stopConditions: readonly string[];
  readonly evidenceExpected: readonly string[];
  readonly invariants: readonly string[];
}

const READ_ONLY = "read-only" as const;
const WRITE = "write-gated-create-only" as const;
const MASKED = "candidate-and-mask-required" as const;
const PROVIDER = "provider-or-human-candidate-required" as const;
const EXECUTION = "execution-gated" as const;

function step(
  surface: string,
  tool: string,
  privilege: ImageAgentPrivilegeClassV2,
  purpose: string,
  optional = false,
): ImageAgentRouteStepV2 {
  return Object.freeze({ surface, tool, privilege, purpose, ...(optional ? { optional: true } : {}) });
}

const COMMON_INVARIANTS = Object.freeze([
  "Never overwrite the canonical source image when a create-only derivative can be used.",
  "Pixel-changing work remains unapproved until the actual output is re-reviewed.",
  "Numeric or statistical evidence never grants creative approval or publication authority.",
  "Pixel heuristics may flag artifact risk but must not be presented as proof of AI authorship.",
  "Semantic defects such as anatomy, text, identity, pose, perspective or wrong content are not filter problems.",
]);

const ROUTES: Readonly<Record<ImageAgentGoalV2, Omit<ImageAgentRouteV2, "contract" | "goal">>> = Object.freeze({
  "quality-review": Object.freeze({
    preferredSurface: "evavo-image-finishing-packet",
    steps: Object.freeze([
      step("evavo-image-finishing-packet", "evavo_review_image_finishing_packet", READ_ONLY, "Combine technical quality, defect regions, artifact/generated-detail risk, repair routing and optional approved-reference consistency."),
      step("evavo-image-finishing-artist", "evavo_review_image_for_finishing", READ_ONLY, "Expose lower-level specialist finishing evidence when deeper diagnostics are needed.", true),
    ]),
    prerequisites: Object.freeze(["actual local image", "correct role/profile when known", "approved references and explicit visual findings when available"]),
    stopConditions: Object.freeze(["technical reject", "semantic uncertainty", "strong reference drift", "repair route exceeds bounded automatic scope"]),
    evidenceExpected: Object.freeze(["finishing disposition/priority", "quality/defect evidence", "artifact/generated-detail evidence", "repair decision", "visual checklist"]),
    invariants: COMMON_INVARIANTS,
  }),
  "frame-consistency": Object.freeze({
    preferredSurface: "evavo-image-sequence-finishing",
    steps: Object.freeze([
      step("evavo-image-sequence-finishing", "evavo_review_image_sequence_finishing", READ_ONLY, "Review ordered frames with per-frame finishing decisions, technical continuity and adjacent-frame similarity."),
      step("evavo-image-finishing-packet", "evavo_review_image_finishing_batch", READ_ONLY, "Review an unordered image/frame batch with shared approved references and repair priorities when temporal order is not meaningful.", true),
      step("evavo-image-finishing-packet", "evavo_create_image_finishing_batch_proof", WRITE, "Create a bounded diagnostic contact proof of the highest-priority frames for human review.", true),
    ]),
    prerequisites: Object.freeze(["2-128 ordered frames for sequence review or 1-128 images for batch review", "intended role/profile", "approved references when identity/style continuity matters"]),
    stopConditions: Object.freeze(["per-frame technical/semantic blocker", "canvas/aspect/alpha continuity failure", "strong reference drift", "neighbor anomaly requiring motion review"]),
    evidenceExpected: Object.freeze(["per-frame repair disposition", "sequence baseline", "continuity flags", "adjacent similarity", "ranked review priority", "optional visual contact proof"]),
    invariants: Object.freeze([...COMMON_INVARIANTS, "Duplicate neighboring frames are review evidence, not automatic failure, because intentional animation holds are valid."]),
  }),
  "reference-consistency": Object.freeze({
    preferredSurface: "evavo-image-reference-consistency",
    steps: Object.freeze([
      step("evavo-image-reference-consistency", "evavo_review_image_against_references", READ_ONLY, "Compare one candidate against a coherent approved visual baseline."),
      step("evavo-image-reference-consistency", "evavo_review_image_batch_against_references", READ_ONLY, "Rank a candidate batch by deterministic visual drift from approved references.", true),
      step("evavo-image-reference-consistency", "evavo_create_image_reference_consistency_proof", WRITE, "Create a diagnostic approved-reference/candidate proof sheet for human inspection.", true),
    ]),
    prerequisites: Object.freeze(["1-32 approved references representing one intended visual target", "candidate image or batch"]),
    stopConditions: Object.freeze(["approved reference set is internally unstable", "strong technical visual drift", "semantic identity/style correctness remains uncertain"]),
    evidenceExpected: Object.freeze(["reference-set coherence", "palette/tone/detail/silhouette/framing distance", "nearest references", "ranked outliers"]),
    invariants: Object.freeze([...COMMON_INVARIANTS, "Reference consistency is a visual surrogate, not identity recognition."]),
  }),
  "fake-transparency": Object.freeze({
    preferredSurface: "evavo-raster-finishing",
    steps: Object.freeze([
      step("evavo-raster-finishing", "evavo_master_transparent_asset", WRITE, "Recover or master real alpha from native alpha, painted checkerboard or an admitted matte strategy."),
      step("evavo-raster-finishing", "evavo_create_transparency_proof", WRITE, "Render hostile-background transparency evidence for thin parts, halos and edge contamination."),
      step("evavo-image-finishing-packet", "evavo_review_image_finishing_packet", READ_ONLY, "Re-review the actual transparency output before any approval step."),
    ]),
    prerequisites: Object.freeze(["source transparency condition is known or inspectable", "ambiguous natural backgrounds use segmentation/provider masks rather than chroma heuristics"]),
    stopConditions: Object.freeze(["ambiguous subject boundary", "thin-part loss", "edge contamination", "failed post-master finishing review"]),
    evidenceExpected: Object.freeze(["alpha recovery strategy", "real-alpha proof", "hostile-background proof", "post-master finishing packet"]),
    invariants: COMMON_INVARIANTS,
  }),
  "natural-background-cutout": Object.freeze({
    preferredSurface: "evavo-raster-finishing + governed segmentation/provider workflow",
    steps: Object.freeze([
      step("approved-segmentation-or-provider", "produce-reviewed-subject-mask", PROVIDER, "Obtain a reviewed subject alpha/segmentation mask for an ambiguous natural background."),
      step("evavo-raster-finishing", "evavo_finish_raster_asset", WRITE, "Apply the admitted mask in a create-only finishing workflow."),
      step("evavo-raster-finishing", "evavo_create_transparency_proof", WRITE, "Inspect hair/glass/thin parts and edge contamination against hostile backgrounds."),
      step("evavo-image-finishing-packet", "evavo_review_image_finishing_packet", READ_ONLY, "Re-review the actual cutout output."),
    ]),
    prerequisites: Object.freeze(["reviewed segmentation/alpha mask", "source/candidate/mask lineage"]),
    stopConditions: Object.freeze(["ambiguous boundary", "hair/glass/thin-part loss", "unreviewed mask", "post-edit quality regression"]),
    evidenceExpected: Object.freeze(["mask lineage", "alpha proof", "post-edit finishing evidence"]),
    invariants: COMMON_INVARIANTS,
  }),
  "local-technical-repair": Object.freeze({
    preferredSurface: "evavo-image-repair",
    steps: Object.freeze([
      step("evavo-image-finishing-packet", "evavo_review_image_finishing_packet", READ_ONLY, "Establish the smallest safe repair disposition before writing."),
      step("evavo-image-repair", "evavo_apply_preservation_image_repair", WRITE, "Apply preservation-only transparent-RGB/matte-fringe cleanup when admitted.", true),
      step("evavo-image-repair", "evavo_apply_masked_candidate_image_repair", MASKED, "Composite an explicit reviewed candidate inside a bounded mask when localized repair is required.", true),
      step("evavo-image-finishing-packet", "evavo_review_image_finishing_packet", READ_ONLY, "Re-review the actual repaired candidate."),
    ]),
    prerequisites: Object.freeze(["fresh finishing packet", "explicit candidate and mask for localized edits"]),
    stopConditions: Object.freeze(["invented-detail risk", "mask/coverage budget exceeded", "semantic defect", "post-edit regression"]),
    evidenceExpected: Object.freeze(["repair admission", "difference/outside-mask preservation evidence", "post-edit finishing packet"]),
    invariants: COMMON_INVARIANTS,
  }),
  "semantic-repair": Object.freeze({
    preferredSurface: "evavo-image-repair + governed provider edit/inpaint",
    steps: Object.freeze([
      step("evavo-image-finishing-packet", "evavo_review_image_finishing_packet", READ_ONLY, "Capture explicit semantic findings and reference requirements."),
      step("governed-provider-edit-or-inpaint", "produce-reviewed-semantic-candidate", PROVIDER, "Create a candidate for anatomy, text, identity, style, perspective, composition or content correction."),
      step("evavo-image-repair", "evavo_apply_masked_candidate_image_repair", MASKED, "Confine the reviewed candidate to the admitted edit mask where localized composition is appropriate."),
      step("evavo-image-finishing-packet", "evavo_review_image_finishing_packet", READ_ONLY, "Re-review technical integrity, artifact risk and reference consistency after the semantic edit."),
    ]),
    prerequisites: Object.freeze(["explicit semantic finding", "reviewed mask when local", "identity/style/content references when relevant"]),
    stopConditions: Object.freeze(["candidate changes outside admitted scope", "identity/style/content still wrong", "technical regression"]),
    evidenceExpected: Object.freeze(["semantic finding", "candidate/mask/reference lineage", "preservation evidence", "post-edit finishing packet"]),
    invariants: COMMON_INVARIANTS,
  }),
  "resize-or-export": Object.freeze({
    preferredSurface: "evavo-raster-finishing + evavo-image-delivery-integrity",
    steps: Object.freeze([
      step("evavo-raster-finishing", "evavo_finish_raster_asset", WRITE, "Create the requested size/format derivative with an explicit pixel-art versus continuous-tone sampling policy."),
      step("evavo-image-finishing-packet", "evavo_review_image_finishing_packet", READ_ONLY, "Check the actual derivative for visual/technical regressions."),
      step("evavo-image-delivery-integrity", "evavo_review_image_delivery_integrity", READ_ONLY, "Verify final format, alpha, metadata, colour-space and size/budget contract."),
    ]),
    prerequisites: Object.freeze(["declared target dimensions/format", "sampling policy", "delivery target/budget when known"]),
    stopConditions: Object.freeze(["upscale would invent detail", "alpha/edge regression", "encoded format/alpha/budget conflict"]),
    evidenceExpected: Object.freeze(["derivative dimensions/format", "post-resize finishing packet", "delivery integrity evidence"]),
    invariants: COMMON_INVARIANTS,
  }),
  "learned-enhancement-review": Object.freeze({
    preferredSurface: "Enhancement Studio + Art Studio review session",
    steps: Object.freeze([
      step("Art Studio review session", "evavo_create_image_review_session", READ_ONLY, "Bind immutable source/candidate bytes and review context."),
      step("Enhancement Studio bridge", "reviewEnhancementStudioCandidate", READ_ONLY, "Measure local invented-detail/oversmoothing and macro redraw risk."),
      step("Art Studio review session", "evavo_verify_image_review_session", READ_ONLY, "Verify the enhancement review evidence before acceptance."),
    ]),
    prerequisites: Object.freeze(["immutable source", "candidate", "current enhancement review manifest/SHA", "page context when relevant"]),
    stopConditions: Object.freeze(["invented-detail risk", "oversmoothing", "macro redraw", "silhouette/alpha drift", "no material benefit"]),
    evidenceExpected: Object.freeze(["source-space edit evidence", "local detail risk", "macro structure risk", "context evidence"]),
    invariants: COMMON_INVARIANTS,
  }),
  "texture-review": Object.freeze({
    preferredSurface: "evavo-texture-review + evavo-texture-preprocess + evavo-godot-material-delivery",
    steps: Object.freeze([
      step("evavo-texture-review", "evavo_review_texture_map", READ_ONLY, "Review each map according to its semantic PBR/data role."),
      step("evavo-texture-review", "evavo_review_texture_set", READ_ONLY, "Validate one coherent material set and map-role/dimension contract."),
      step("evavo-texture-review", "evavo_review_obj_uv_layout", READ_ONLY, "Validate topology-aware UV overlap/range/padding/texel-density from OBJ when available.", true),
      step("evavo-texture-preprocess", "evavo_convert_tangent_normal_y", WRITE, "Explicitly convert DirectX/OpenGL normal Y convention when required.", true),
      step("evavo-texture-preprocess", "evavo_compose_opacity_into_albedo_alpha", WRITE, "Explicitly compose opacity into albedo alpha when the Godot material contract requires it.", true),
      step("evavo-texture-review", "evavo_pack_godot_orm_texture", WRITE, "Pack AO/Roughness/Metallic deterministically into Godot ORM channels when chosen.", true),
      step("evavo-godot-material-delivery", "evavo_plan_godot_material_delivery", READ_ONLY, "Plan exact StandardMaterial3D/ORMMaterial3D bindings."),
      step("evavo-godot-material-delivery", "evavo_write_godot_material_resource", WRITE, "Create a new unapproved Godot .tres material when the plan is ready.", true),
      step("evavo-godot-material-validator", "evavo_validate_godot_material_resource", EXECUTION, "Load-test the material through a real headless Godot process.", true),
    ]),
    prerequisites: Object.freeze(["semantic map kinds", "tileability intent", "UV geometry when relevant", "target engine/material workflow"]),
    stopConditions: Object.freeze(["scalar/map contamination", "normal convention failure", "seam/UV/material-set failure", "unsupported specular workflow", "Godot plan or native load failure"]),
    evidenceExpected: Object.freeze(["map evidence", "material-set evidence", "UV evidence", "preprocessing/ORM receipts", "Godot binding/resource/native-load evidence"]),
    invariants: Object.freeze([...COMMON_INVARIANTS, "Do not apply photographic colour or sharpening operations to numeric material data maps."]),
  }),
  "runtime-effect": Object.freeze({
    preferredSurface: "evavo-image-effects",
    steps: Object.freeze([
      step("evavo-image-effects", "evavo_plan_godot_sprite_effect", READ_ONLY, "Plan a bounded runtime effect for the declared sprite role and renderer."),
      step("evavo-image-effects", "evavo_compile_godot_sprite_effect_pack", WRITE, "Compile a checksummed effect pack without baking the effect into the art master."),
      step("evavo-image-effects", "evavo_write_godot_sprite_effect_pack", WRITE, "Create the effect pack for later native runtime validation."),
    ]),
    prerequisites: Object.freeze(["Godot renderer target", "sprite role", "effect intent", "atlas padding/region contract when relevant"]),
    stopConditions: Object.freeze(["role incompatibility", "performance mismatch", "native renderer validation failure"]),
    evidenceExpected: Object.freeze(["effect plan", "static shader evidence", "pack receipt", "later native runtime review"]),
    invariants: COMMON_INVARIANTS,
  }),
  "raster-effect": Object.freeze({
    preferredSurface: "evavo-image-effects",
    steps: Object.freeze([
      step("evavo-image-effects", "evavo_create_raster_effect_layer", WRITE, "Create a separate transparent effect layer rather than destructively baking into the canonical master."),
      step("evavo-image-finishing-packet", "evavo_review_image_finishing_packet", READ_ONLY, "Review any final composite after the effect is deliberately applied.", true),
    ]),
    prerequisites: Object.freeze(["alpha-bearing source", "bounded effect preset/spec", "sufficient padding"]),
    stopConditions: Object.freeze(["unsafe dimensions/pixel budget", "padding failure", "unreviewed destructive composite"]),
    evidenceExpected: Object.freeze(["effect parameters", "separate effect output", "post-composite finishing evidence when applicable"]),
    invariants: COMMON_INVARIANTS,
  }),
  "ai-artifact-assessment": Object.freeze({
    preferredSurface: "evavo-image-artifact-triage + evavo-image-reference-consistency + evavo-image-provenance",
    steps: Object.freeze([
      step("evavo-image-artifact-triage", "evavo_review_image_artifact_risk", READ_ONLY, "Measure ringing, posterization, resampling, repeated-detail and detail-density anomalies."),
      step("evavo-image-reference-consistency", "evavo_review_image_against_references", READ_ONLY, "Measure drift from approved visual references when supplied.", true),
      step("evavo-image-provenance", "evavo_review_image_provenance", READ_ONLY, "Bind exact image bytes to source/generation/content-credential evidence; external verifier results remain explicitly delegated and pixel heuristics never establish authorship."),
      step("human semantic visual review", "inspect-semantic-artifacts", READ_ONLY, "Inspect anatomy, text, identity, reflections, perspective and object logic."),
    ]),
    prerequisites: Object.freeze(["actual image", "approved references when consistency matters", "byte-bound provenance evidence or a trusted external verifier result when origin/authorship matters"]),
    stopConditions: Object.freeze(["do not infer authorship from pixel heuristics", "invalid or contradictory provenance evidence", "reference baseline unstable", "semantic finding unresolved"]),
    evidenceExpected: Object.freeze(["technical artifact signals", "generated-detail signals", "optional reference drift", "byte-bound provenance packet", "semantic visual verdict"]),
    invariants: Object.freeze([...COMMON_INVARIANTS, "Provenance claims must be bound to the exact image SHA-256, and externally verified status must remain distinguishable from verification performed by Art Studio itself."]),
  }),
  "delivery-preflight": Object.freeze({
    preferredSurface: "evavo-image-delivery-integrity",
    steps: Object.freeze([
      step("evavo-image-delivery-integrity", "evavo_review_image_delivery_integrity", READ_ONLY, "Audit one final image's format, alpha, colour/profile, orientation, metadata, megapixel/byte budget and optional print DPI."),
      step("evavo-image-delivery-integrity", "evavo_review_image_delivery_batch", READ_ONLY, "Rank delivery failures/warnings across up to 128 final derivatives.", true),
    ]),
    prerequisites: Object.freeze(["actual final derivative", "delivery target", "intended format/alpha/size/budget when constrained"]),
    stopConditions: Object.freeze(["format mismatch", "alpha incompatibility", "colour-space blocker", "megapixel/byte budget exceeded", "print DPI below requirement"]),
    evidenceExpected: Object.freeze(["container metadata", "alpha/format contract", "colour/profile evidence", "privacy metadata evidence", "size/budget evidence", "print DPI when supplied"]),
    invariants: Object.freeze([...COMMON_INVARIANTS, "Delivery preflight never silently colour-converts or strips metadata from the master."]),
  }),
  "finalize-image": Object.freeze({
    preferredSurface: "evavo-image-finalization",
    steps: Object.freeze([
      step("evavo-image-finalization", "evavo_review_image_finalization", READ_ONLY, "Combine the finishing packet with destination integrity and return blocked/needs-finishing/needs-delivery-review/ready-for-approval-review."),
      step("existing-promotion-and-approval-gates", "explicit-approval-or-promotion", PROVIDER, "Promote only after the actual final candidate passes human/creative/runtime approval requirements.", true),
    ]),
    prerequisites: Object.freeze(["actual final image", "delivery target", "approved references and semantic findings when applicable", "source/candidate lineage"]),
    stopConditions: Object.freeze(["finalization decision is not ready-for-approval-review", "human visual review fails", "promotion authority not granted"]),
    evidenceExpected: Object.freeze(["finishing disposition", "artifact/reference/repair evidence", "delivery integrity", "explicit approval/promotion record"]),
    invariants: Object.freeze([...COMMON_INVARIANTS, "Ready-for-approval-review is not approval and never authorizes automatic publication."]),
  }),
});

export function listImageAgentGoalsV2(): readonly ImageAgentGoalV2[] {
  return Object.freeze(Object.keys(ROUTES) as ImageAgentGoalV2[]);
}

export function routeImageAgentTaskV2(goal: ImageAgentGoalV2): ImageAgentRouteV2 {
  const route = ROUTES[goal];
  if (!route) throw new Error(`Unknown image agent v2 goal ${JSON.stringify(goal)}.`);
  return Object.freeze({ contract: IMAGE_AGENT_ROUTE_V2_CONTRACT, goal, ...route });
}
