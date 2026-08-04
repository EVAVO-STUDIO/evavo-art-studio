export interface DocsSuiteValidationRequestContext {
  workspaceId: string;
  actorType: string;
  scopes: string[];
}

export async function readDocsSuiteRequestContext(): Promise<DocsSuiteValidationRequestContext | null> {
  return null;
}
