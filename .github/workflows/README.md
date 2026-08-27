# GitHub Actions intentionally inactive

EVAVO Art Studio has no active GitHub Actions workflows. The authoritative build, test and validation path runs locally on the governed Windows workstation through `node scripts/local-quality-gate.mjs` and the repository pre-push hook.

Legacy workflow definitions are preserved only as inert reference material under `ops/github-actions-reference/workflows`. Moving or copying YAML back into this directory is a budget and architecture change that requires an explicit decision; the local hosted-automation policy check fails closed if active workflow YAML appears here.
