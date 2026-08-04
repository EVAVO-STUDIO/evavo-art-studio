export type ValidationDocsSuiteRequestContext = Readonly<{
  actorType: string;
  workspaceId: string;
  scopes: readonly string[];
}>;

let currentContext: ValidationDocsSuiteRequestContext | null = null;

export function setDocsSuiteRequestContextForTest(
  context: ValidationDocsSuiteRequestContext | null,
): void {
  currentContext = context;
}

export async function readDocsSuiteRequestContext(): Promise<ValidationDocsSuiteRequestContext | null> {
  return currentContext;
}
