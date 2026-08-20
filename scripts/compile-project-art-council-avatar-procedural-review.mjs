#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileCouncilAvatarProceduralReview,
  councilAvatarProceduralReviewCapabilities,
} from './project-art/council-avatar-procedural-review.mjs';

function parseArgs(argv) {
  const command = argv[0];
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !name?.startsWith('--') ||
      !value ||
      value.startsWith('--') ||
      values.has(name)
    ) {
      throw new Error('arguments must be unique --name value pairs');
    }
    values.set(name, value);
  }
  return { command, values };
}

export async function main(argv = process.argv.slice(2)) {
  const { command, values } = parseArgs(argv);
  if (!['summary', 'compile', 'capabilities'].includes(command)) {
    throw new Error(
      'usage: compile-project-art-council-avatar-procedural-review.mjs <summary|compile|capabilities> [--output <create-only.json>]',
    );
  }
  if (command === 'capabilities') {
    process.stdout.write(
      `${JSON.stringify(councilAvatarProceduralReviewCapabilities())}\n`,
    );
    return;
  }
  const review = compileCouncilAvatarProceduralReview();
  if (command === 'summary') {
    process.stdout.write(
      `${JSON.stringify({
        status: 'passed',
        schema: review.schema,
        version: review.version,
        reviewSha256: review.reviewSha256,
        canonicalSeatCount: review.canonicalSeatCount,
        characterCount: review.characterCount,
        previewOnlyCharacterCount: review.previewOnlyCharacterCount,
        totalReviewClipCount: review.totalReviewClipCount,
        providerExecution: false,
        identityApproval: false,
        productionAdmission: false,
        runtimeActivation: false,
        websiteActivation: false,
      })}\n`,
    );
    return;
  }
  const output = values.get('--output');
  if (!output) throw new Error('compile requires --output <create-only.json>');
  const absolute = path.resolve(output);
  await writeFile(absolute, `${JSON.stringify(review, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(
    `${JSON.stringify({
      status: 'passed',
      output: absolute,
      reviewSha256: review.reviewSha256,
      providerExecution: false,
      identityApproval: false,
      productionAdmission: false,
      runtimeActivation: false,
      websiteActivation: false,
    })}\n`,
  );
}

const directlyInvoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (directlyInvoked) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 2;
  });
}
