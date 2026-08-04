export async function readDocsSuiteRequestContext() {
  return {
    workspaceId: "workspace-validation",
    actorType: "automation" as const,
    scopes: ["documents:read", "documents:write"],
  };
}
