#!/usr/bin/env node
import fs from 'node:fs';
import { admitGameProductionPlan } from '../scripts/game-production-intake.mjs';

const args = process.argv.slice(2);
const one = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const many = name => args.flatMap((value, index) => value === name && args[index + 1] ? [args[index + 1]] : []);
const planPath = one('--plan') ?? args.find(value => !value.startsWith('--'));
if (!planPath) throw new Error('Usage: node tools/game_production_intake_cli.mjs --plan <plan.json> [--gate-receipt <gate-receipt.json>] [--completed-receipt <receipt.json>] [--out <file>]');
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const gateReceipts = many('--gate-receipt').map(path => JSON.parse(fs.readFileSync(path, 'utf8')));
const completedReceipts = many('--completed-receipt').map(path => JSON.parse(fs.readFileSync(path, 'utf8')));
const result = admitGameProductionPlan(plan, { gateReceipts, completedReceipts });
const text = JSON.stringify(result, null, 2) + '\n';
const out = one('--out');
if (out) fs.writeFileSync(out, text); else process.stdout.write(text);
