import {
  fingerprintBookIllustrationValue,
  type BookIllustrationProcessFamily,
} from "./book-illustration-intelligence.js";
import type {
  BookArtBriefV1,
  BookArtIdentityV1,
  BookArtManuscriptBindingV1,
  BookArtOutputRequirementV1,
  BookArtPurpose,
} from "./book-production.js";
import { fingerprintBookArtBrief } from "./book-production-profile.js";
import {
  BOOK_CREATIVE_DIRECTION_CONTRACT,
  type BookCreativeComposition,
  type BookCreativeDirectionInputV1,
  type BookCreativeDirectionPlanV1,
  type BookCreativeDirectionResultV1,
  type BookCreativeDirectionRouteV1,
  type BookCreativeEvidenceV1,
  type BookCreativeGenre,
  type BookCreativeRouteKind,
} from "./book-creative-direction-types.js";
import {
  GENERIC,
  P,
  STOCK_MOTIFS,
  SYNTHETIC_FAILURES,
  type Profile,
} from "./book-creative-direction-profiles.js";

export * from "./book-creative-direction-types.js";
export {
  STOCK_MOTIFS,
  SYNTHETIC_FAILURES,
} from "./book-creative-direction-profiles.js";

const EMPTY_IDENTITY: BookArtIdentityV1 = {
  workspaceId: "invalid",
  projectId: "invalid",
  bookId: "invalid",
  requestId: "invalid",
};

const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
] as const;
const COLOUR_INTENTS = [
  "rgb",
  "grayscale",
  "monochrome",
  "cmyk_conversion_required",
] as const;
const ALPHA_POLICIES = ["required", "forbidden", "allowed"] as const;
const TEXT_POLICIES = ["text_free", "exact_editable_labels_only"] as const;

export function listBookCreativeDirectionCapabilities() {
  return Object.freeze({
    outputKind: "evavo_art_book_creative_direction_capabilities",
    schemaVersion: 1,
    contract: BOOK_CREATIVE_DIRECTION_CONTRACT,
    capabilities: [
      "book.creative_direction.compile",
      "book.creative_direction.briefs.compile",
    ] as const,
    providerCallPerformed:false as const,
    selectionPerformed:false as const,
    promotionPerformed:false as const,
    publicationPerformed:false as const,
  });
}

export async function compileBookCreativeDirection(
  value: unknown,
): Promise<BookCreativeDirectionResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(value)) {
    blockers.push("Creative-direction input must be an object.");
    return blocked(EMPTY_IDENTITY, blockers, warnings);
  }

  const input = value as Partial<BookCreativeDirectionInputV1>;
  const identity = identityOf(input.identity, blockers);

  if (
    input.outputKind !== "evavo_art_book_creative_direction_input"
    || input.schemaVersion !== 1
    || input.contract !== BOOK_CREATIVE_DIRECTION_CONTRACT
  ) {
    blockers.push("Creative-direction input identity is invalid.");
  }

  for (const field of [
    "providerCallAllowed",
    "automaticSelectionAllowed",
    "automaticPromotionAllowed",
    "publicationAllowed",
  ] as const) {
    if (input[field] !== false) {
      blockers.push(`${field} must remain false.`);
    }
  }

  const requestedBy = id(input.requestedBy, "requestedBy", blockers);
  const namedCreatorReferences = texts(
    input.namedCreatorReferences,
    "namedCreatorReferences",
    0,
    blockers,
  );
  const brandedFranchiseReferences = texts(
    input.brandedFranchiseReferences,
    "brandedFranchiseReferences",
    0,
    blockers,
  );

  const genre = genreOf(input.primaryGenre, blockers);
  const profile = P[genre];
  const purpose = purposeOf(input.purpose, blockers);
  const manuscript = manuscriptOf(input.manuscript, blockers);
  const output = outputOf(input.output, blockers);
  const themes = evidence(input.themes, "themes", 2, blockers);
  const motifs = evidence(
    input.motifs,
    "motifs",
    technical(genre) ? 0 : 1,
    blockers,
  );
  const settings = evidence(input.settings, "settings", 1, blockers);
  const characters = evidence(
    input.characters,
    "characters",
    characterDriven(genre) ? 1 : 0,
    blockers,
  );
  const scenes = evidence(
    input.scenes,
    "scenes",
    technical(genre) ? 0 : 2,
    blockers,
  );
  const continuity = texts(
    input.continuityRequirements,
    "continuityRequirements",
    1,
    blockers,
  );
  const materials = texts(
    input.materialRequirements,
    "materialRequirements",
    evidenceHeavy(genre) ? 1 : 0,
    blockers,
  );
  const rights = ids(input.rightsEvidenceIds, "rightsEvidenceIds", 1, blockers);
  const processes = processList(input.allowedProcessFamilies, blockers);
  const count = int(input.routeCount, 2, 4, "routeCount", blockers);
  const aesthetic = text(
    input.aestheticIntent,
    "aestheticIntent",
    20,
    1000,
    blockers,
  );
  const content = text(
    input.contentClass,
    "contentClass",
    2,
    120,
    blockers,
  );
  const audience = text(input.audience, "audience", 10, 500, blockers);
  const conflict = text(
    input.centralConflict,
    "centralConflict",
    20,
    1200,
    blockers,
  );
  const promise = text(
    input.emotionalPromise,
    "emotionalPromise",
    20,
    1200,
    blockers,
  );
  const title = zone(input.titleZone, "titleZone", blockers);
  const author = zone(input.authorZone, "authorZone", blockers);
  const quiet = int(
    input.minimumQuietAreaPercent,
    15,
    65,
    "minimumQuietAreaPercent",
    blockers,
  );
  const requestedAt = time(input.requestedAt, blockers);

  generic(aesthetic, blockers);

  if (namedCreatorReferences.length > 0) {
    blockers.push(
      "Named-creator imitation is prohibited; use project-owned mechanisms and historical processes.",
    );
  }
  if (brandedFranchiseReferences.length > 0) {
    blockers.push(
      "Branded-franchise transfer is prohibited; use project-owned genre language.",
    );
  }
  if (output.textPolicy !== "text_free") {
    blockers.push(
      "Generated Book Art must remain text-free; Docs Suite owns editable typography and labels.",
    );
  }

  const badRights = rights.filter(
    (rightId) => !manuscript.approvedEvidenceIds.includes(rightId),
  );
  if (badRights.length > 0) {
    blockers.push(`Rights evidence is not approved: ${badRights.join(", ")}.`);
  }
  if (cover(purpose) && scenes.filter(safe).length < 2) {
    blockers.push(
      "Cover direction requires at least two non-major-spoiler scenes.",
    );
  }

  if (blockers.length > 0) {
    return blocked(identity, blockers, warnings);
  }

  const process = profile.processes.find((candidate) => processes.includes(candidate))
    ?? processes[0]
    ?? profile.processes[0]!;
  const thesis = `Create project-owned ${content} art for a ${genre} book aimed at ${audience}. Make the reader feel ${promise}. Visual pressure: ${conflict}. Themes: ${themes
    .slice(0, 3)
    .map((theme) => theme.label)
    .join(", ")}. Use ${profile.tone}. Aesthetic intent: ${aesthetic}. Every visible choice must be traceable to manuscript evidence, material logic, print process or editable layout needs.`;
  const candidates = routes({
    purpose,
    genre,
    profile,
    themes,
    motifs,
    settings,
    characters,
    scenes,
    process,
    title,
    author,
    quiet,
  });
  const chosen = distinct(candidates, count);
  if (chosen.length !== count) {
    return blocked(
      identity,
      [`Only ${chosen.length} materially distinct routes could be compiled; ${count} are required.`],
      warnings,
    );
  }

  const compiledRoutes: BookCreativeDirectionRouteV1[] = [];
  for (const route of chosen) {
    const briefIdentity: BookArtIdentityV1 = {
      ...identity,
      requestId: `book-route-${hash({
        base: identity.requestId,
        route: route.routeId,
      }).slice(0, 32)}`,
    };
    const briefWithoutFingerprint: Omit<BookArtBriefV1, "briefFingerprint"> = {
      outputKind: "evavo_book_art_brief",
      schemaVersion: 1,
      contract: "evavo_book_art_handoff_v1",
      identity: briefIdentity,
      purpose,
      manuscript: {
        ...manuscript,
        approvedEvidenceIds: [...manuscript.approvedEvidenceIds],
      },
      conceptTerritoryId: route.routeId,
      conceptTerritoryLabel: route.label,
      creativeThesis: `${thesis} ${route.rationale}`,
      primarySubject: route.subject,
      supportingSubjects: route.supporting,
      compositionRequirements: route.compositionRules,
      mustShow: route.mustShow,
      mustNotShow: unique([
        ...route.mustAvoid,
        ...STOCK_MOTIFS,
        ...profile.cliches,
        ...SYNTHETIC_FAILURES,
      ]),
      spoilerRestrictions: scenes
        .filter((scene) => !safe(scene))
        .map((scene) => scene.evidenceId),
      continuityRequirements: continuity,
      historicalAndMaterialRequirements: unique([
        ...materials,
        ...route.markLogic,
      ]),
      negativeSpaceRequirements: [
        `Reserve ${quiet}% quiet area in the ${title} for editable title typography.`,
        `Reserve the ${author} for editable author typography.`,
        "Generated lettering, labels, logos and pseudo-text are prohibited.",
      ],
      output: {
        ...output,
        allowedMimeTypes: [...output.allowedMimeTypes],
      },
      rightsEvidenceIds: rights,
      createdAt: requestedAt,
      providerCandidateMayBeFinal: false,
      publicationPerformed: false,
    };
    compiledRoutes.push({
      ...route,
      brief: {
        ...briefWithoutFingerprint,
        briefFingerprint: await fingerprintBookArtBrief(briefWithoutFingerprint),
      },
    });
  }

  const evidenceFingerprint = `sha256:${hash({
    identity,
    requestedBy,
    manuscript,
    genre,
    themes,
    motifs,
    settings,
    characters,
    scenes,
    rights,
  })}`;
  const providerInstruction = `${thesis} Use ${process} as reproducible mark grammar, never a texture filter. Produce separate candidates, never a contact sheet. Routes: ${compiledRoutes
    .map((route) => route.label)
    .join("; ")}. Reject stock motifs: ${STOCK_MOTIFS.join("; ")}. Reject synthetic failures: ${SYNTHETIC_FAILURES.join("; ")}.`;
  const planWithoutFingerprint: Omit<BookCreativeDirectionPlanV1, "planFingerprint"> = {
    outputKind: "evavo_art_book_creative_direction_plan",
    schemaVersion: 1,
    contract: BOOK_CREATIVE_DIRECTION_CONTRACT,
    identity,
    purpose,
    genre,
    evidenceFingerprint,
    creativeThesis: thesis,
    routes: compiledRoutes,
    providerInstruction,
    providerCallPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  };
  const plan: BookCreativeDirectionPlanV1 = {
    ...planWithoutFingerprint,
    planFingerprint: `sha256:${hash(planWithoutFingerprint)}`,
  };

  warnings.push(
    `${compiledRoutes.length} materially distinct, evidence-bound routes compiled. No provider call, selection or promotion was performed.`,
  );
  return {
    outputKind: "evavo_art_book_creative_direction_result",
    schemaVersion: 1,
    contract: BOOK_CREATIVE_DIRECTION_CONTRACT,
    status: "ready",
    identity,
    plan,
    blockers: [],
    warnings,
    providerCallPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    publicationPerformed: false,
  };
}

interface Seed extends Omit<BookCreativeDirectionRouteV1, "brief"> {
  subject: string;
  supporting: string[];
  compositionRules: string[];
  mustShow: string[];
  mustAvoid: string[];
  safe: boolean;
  score: number;
}

interface RouteContext {
  purpose: BookArtPurpose;
  genre: BookCreativeGenre;
  profile: Profile;
  themes: BookCreativeEvidenceV1[];
  motifs: BookCreativeEvidenceV1[];
  settings: BookCreativeEvidenceV1[];
  characters: BookCreativeEvidenceV1[];
  scenes: BookCreativeEvidenceV1[];
  process: BookIllustrationProcessFamily;
  title: string;
  author: string;
  quiet: number;
}

function routes(context: RouteContext): Seed[] {
  const motif = context.motifs[0];
  const setting = context.settings[0]!;
  const primaryCharacter = context.characters[0];
  const secondaryCharacter = context.characters[1];
  const scene = (cover(context.purpose)
    ? context.scenes.filter(safe)
    : context.scenes)[0];
  const quietRules = [
    `Keep ${context.quiet}% quiet area in the ${context.title}.`,
    `Keep the ${context.author} clear for editable typography.`,
    "Shape negative space from the manuscript, not a gradient.",
  ];
  const markRules = [
    "Primary contours carry silhouette and structural load.",
    "Secondary contours describe construction and plane changes.",
    "Tertiary marks appear only where material, light or evidence changes.",
    "Hatching follows form, material and light.",
    "Uniform micro-detail and global scratch overlays are prohibited.",
  ];
  const candidates: Seed[] = [];

  if (motif) {
    candidates.push(
      seed(
        "material_symbol",
        "single_anchor_with_counterweight",
        motif.label,
        `Use ${motif.label} as a physically specific object whose change carries the conflict.`,
        [motif, ...context.themes.slice(0, 2)],
        context.process,
        motif.visualForms?.[0] ?? motif.label,
        motif.visualForms?.slice(1, 3) ?? [],
        ["Three dominant value groups.", "One material counterweight.", ...quietRules],
        [`Show the evidence-bound change: ${motif.meaning}.`],
        [
          "floating object on a gradient",
          "decorative symbolism without evidence",
        ],
        markRules,
        true,
        96,
      ),
    );
  }

  candidates.push(
    seed(
      "environmental_pressure",
      "asymmetric_environmental_dominance",
      setting.label,
      `Make ${setting.label} act through scale, architecture, weather and wear rather than serve as scenery.`,
      [setting, ...(scene ? [scene] : [])],
      context.process,
      setting.label,
      unique([
        primaryCharacter?.label ?? "",
        ...(setting.architecture ?? []).slice(0, 2),
      ]),
      [
        "Environment carries more weight than the figure.",
        "Depth planes contain different evidence.",
        ...quietRules,
      ],
      [
        ...(setting.architecture ?? []).slice(0, 2),
        ...(setting.materials ?? []).slice(0, 2),
      ],
      ["postcard view", "architecture without use or wear"],
      markRules,
      !scene || safe(scene),
      context.profile.compositions.includes("asymmetric_environmental_dominance") ? 104 : 94,
    ),
  );

  if (primaryCharacter) {
    candidates.push(
      seed(
        "relational_tension",
        "relational_distance_and_negative_space",
        secondaryCharacter
          ? `${primaryCharacter.label} / ${secondaryCharacter.label}`
          : primaryCharacter.label,
        secondaryCharacter
          ? "Use distance, eye-lines, gesture and a shared object to show power without stock embrace or confrontation."
          : `Show the contradiction between ${primaryCharacter.role ?? "public role"} and ${primaryCharacter.contradiction ?? primaryCharacter.meaning}.`,
        [
          primaryCharacter,
          ...(secondaryCharacter ? [secondaryCharacter] : []),
          ...(scene ? [scene] : []),
        ],
        context.process,
        primaryCharacter.label,
        unique([
          secondaryCharacter?.label ?? "",
          ...(primaryCharacter.props ?? []).slice(0, 2),
        ]),
        [
          "Hands, gaze and weight remain anatomically legible.",
          "Space between subjects is an active narrative shape.",
          ...quietRules,
        ],
        [
          primaryCharacter.silhouette ?? primaryCharacter.label,
          primaryCharacter.contradiction ?? primaryCharacter.meaning,
        ],
        [
          "generic hero stance",
          "floating heads",
          "beauty-poster retouching",
        ],
        markRules,
        !scene || scene.spoilerLevel !== "ending",
        95,
      ),
    );
  }

  if (scene) {
    candidates.push(
      seed(
        "consequence_moment",
        "aftermath_or_preaction_suspension",
        scene.label,
        "Choose the breath before or after obvious action. Show consequence and physical evidence, not a climax pose.",
        [scene, ...context.themes.slice(0, 2)],
        context.process,
        scene.label,
        [
          scene.physicalAction ?? "action evidence",
          scene.beforeOrAftermath ?? "consequence",
          setting.label,
        ],
        [
          "Frame consequence rather than peak action.",
          "Depth planes carry different information.",
          ...quietRules,
        ],
        [
          scene.physicalAction ?? scene.meaning,
          scene.beforeOrAftermath ?? scene.meaning,
          setting.label,
        ],
        [
          "peak-action splash art",
          "arbitrary sparks, debris or motion blur",
        ],
        markRules,
        safe(scene),
        context.profile.compositions.includes("aftermath_or_preaction_suspension") ? 107 : 97,
      ),
    );
  }

  if (technical(context.genre)) {
    candidates.push(
      seed(
        "systems_cutaway",
        "layered_cutaway",
        setting.label,
        "Expose structure, flow, failure mode and user consequence in label-ready geometry.",
        [setting, ...context.themes.slice(0, 2)],
        context.process,
        setting.label,
        [
          ...(setting.architecture ?? []),
          ...(setting.materials ?? []),
        ].slice(0, 4),
        [
          "Use orthographic, sectional or controlled oblique geometry.",
          "Reserve editable-label corridors.",
          "Line hierarchy separates structure, flow and context.",
        ],
        [
          ...(setting.architecture ?? []).slice(0, 3),
          ...(setting.materials ?? []).slice(0, 3),
        ],
        ["fake measurements", "generated labels", "decorative circuitry"],
        markRules,
        true,
        99,
      ),
    );
  }

  if (context.genre === "graphic_novel") {
    candidates.push(
      seed(
        "sequential_rhythm",
        "sequential_depth_rhythm",
        scene?.label ?? setting.label,
        "Design information, pressure and reaction as a sequence with stable geography and editable lettering.",
        [
          setting,
          ...(scene ? [scene] : []),
          ...(primaryCharacter ? [primaryCharacter] : []),
        ],
        context.process,
        scene?.label ?? setting.label,
        unique([
          primaryCharacter?.label ?? "",
          secondaryCharacter?.label ?? "",
          setting.label,
        ]),
        [
          "Establish geography before close pressure.",
          "Reserve balloon and caption shapes.",
          "Maintain camera-axis continuity.",
          "Final panel changes the reading question.",
        ],
        [setting.label, scene?.physicalAction ?? "clear sequential action"],
        [
          "every panel as splash art",
          "random Dutch angles",
          "baked-in dialogue",
        ],
        markRules,
        !scene || scene.spoilerLevel !== "ending",
        100,
      ),
    );
  }

  return candidates.sort(
    (left, right) => right.score - left.score
      || left.routeId.localeCompare(right.routeId),
  );
}

function seed(
  kind: BookCreativeRouteKind,
  composition: BookCreativeComposition,
  label: string,
  rationale: string,
  evidenceRecords: BookCreativeEvidenceV1[],
  processFamily: BookIllustrationProcessFamily,
  subject: string,
  supporting: string[],
  compositionRules: string[],
  mustShow: string[],
  mustAvoid: string[],
  markLogic: string[],
  safeValue: boolean,
  score: number,
): Seed {
  const evidenceIds = unique(
    evidenceRecords.map((record) => record.evidenceId),
  ).sort();
  const sourceLocationIds = unique(
    evidenceRecords.flatMap((record) => record.sourceLocationIds),
  ).sort();
  return {
    routeId: `route-${hash({ kind, composition, evidenceIds }).slice(0, 24)}`,
    routeKind: kind,
    composition,
    label,
    rationale,
    evidenceIds,
    sourceLocationIds,
    processFamily,
    tonalArchitecture: "Genre-specific value grouping with thumbnail clarity before detail.",
    colourLogic: [
      "Evidence-derived palette",
      "No automatic orange-blue grade",
    ],
    lightingLogic: [
      "Physically motivated light only",
      "No gratuitous rim light or glow",
    ],
    markLogic,
    subject,
    supporting: unique(supporting.filter(Boolean)),
    compositionRules: unique(compositionRules),
    mustShow: unique(mustShow.filter(Boolean)),
    mustAvoid: unique(mustAvoid),
    safe: safeValue,
    score,
  };
}

function distinct(routesToSelect: Seed[], count: number): Seed[] {
  const selected: Seed[] = [];
  for (const route of routesToSelect) {
    if (
      selected.some(
        (existing) => existing.routeKind === route.routeKind
          || existing.composition === route.composition,
      )
    ) {
      continue;
    }
    selected.push(route);
    if (selected.length === count) break;
  }
  return selected;
}

function blocked(
  identity: BookArtIdentityV1,
  blockers: string[],
  warnings: string[],
): BookCreativeDirectionResultV1 {
  return {
    outputKind: "evavo_art_book_creative_direction_result",
    schemaVersion: 1,
    contract: BOOK_CREATIVE_DIRECTION_CONTRACT,
    status: "blocked",
    identity,
    blockers: unique(blockers),
    warnings,
    providerCallPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    publicationPerformed: false,
  };
}

function evidence(
  value: unknown,
  label: string,
  minimum: number,
  blockers: string[],
): BookCreativeEvidenceV1[] {
  if (!Array.isArray(value)) {
    blockers.push(`${label} must be an array.`);
    if (minimum > 0) {
      blockers.push(`${label} requires at least ${minimum} records.`);
    }
    return [];
  }

  const output: BookCreativeEvidenceV1[] = value.map((item, index) => {
    const record = obj(item);
    const parsed: BookCreativeEvidenceV1 = {
      evidenceId: id(record.evidenceId, `${label}[${index}].evidenceId`, blockers),
      label: text(record.label, `${label}[${index}].label`, 2, 300, blockers),
      meaning: text(record.meaning, `${label}[${index}].meaning`, 10, 800, blockers),
      importance: int(record.importance, 1, 100, `${label}[${index}].importance`, blockers),
      sourceLocationIds: ids(
        record.sourceLocationIds,
        `${label}[${index}].sourceLocationIds`,
        1,
        blockers,
      ),
    };

    if (record.visualForms !== undefined) {
      parsed.visualForms = texts(
        record.visualForms,
        `${label}[${index}].visualForms`,
        1,
        blockers,
      );
    }
    if (record.materials !== undefined) {
      parsed.materials = texts(
        record.materials,
        `${label}[${index}].materials`,
        1,
        blockers,
      );
    }
    if (record.architecture !== undefined) {
      parsed.architecture = texts(
        record.architecture,
        `${label}[${index}].architecture`,
        1,
        blockers,
      );
    }
    if (record.role !== undefined) {
      parsed.role = text(record.role, `${label}[${index}].role`, 2, 300, blockers);
    }
    if (record.silhouette !== undefined) {
      parsed.silhouette = text(
        record.silhouette,
        `${label}[${index}].silhouette`,
        8,
        600,
        blockers,
      );
    }
    if (record.props !== undefined) {
      parsed.props = texts(
        record.props,
        `${label}[${index}].props`,
        0,
        blockers,
      );
    }
    if (record.contradiction !== undefined) {
      parsed.contradiction = text(
        record.contradiction,
        `${label}[${index}].contradiction`,
        8,
        600,
        blockers,
      );
    }
    if (record.spoilerLevel !== undefined) {
      parsed.spoilerLevel = spoiler(
        record.spoilerLevel,
        `${label}[${index}].spoilerLevel`,
        blockers,
      );
    }
    if (record.physicalAction !== undefined) {
      parsed.physicalAction = text(
        record.physicalAction,
        `${label}[${index}].physicalAction`,
        8,
        600,
        blockers,
      );
    }
    if (record.beforeOrAftermath !== undefined) {
      parsed.beforeOrAftermath = text(
        record.beforeOrAftermath,
        `${label}[${index}].beforeOrAftermath`,
        8,
        600,
        blockers,
      );
    }
    return parsed;
  });

  if (output.length < minimum) {
    blockers.push(`${label} requires at least ${minimum} records.`);
  }
  if (new Set(output.map((record) => record.evidenceId)).size !== output.length) {
    blockers.push(`${label} contains duplicate evidence IDs.`);
  }
  return output.sort(
    (left, right) => right.importance - left.importance
      || left.evidenceId.localeCompare(right.evidenceId),
  );
}

function identityOf(value: unknown, blockers: string[]): BookArtIdentityV1 {
  const record = obj(value);
  const parsed: BookArtIdentityV1 = {
    workspaceId: id(record.workspaceId, "identity.workspaceId", blockers),
    projectId: id(record.projectId, "identity.projectId", blockers),
    bookId: id(record.bookId, "identity.bookId", blockers),
    requestId: id(record.requestId, "identity.requestId", blockers),
  };
  if (record.editionId !== undefined) {
    parsed.editionId = id(record.editionId, "identity.editionId", blockers);
  }
  return parsed;
}

function manuscriptOf(
  value: unknown,
  blockers: string[],
): BookArtManuscriptBindingV1 {
  const record = obj(value);
  return {
    manuscriptRevisionId: id(
      record.manuscriptRevisionId,
      "manuscript.manuscriptRevisionId",
      blockers,
    ),
    manuscriptSha256: digest(
      record.manuscriptSha256,
      "manuscript.manuscriptSha256",
      blockers,
    ),
    extractedTextSha256: digest(
      record.extractedTextSha256,
      "manuscript.extractedTextSha256",
      blockers,
    ),
    visualCanonSha256: digest(
      record.visualCanonSha256,
      "manuscript.visualCanonSha256",
      blockers,
    ),
    artDirectionSha256: digest(
      record.artDirectionSha256,
      "manuscript.artDirectionSha256",
      blockers,
    ),
    approvedEvidenceIds: ids(
      record.approvedEvidenceIds,
      "manuscript.approvedEvidenceIds",
      1,
      blockers,
    ),
  };
}

function outputOf(
  value: unknown,
  blockers: string[],
): BookArtOutputRequirementV1 {
  const record = obj(value);
  const rawMimeTypes = record.allowedMimeTypes;
  const mimeTypes: BookArtOutputRequirementV1["allowedMimeTypes"] = [];
  if (!Array.isArray(rawMimeTypes)) {
    blockers.push("output.allowedMimeTypes must be an array.");
  } else {
    for (const [index, candidate] of rawMimeTypes.entries()) {
      if (
        typeof candidate !== "string"
        || !ALLOWED_MIME_TYPES.includes(
          candidate as (typeof ALLOWED_MIME_TYPES)[number],
        )
      ) {
        blockers.push(`output.allowedMimeTypes[${index}] is unsupported.`);
        continue;
      }
      mimeTypes.push(candidate as (typeof ALLOWED_MIME_TYPES)[number]);
    }
    if (new Set(mimeTypes).size !== mimeTypes.length) {
      blockers.push("output.allowedMimeTypes contains duplicates.");
    }
  }
  if (mimeTypes.length === 0) {
    blockers.push("output.allowedMimeTypes is invalid.");
  }

  const colourIntent = enumValue(
    record.colourIntent,
    COLOUR_INTENTS,
    "output.colourIntent",
    blockers,
    "rgb",
  );
  const alpha = enumValue(
    record.alpha,
    ALPHA_POLICIES,
    "output.alpha",
    blockers,
    "allowed",
  );
  const textPolicy = enumValue(
    record.textPolicy,
    TEXT_POLICIES,
    "output.textPolicy",
    blockers,
    "text_free",
  );

  return {
    widthPx: int(record.widthPx, 64, 100000, "output.widthPx", blockers),
    heightPx: int(record.heightPx, 64, 100000, "output.heightPx", blockers),
    ...(record.minimumPpi === undefined
      ? {}
      : {
          minimumPpi: int(
            record.minimumPpi,
            72,
            2400,
            "output.minimumPpi",
            blockers,
          ),
        }),
    allowedMimeTypes: unique(mimeTypes),
    colourIntent,
    alpha,
    textPolicy,
    printUse: bool(record.printUse, "output.printUse", blockers),
    digitalUse: bool(record.digitalUse, "output.digitalUse", blockers),
  };
}

function genreOf(value: unknown, blockers: string[]): BookCreativeGenre {
  if (typeof value !== "string" || !Object.hasOwn(P, value)) {
    blockers.push("primaryGenre is unsupported.");
    return "custom";
  }
  return value as BookCreativeGenre;
}

function purposeOf(value: unknown, blockers: string[]): BookArtPurpose {
  const supported: BookArtPurpose[] = [
    "front_cover_art",
    "full_wrap_art",
    "interior_full_page_illustration",
    "interior_half_page_illustration",
    "interior_spot_illustration",
    "diagram",
    "map",
    "ornament",
  ];
  if (typeof value !== "string" || !supported.includes(value as BookArtPurpose)) {
    blockers.push("purpose is unsupported.");
    return "front_cover_art";
  }
  return value as BookArtPurpose;
}

function processList(
  value: unknown,
  blockers: string[],
): BookIllustrationProcessFamily[] {
  const supported = new Set<BookIllustrationProcessFamily>([
    "relief_engraving",
    "intaglio_etching",
    "scratchboard",
    "brush_pen_halftone",
    "linocut",
    "lithographic_tone",
    "duotone",
    "risograph",
    "black_only",
    "graphic_novel_ink",
    "children_picture_book",
    "technical_plate",
    "cartographic_linework",
    "ornamental_print",
    "custom",
  ]);
  if (!Array.isArray(value)) {
    blockers.push("allowedProcessFamilies must be an array.");
    blockers.push("allowedProcessFamilies requires at least one supported process.");
    return [];
  }
  const output: BookIllustrationProcessFamily[] = [];
  for (const [index, candidate] of value.entries()) {
    if (
      typeof candidate !== "string"
      || !supported.has(candidate as BookIllustrationProcessFamily)
    ) {
      blockers.push(`allowedProcessFamilies[${index}] is unsupported.`);
      continue;
    }
    output.push(candidate as BookIllustrationProcessFamily);
  }
  if (output.length === 0) {
    blockers.push("allowedProcessFamilies requires at least one supported process.");
  }
  if (new Set(output).size !== output.length) {
    blockers.push("allowedProcessFamilies contains duplicates.");
  }
  return unique(output);
}

function generic(value: string, blockers: string[]): void {
  const lowered = value.toLowerCase();
  const hits = GENERIC.filter((phrase) => lowered.includes(phrase));
  if (hits.length > 0) {
    blockers.push(
      `Aesthetic intent uses generic provider shorthand: ${hits.join(", ")}.`,
    );
  }
  const concreteWordCount = new Set(
    lowered
      .replace(/[^a-z0-9\s-]/gu, " ")
      .split(/\s+/u)
      .filter((word) => word.length > 2),
  ).size;
  if (concreteWordCount < 8) {
    blockers.push(
      "Aesthetic intent must describe concrete mechanisms, materials, composition or reproduction.",
    );
  }
}

function text(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  blockers: string[],
): string {
  if (
    typeof value !== "string"
    || value.trim() !== value
    || value.length < minimum
    || value.length > maximum
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    blockers.push(
      `${label} must be trimmed text from ${minimum} to ${maximum} characters.`,
    );
    return "invalid";
  }
  return value;
}

function id(value: unknown, label: string, blockers: string[]): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 200
    || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)
    || ["__proto__", "constructor", "prototype"].includes(value)
  ) {
    blockers.push(`${label} is invalid.`);
    return "invalid";
  }
  return value;
}

function digest(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !/^(?:sha256:)?[a-f0-9]{64}$/u.test(value)) {
    blockers.push(`${label} must be SHA-256.`);
    return `sha256:${"0".repeat(64)}`;
  }
  return value.startsWith("sha256:") ? value : `sha256:${value}`;
}

function int(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
  blockers: string[],
): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    blockers.push(`${label} must be an integer from ${minimum} to ${maximum}.`);
    return minimum;
  }
  return value;
}

function bool(value: unknown, label: string, blockers: string[]): boolean {
  if (value !== true && value !== false) {
    blockers.push(`${label} must be boolean.`);
    return false;
  }
  return value;
}

function ids(
  value: unknown,
  label: string,
  minimum: number,
  blockers: string[],
): string[] {
  if (!Array.isArray(value)) {
    blockers.push(`${label} must be an array.`);
    if (minimum > 0) {
      blockers.push(`${label} requires at least ${minimum} values.`);
    }
    return [];
  }
  const output = value.map((candidate, index) =>
    id(candidate, `${label}[${index}]`, blockers),
  );
  if (output.length < minimum) {
    blockers.push(`${label} requires at least ${minimum} values.`);
  }
  if (new Set(output).size !== output.length) {
    blockers.push(`${label} contains duplicates.`);
  }
  return unique(output).sort();
}

function texts(
  value: unknown,
  label: string,
  minimum: number,
  blockers: string[],
): string[] {
  if (!Array.isArray(value)) {
    blockers.push(`${label} must be an array.`);
    if (minimum > 0) {
      blockers.push(`${label} requires at least ${minimum} values.`);
    }
    return [];
  }
  const output = value.map((candidate, index) =>
    text(candidate, `${label}[${index}]`, 1, 1000, blockers),
  );
  if (output.length < minimum) {
    blockers.push(`${label} requires at least ${minimum} values.`);
  }
  return unique(output);
}

type SpoilerLevel = NonNullable<BookCreativeEvidenceV1["spoilerLevel"]>;

function spoiler(
  value: unknown,
  label: string,
  blockers: string[],
): SpoilerLevel {
  const supported: readonly SpoilerLevel[] = ["none", "minor", "major", "ending"];
  if (typeof value !== "string" || !supported.includes(value as SpoilerLevel)) {
    blockers.push(`${label} is invalid.`);
    return "ending";
  }
  return value as SpoilerLevel;
}

function zone(
  value: unknown,
  label: string,
  blockers: string[],
): BookCreativeDirectionInputV1["titleZone"] {
  const supported = ["top", "upper_third", "centre", "lower_third"] as const;
  if (
    typeof value !== "string"
    || !supported.includes(value as (typeof supported)[number])
  ) {
    blockers.push(`${label} is invalid.`);
    return "top";
  }
  return value as BookCreativeDirectionInputV1["titleZone"];
}

function time(value: unknown, blockers: string[]): string {
  if (
    typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    blockers.push("requestedAt must be a real canonical UTC timestamp.");
    return "1970-01-01T00:00:00.000Z";
  }
  return value;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  supported: T,
  label: string,
  blockers: string[],
  fallback: T[number],
): T[number] {
  if (typeof value !== "string" || !supported.includes(value)) {
    blockers.push(`${label} is invalid.`);
    return fallback;
  }
  return value as T[number];
}

function obj(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safe(value: BookCreativeEvidenceV1): boolean {
  return value.spoilerLevel === undefined
    || value.spoilerLevel === "none"
    || value.spoilerLevel === "minor";
}

function cover(value: BookArtPurpose): boolean {
  return value === "front_cover_art" || value === "full_wrap_art";
}

function technical(value: BookCreativeGenre): boolean {
  return value === "technical" || value === "reference" || value === "academic";
}

function evidenceHeavy(value: BookCreativeGenre): boolean {
  return [
    "historical",
    "memoir",
    "documentary",
    "technical",
    "reference",
    "academic",
    "cookbook",
  ].includes(value);
}

function characterDriven(value: BookCreativeGenre): boolean {
  return [
    "literary",
    "historical",
    "horror",
    "mythic",
    "grimdark_fantasy",
    "crime",
    "romance",
    "children",
    "memoir",
    "graphic_novel",
    "pulp",
    "poetry",
  ].includes(value);
}

function hash(value: unknown): string {
  return fingerprintBookIllustrationValue(value).replace(/^sha256:/u, "");
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
