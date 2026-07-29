# Technology decisions

## Selected foundation

| Concern | Selection | Reason |
| --- | --- | --- |
| Workspace | pnpm 10 monorepo | Fast, deterministic workspace linking and clean package boundaries. |
| Language | TypeScript 5.9 on Node 22+ | Shared contracts across API, CLI, MCP and web; strong Windows support. |
| Web | Next.js 16 App Router + React 19 | Matches the EVAVO platform direction and supports a standalone signed hub application. |
| API | Fastify 5 + JSON Schema + OpenAPI | Schema-first request and response handling, low overhead and generated API documentation. The first slice uses a dependency-light Node HTTP adapter while the domain stabilises. |
| Agent protocol | MCP TypeScript SDK v2 | The stable 2026-07-28 SDK line provides stdio and Streamable HTTP transports. The first executable adapter is local stdio; remote transport will reuse the same tool service. |
| Runtime validation | Zod 4 at boundaries | MCP-compatible schemas and JSON Schema export for API and structured-output use. Core domain types remain provider-neutral. |
| Durable jobs | PostgreSQL + pg-boss | Persistent retries, scheduling, backpressure and transactional queueing without adding Redis. |
| Object storage | Local content-addressed store + S3-compatible adapter | Works offline first, then Cloudflare R2, MinIO or another object store without changing manifests. |
| Raster processing | Sharp/libvips | Fast metadata, alpha, colour, composite, resize and modern image encoding on Windows and Linux. |
| Animation/video | FFmpeg/ffprobe | Frame extraction, timing, format conversion, contact sheets and cinematic encoding. |
| Advanced image operations | ImageMagick 7 | Colour-profile, morphology, compare and specialist command-line operations not covered cleanly by Sharp. |
| Vision QA | Python worker with OpenCV, NumPy, Pillow, scikit-image and optional ONNX Runtime | Edge, seam, motion, periodic-grid, segmentation and consistency analysis can evolve independently from the TypeScript control plane. |
| Atlas production | governed MaxRects packer with padding/extrusion + target exporters | Prevents a web-engine-specific atlas format from becoming the core contract. PixiJS AssetPack can remain an optional web adapter. |
| Observability | structured JSON logs, OpenTelemetry traces and immutable job events | Makes autonomous runs diagnosable and supports the EVAVO operations platform. |
| Testing | Node test runner for domain packages, Vitest/Playwright for web, fixture-based media regression | Keeps deterministic core tests light while allowing rendered and browser verification. |

## Dependency rules

1. `contracts` depends on no app, provider or media package.
2. `core` may depend only on contracts and deterministic utilities.
3. Provider adapters cannot write final deliverables directly.
4. Media and quality packages consume explicit work items and produce evidence.
5. UI, API, CLI and MCP are adapters over the same application services.
6. Godot output is a target adapter, not a special-case branch inside generation logic.
7. Optional GPU or model dependencies stay in workers so the control plane remains installable on an ordinary Windows machine.

## Package introduction order

1. Contracts, planner, repository inspector, CLI and API foundation.
2. Zod boundary schemas, Fastify/OpenAPI and remote MCP transport hardening.
3. Durable job runtime and local content-addressed artifact store.
4. Sharp/FFmpeg deterministic media worker and fixture suite.
5. Transparency, edge, animation and atlas QA.
6. Provider SDK and first generation/editing adapters.
7. Next.js production workspace and signed EVAVO hub launch.
8. Godot 4.6.2 exporter, repository change plan and safe write-back.
9. Python vision worker and advanced consistency scoring.
10. Automated benchmark corpus, visual regression and provider-routing learning.
