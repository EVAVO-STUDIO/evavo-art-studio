# Runtime operations dashboard

## Purpose

The runtime operations dashboard is the private owner control room for Art Studio's durable execution layer. It provides a visual surface for jobs, attempts, leases, failures, immutable events and content-addressed artifacts without allowing browser JavaScript to hold the Art Studio API control token.

The route is:

```text
/operations
```

It is linked from the main studio but remains locked until the complete server-only boundary is configured.

## Trust topology

```text
owner browser
    |
    | one-time owner access token
    v
Next.js /api/operator/session
    |
    | HMAC-signed HttpOnly SameSite=Strict cookie
    v
whitelisted /api/operator/* routes
    |
    | server-only EVAVO_ART_WRITE_TOKEN
    v
standalone Art Studio API
    |
    +-- durable runtime journal
    +-- immutable artifact store
    +-- worker processes
```

The browser never receives:

- `EVAVO_ART_WRITE_TOKEN`;
- the operator session signing secret;
- local runtime or artifact root configuration;
- provider credentials;
- arbitrary proxy or filesystem access.

## Required configuration

The Next.js web process requires:

```text
EVAVO_ART_OPERATOR_ACCESS_TOKEN=<at least 32 bytes>
EVAVO_ART_OPERATOR_SESSION_SECRET=<at least 32 bytes>
EVAVO_ART_OPERATOR_SESSION_SECONDS=28800
EVAVO_ART_API_BASE_URL=http://127.0.0.1:4100
EVAVO_ART_WRITE_TOKEN=<same server-side control token as the API>
```

The standalone API process still requires:

```text
EVAVO_ART_ALLOW_WRITES=true
EVAVO_ART_WRITE_TOKEN=<at least 32 bytes>
EVAVO_ART_RUNTIME_ROOT=.art-studio/runtime
EVAVO_ART_ARTIFACT_ROOT=.art-studio/artifacts
```

The owner access token and API control token should be different secrets. The former establishes an owner browser session; the latter authenticates the Next.js server to the standalone API.

Changing the session secret invalidates every current browser session. Changing the access token prevents new sessions but does not invalidate already signed sessions until expiry. For immediate invalidation, rotate both.

## Session contract

A successful unlock creates a versioned session claim containing:

- fixed owner subject;
- issue time;
- expiry time;
- random 128-bit session ID;
- HMAC-SHA-256 signature.

The cookie is:

- HttpOnly;
- SameSite Strict;
- Secure in production;
- scoped to `/`;
- assigned high cookie priority;
- inaccessible to application JavaScript.

The access token is compared through SHA-256 digests and `timingSafeEqual`. It is cleared from component state after the exchange and is never persisted in local storage or session storage.

## Gateway contract

The operator gateway is not a generic reverse proxy. It exposes only explicit routes for:

```text
GET|POST /api/operator/runtime/jobs
GET      /api/operator/runtime/jobs/:jobId
POST     /api/operator/runtime/jobs/:jobId/cancel
POST     /api/operator/runtime/jobs/:jobId/pause
POST     /api/operator/runtime/jobs/:jobId/resume
POST     /api/operator/runtime/jobs/:jobId/redrive
GET      /api/operator/runtime/events
POST     /api/operator/runtime/recover
GET      /api/operator/artifacts/:artifactId
GET      /api/operator/artifacts/:artifactId?verify=true
```

Dynamic job, action and artifact identifiers are validated before an upstream URL is constructed. The gateway also enforces:

- same-origin browser requests;
- expiring signed owner sessions;
- an in-process supplementary request-rate ceiling;
- bounded request bodies;
- bounded upstream responses;
- API request timeouts;
- no redirects;
- no-store responses;
- restrictive response security headers;
- server-authenticated actor labels.

The standalone API remains responsible for its own token validation and runtime state-machine rules. The gateway cannot bypass a lease, idempotency or transition failure.

## Dashboard functions

The dashboard provides:

- session state and expiry;
- manual and ten-second automatic refresh;
- state, queue and job-kind filters;
- visible, active, ready, attention and succeeded metrics;
- job priority, state, attempts and update recency;
- complete job detail;
- capabilities, timeout, lease, deadline and retry schedule;
- current lease and worker identity;
- cancellation and pause request evidence;
- dependency, payload and label inspection;
- immutable attempt history and heartbeat counts;
- failure classification, code, message and details;
- input and output artifact inspection;
- descriptor and content hash verification;
- recent immutable event evidence;
- idempotent JSON job submission;
- pause, resume, cancel and redrive controls;
- explicit expired-lease recovery;
- two-step confirmation for state-changing job controls.

Payloads are collapsed by default because they may contain private local repository paths.

## Worker separation

The web process does not execute jobs. Submitting `sprite.atlas.build` creates or returns a durable job. A separately running worker must claim it:

```powershell
pnpm worker:until-idle
```

or:

```powershell
pnpm dev:worker
```

Worker execution, provider calls and native Godot finalisation remain outside the web process. The dashboard only observes and controls the authoritative runtime.

## Local startup

One practical local layout is:

```powershell
# Terminal 1: standalone API
$env:EVAVO_ART_ALLOW_WRITES = "true"
$env:EVAVO_ART_WRITE_TOKEN = "<server-only-token-at-least-32-bytes>"
$env:EVAVO_ART_RUNTIME_ROOT = ".art-studio\runtime"
$env:EVAVO_ART_ARTIFACT_ROOT = ".art-studio\artifacts"
pnpm dev:api

# Terminal 2: Next.js web control plane
$env:EVAVO_ART_OPERATOR_ACCESS_TOKEN = "<separate-owner-token-at-least-32-bytes>"
$env:EVAVO_ART_OPERATOR_SESSION_SECRET = "<session-secret-at-least-32-bytes>"
$env:EVAVO_ART_API_BASE_URL = "http://127.0.0.1:4100"
$env:EVAVO_ART_WRITE_TOKEN = "<same-server-only-api-token>"
pnpm dev

# Terminal 3: durable worker
$env:EVAVO_ART_ALLOWED_ROOTS = "C:\GitRepos"
$env:EVAVO_ART_RUNTIME_ROOT = ".art-studio\runtime"
$env:EVAVO_ART_ARTIFACT_ROOT = ".art-studio\artifacts"
pnpm dev:worker
```

Then open:

```text
http://localhost:4200/operations
```

## Deployment boundary

A Vercel-hosted web control plane should not rely on Vercel's ephemeral filesystem for runtime state or large artifact objects. The dashboard may be hosted there if `EVAVO_ART_API_BASE_URL` points to a reviewed authenticated API deployment, but the API, durable workers, PostgreSQL transport and artifact storage require their own production topology.

Before changing the EVAVO hub preview card to available:

1. deploy the web control plane and standalone API;
2. replace manual owner-token unlock with the signed EVAVO hub launch handoff or bind the launch to the same session issuer;
3. prove API token isolation through browser inspection;
4. prove session expiry and secret rotation;
5. prove worker loss, lease recovery and job redrive;
6. prove artifact verification and approved-reference conflicts;
7. run an actual PostgreSQL/pg-boss failure drill when distributed workers are enabled;
8. run native Godot output smoke tests on the authenticated engine worker;
9. retain client assignment as a later explicit release decision.

## Deliberate limitations

This slice does not yet include:

- signed launch directly from `next-website`;
- multi-user role-based dashboard permissions;
- distributed rate limiting;
- push updates through WebSocket or Server-Sent Events;
- aggregated event pagination in the runtime repository itself;
- a hosted artifact binary download service;
- automated provider-generation job handlers;
- a visual worker registration and capacity page.

Those additions must preserve server-only credentials, the same runtime state machine and immutable evidence boundaries.
