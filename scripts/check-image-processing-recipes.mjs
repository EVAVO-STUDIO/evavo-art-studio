#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';
const registry = JSON.parse(await readFile(new URL('../config/image-processing-recipes.v1.json', import.meta.url), 'utf8'));
const compiler = await readFile(new URL('./compile-image-processing-plan.mjs', import.meta.url), 'utf8');
const errors = [];
if (registry.schema !== 'evavo.image-processing-recipes.v1') errors.push('registry identity changed');
for (const required of ['python-pillow','imagemagick','powershell-system-drawing']) if (!registry.processors.some(item=>item.id===required)) errors.push(`missing processor ${required}`);
for (const capability of ['inspect','crop-safe','canvas-normalize','resize','convert','optimize','alpha-analyze']) if (!registry.processors.some(item=>item.capabilities.includes(capability))) errors.push(`missing capability ${capability}`);
for (const token of ['fallbackProcessors','decoded-dimensions','alpha-usage','sourceOverwrite: false','createOnlyOutput: true','providerExecution: false']) if (!compiler.includes(token)) errors.push(`compiler lost ${token}`);
if (registry.rules.sourceOverwriteAllowed !== false || registry.rules.providerGenerationIsSeparate !== true || registry.rules.humanCreativeApprovalIsSeparate !== true) errors.push('authority boundary changed');
for (const error of errors) console.log(`  - ${error}`);
if (errors.length) process.exit(1);
console.log('EVAVO image processing recipes passed');
