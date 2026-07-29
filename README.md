# EVAVO Art Studio

EVAVO Art Studio is a governed art-production platform for professional game, digital and print assets. It inspects a project, understands its design and art direction, calculates the complete asset inventory, creates and revises artwork through explicit stages, masters transparent sprites and animation, and exports evidence-backed delivery packages.

This repository is intentionally broader than an image generator. It is the shared production engine behind a premium web control plane, versioned REST API, local CLI, MCP tools for ChatGPT and Claude, durable workers, provider adapters and engine-specific exporters.

## Working foundation

- portable art brief, work-order, quality-gate, deliverable and repository-snapshot contracts;
- deterministic production-plan compiler with dependency, approval and capability assignment;
- safe local repository inspector with Godot project and existing-art detection;
- JSON-first CLI for validation, planning and repository inspection;
- versioned REST foundation for capabilities, plans and guarded repository inspection;
- Next.js control-plane workspace with an interactive production-plan compiler;
- MCP v2 stdio server exposing the same capabilities to ChatGPT, Claude and compatible agents;
- EVAVO hub manifest for a signed federated launch at `art.evavo.com.au`;
- architecture, technology, quality and hub-integration decisions;
- CI validation for type checks, tests and builds.

## First commands

```powershell
pnpm install
pnpm check
pnpm art -- validate --input examples/game-art-brief.json
pnpm art -- plan --input examples/game-art-brief.json --output art-plan.json
pnpm art -- inspect --repo C:\GitRepos\your-game --output repo-art-snapshot.json
pnpm dev
pnpm dev:api
pnpm dev:mcp
```

The web workspace starts at `http://localhost:4200`. The standalone API starts on `127.0.0.1:4100` by default and exposes:

- `GET /health`
- `GET /v1/capabilities`
- `POST /v1/plans`
- `POST /v1/repositories/inspect`

Repository inspection is restricted to `EVAVO_ART_ALLOWED_ROOTS`. On Windows, separate allowed roots with `;`. Provider secrets belong on workers and are never exposed to the browser or embedded in briefs.

## Core rule

A provider response is never a final asset. Every final asset must pass the declared production stages, deterministic mastering, blocking quality gates, metadata generation and evidence bundling.

See `docs/architecture.md`, `docs/technology-decisions.md`, `docs/quality-system.md` and `docs/hub-integration.md`.
