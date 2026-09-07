import test from 'node:test';
import assert from 'node:assert/strict';
import { admitGameProductionPlan, createGameProductionReceipt } from './game-production-intake.mjs';

const base = { kind:'creative-production-packet', status:'queued-not-executed', sourceDigest:'d', sourceAssetId:'a', sourceCategory:'environment', title:'Asset', brief:{}, acceptance:[], sourceRefs:[], notes:[], authority:{execute:false,approve:false,mutateConsumerRepository:false,publish:false} };
const env = { ...base, id:'a/01-environment-studio', studio:'environment-studio', repository:'EVAVO-STUDIO/environment-studio', operation:'compile-environment-production-brief', deliverable:'environment spec', dependsOn:['gate/style-approved'] };
const art = { ...base, id:'a/02-art-studio', studio:'art-studio', repository:'EVAVO-STUDIO/evavo-art-studio', operation:'produce-environment-key-art', deliverable:'reviewed visual target', dependsOn:[env.id] };
const directArt = { ...art, id:'ui/01-art-studio', sourceAssetId:'ui', sourceCategory:'ui', operation:'produce-game-ui', deliverable:'runtime UI art', dependsOn:['gate/style-approved'] };
const styleGate = { id:'gate/style-approved', status:'required', owner:'art-studio', requirement:'Approved style target required.' };
const planFor = packets => ({ kind:'creative-production-plan', schemaVersion:'1.0.0', source:{sourceDigest:'d'}, gates:[styleGate], implementationGate:{id:'gate/implementation-ready',status:'blocked-until-reviewed',dependsOn:['gate/asset-review'],requirement:'Reviewed assets required.'}, packets });
const envReceipt = { kind:'creative-production-receipt', schemaVersion:'1.0.0', status:'completed-reviewed', packetId:env.id, sourceDigest:'d', studio:env.studio, repository:env.repository, operation:env.operation, artifactRevision:{id:'env-v2',digest:'sha256:env'}, evidenceRefs:[{kind:'environment-review',ref:'env-review.json'}], review:{status:'reviewed',reviewer:'environment-review',evidenceDigest:'sha256:review'}, authority:{executesProduction:false,grantsCreativeApproval:false,mutatesConsumerRepository:false,publishes:false} };
const styleGateReceipt = { kind:'creative-production-gate-receipt', schemaVersion:'1.0.0', status:'approved-reviewed', gateId:'gate/style-approved', sourceDigest:'d', gateDependencies:[], evidenceRefs:[{kind:'style-approval',ref:'review/style.json',digest:'sha256:style'}], review:{status:'reviewed',reviewer:'art-director',evidenceDigest:'sha256:style'}, authority:{recordsExternalApproval:true,executesProduction:false,grantsAdditionalApproval:false,mutatesConsumerRepository:false,publishes:false} };

test('art packet requires exact reviewed predecessor receipt', () => assert.equal(admitGameProductionPlan(planFor([env,art])).status, 'blocked-on-dependencies'));

test('environment receipt cannot unlock art until its own style gate chain is valid', () => {
  const blocked = admitGameProductionPlan(planFor([env,art]), { completedReceipts:[envReceipt] });
  assert.equal(blocked.readyCount,0);
  assert.equal(blocked.packets[0].intake.blockers[0].code,'PREDECESSOR_CHAIN_INVALID');
  const ready = admitGameProductionPlan(planFor([env,art]), { gateReceipts:[styleGateReceipt], completedReceipts:[envReceipt] });
  assert.equal(ready.readyCount,1);
  assert.equal(ready.packets[0].intake.resolvedDependencies[0].artifactRevision.id,'env-v2');
  assert.equal(ready.packets[0].intake.executionAuthorized,false);
});

test('direct art production requires a reviewed style gate receipt', () => {
  const blocked = admitGameProductionPlan(planFor([directArt]));
  assert.equal(blocked.readyCount,0);
  assert.equal(blocked.packets[0].intake.blockers[0].code,'GATE_RECEIPT_REQUIRED');
  assert.throws(() => admitGameProductionPlan(planFor([directArt]), { gateReceipts:['gate/style-approved'] }), /must be an object/);
  const ready = admitGameProductionPlan(planFor([directArt]), { gateReceipts:[styleGateReceipt] });
  assert.equal(ready.readyCount,1);
  assert.equal(ready.gateReceiptCount,1);
});

test('gate receipt source lineage is enforced', () => {
  const wrong = structuredClone(styleGateReceipt); wrong.sourceDigest='wrong';
  assert.throws(() => admitGameProductionPlan(planFor([directArt]), { gateReceipts:[wrong] }), /sourceDigest does not match/);
});

test('art studio emits its own reviewed receipt', () => {
  const receipt = createGameProductionReceipt({ packet:art, artifactRevision:{id:'art-v7',digest:'sha256:art'}, evidenceRefs:[{kind:'art-review',ref:'art-review.json'}], review:{status:'reviewed',reviewer:'art-review',evidenceDigest:'sha256:review'} });
  assert.equal(receipt.packetId,art.id);
  assert.equal(receipt.authority.grantsCreativeApproval,false);
});

test('bare id cannot impersonate production receipt', () => assert.throws(() => admitGameProductionPlan(planFor([env,art]), { completedReceipts:[env.id] }), /must be an object/));

test('unsupported art operations are rejected', () => {
  const bad = { ...directArt, operation:'execute-provider-directly' };
  assert.throws(() => admitGameProductionPlan(planFor([bad]), { gateReceipts:[styleGateReceipt] }), /unsupported Art Studio operation/);
});
