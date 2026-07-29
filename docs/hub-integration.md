# EVAVO hub integration

The canonical application key is `art-studio` and the module identifier is `art-production-workspace`. The source manifest is `hub/application.json`.

The application should enter `EVAVO-STUDIO/next-website` as a `federated-candidate` while the standalone deployment and signed handoff are being verified. The hub card can expose planning and readiness metadata, but it must not pretend that local workers, provider credentials or production queues are available until health and launch checks pass.

Recommended deployment contract:

- repository: `EVAVO-STUDIO/evavo-art-studio`;
- production host: `art.evavo.com.au`;
- launch: short-lived signed payload containing actor, organisation, workspace, application key, permissions, expiry and nonce;
- callback: signed completion or status events, never arbitrary browser-supplied job state;
- client surface: project status, briefs, comparisons, evidence and approved downloads;
- owner surface: provider routing, credentials, worker registration, policy thresholds, destructive actions and write-back approval.

The next-website registry entry should be generated from the manifest rather than copied by hand once the hub contract generator is added. This avoids drift between repository metadata, the application catalogue, permissions and the rendered card.
