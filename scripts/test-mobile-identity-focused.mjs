#!/usr/bin/env node

await import('./test-mobile-identity-production.mjs');
await import('./test-mobile-identity-provider-request.mjs');
await import('./test-mobile-identity-execution-plan.mjs');
await import('./test-mobile-identity-provider-runtime-contract.mjs');
await import('./test-mobile-identity-provider-runner.mjs');

console.log('Focused mobile identity production chain passed.');
