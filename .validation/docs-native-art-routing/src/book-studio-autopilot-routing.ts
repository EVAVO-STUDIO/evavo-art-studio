import {
  compileBookStudioAutopilot as compileBookStudioAutopilotBase,
  type BookStudioAutopilotActionV1,
  type BookStudioAutopilotDependencies,
  type BookStudioAutopilotResultV1,
} from "./book-studio-autopilot";
import {
  canonicalBookJson,
  sha256BookText,
} from "./book-studio-project-contracts";

export const BOOK_STUDIO_AUTOPILOT_ROUTING_CONTRACT =
  "evavo_docs_book_autopilot_routing_v1" as const;

export const BOOK_STUDIO_ART_PROVIDER_STAGE_IDS = Object.freeze([
  "cover_visual_routes",
  "illustration_production",
] as const);

export type BookStudioArtProviderStageId =
  (typeof BOOK_STUDIO_ART_PROVIDER_STAGE_IDS)[number];

export interface BookStudioRoutedAutopilotActionV1
  extends Omit<BookStudioAutopilotActionV1, "actionKind"> {
  actionKind:
    | BookStudioAutopilotActionV1["actionKind"]
    | "art_production";
  targetService?: "docs_suite" | "writing_studio" | "art_studio";
  targetContract?: string;
  preparationOperation?: "writing_art.compile_release";
}

export interface BookStudioRoutedAutopilotResultV1
  extends Omit<
    BookStudioAutopilotResultV1,
    "action" | "resultFingerprint"
  > {
  action?: BookStudioRoutedAutopilotActionV1;
  routingContract: typeof BOOK_STUDIO_AUTOPILOT_ROUTING_CONTRACT;
  resultFingerprint: string;
}

const ART_STAGE_SET = new Set<string>(BOOK_STUDIO_ART_PROVIDER_STAGE_IDS);

export function isBookStudioArtProviderStage(
  stageId: unknown,
): stageId is BookStudioArtProviderStageId {
  return typeof stageId === "string" && ART_STAGE_SET.has(stageId);
}

export async function compileRoutedBookStudioAutopilot(
  input: unknown,
  dependencies: BookStudioAutopilotDependencies = {},
): Promise<BookStudioRoutedAutopilotResultV1> {
  const source = await compileBookStudioAutopilotBase(input, dependencies);
  const action = routeAction(source.action);
  const warnings = action?.actionKind === "art_production"
    ? unique([
        ...source.warnings,
        "Visual provider work is owned by Art Studio and must not be sent to Writing Studio.",
      ])
    : source.warnings;

  const withoutFingerprint: Omit<
    BookStudioRoutedAutopilotResultV1,
    "resultFingerprint"
  > = {
    ...omitResultFingerprint(source),
    ...(action === undefined ? {} : { action }),
    warnings,
    routingContract: BOOK_STUDIO_AUTOPILOT_ROUTING_CONTRACT,
  };
  return {
    ...withoutFingerprint,
    resultFingerprint: await sha256BookText(
      canonicalBookJson(withoutFingerprint),
    ),
  };
}

function routeAction(
  action: BookStudioAutopilotActionV1 | undefined,
): BookStudioRoutedAutopilotActionV1 | undefined {
  if (!action) return undefined;
  if (
    action.actionKind === "writing_candidate" &&
    isBookStudioArtProviderStage(action.stageId)
  ) {
    return {
      ...action,
      actionKind: "art_production",
      targetService: "art_studio",
      targetContract: "evavo_docs_book_art_release_shadow_runtime_v1",
      preparationOperation: "writing_art.compile_release",
      dispatchPath: "/v1/book-art/docs-releases/submit",
      requestCompilationRequired: true,
      instruction: [
        action.instruction,
        "Compile the exact Docs Suite writing-to-art release, submit one no-fallback Art Studio shadow job, and retain the resulting candidate as unapproved until QA, selection, promotion and Book-use binding pass.",
      ].join(" "),
    };
  }
  if (action.actionKind === "writing_candidate") {
    return {
      ...action,
      targetService: "writing_studio",
      targetContract: "evavo_docs_book_candidate_runtime_v1",
    };
  }
  if (action.actionKind === "docs_operation") {
    return {
      ...action,
      targetService: "docs_suite",
      targetContract: "evavo_docs_book_operation_v1",
    };
  }
  return { ...action };
}

function omitResultFingerprint(
  value: BookStudioAutopilotResultV1,
): Omit<BookStudioAutopilotResultV1, "resultFingerprint"> {
  const { resultFingerprint: _discarded, ...unsigned } = value;
  return unsigned;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
