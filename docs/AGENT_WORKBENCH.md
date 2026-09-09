# Art Studio Agent Workbench

Art Studio now exposes the same deterministic agent-workbench contract used by Brain and Development Studio. It is designed for ChatGPT/Codex, Claude and MCP-compatible agents that need to understand a very large creative tool surface without memorising package scripts or bypassing the preferred image workflow routers.

## Commands

```powershell
node scripts/agent-workbench.mjs --objective "repair sprite transparency and preserve pixel edges"
node scripts/agent-workbench.mjs --objective "build and review a character animation loop" --limit 30
node scripts/agent-workbench.mjs --all
node scripts/agent-workbench.mjs --self-test
```

For cross-estate routing, an agent may explicitly add current Development Studio evidence:

```powershell
node scripts/agent-workbench.mjs `
  --tool-registry ..\evavo-development-studio\config\agent-tool-registry.json `
  --estate-snapshot <fresh-capability-estate-snapshot.json> `
  --objective "2D art plus Godot runtime integration"
```

The compiler performs no candidate command execution and no file mutation. It inventories `evavo.capabilities.json` and `package.json`, binds them by SHA-256, and ranks the capabilities/scripts/tools that best fit the objective.

## Creative operating sequence

The Art Studio sequence is **source -> route -> plan -> candidate -> technical QA -> creative review -> master/deliver**.

This reinforces existing rules rather than replacing them:

- immutable RAW_ART and references are evidence, never scratch files;
- Image Workflow Router v2 remains the preferred high-level image-task discovery surface;
- provider output is an unapproved candidate;
- technical QA does not automatically approve identity, silhouette, composition, timing or style;
- exact source/reference/mask/frame lineage stays attached to the candidate;
- mastered output still needs destination-specific runtime/integration admission;
- Art Studio has no implicit target-repository commit/push/publication authority.

## What agents gain

The snapshot exposes capability effects, requirements, entrypoints and package automation as separate categories. That lets an agent distinguish, for example, a read-only review route from a provider executor, an alpha mastering command from a creative approval boundary, or a delivery optimizer from Godot runtime integration.

Use `docs/ARTIST_AUTOMATION_CAPABILITY_MAP.md` and `docs/IMAGE_WORKFLOW_ROUTER_V2.md` for the detailed domain routing rules. Use the workbench to choose where to start and which evidence/authority is still missing.
