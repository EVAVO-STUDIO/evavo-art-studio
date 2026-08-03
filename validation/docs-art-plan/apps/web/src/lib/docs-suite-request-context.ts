export interface DocsSuiteRequestContext {
  workspaceId: string;
  actorType: string;
  scopes: string[];
}

export async function readDocsSuiteRequestContext(): Promise<DocsSuiteRequestContext | null> {
  return null;
}
