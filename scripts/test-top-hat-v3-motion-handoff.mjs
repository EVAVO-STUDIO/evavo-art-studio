import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createTopHatV3ContractTestFixture,
  sealTopHatV3ContractTestPlan,
} from './test-top-hat-v3-provider-plan-regression.mjs';
import { compileTopHatV3ProviderPlan } from './project-art/top-hat-v3-animation-provider-plan.mjs';

const moduleUrl=process.env.EVAVO_AVATAR_RUNTIME_ROOT
  ? pathToFileURL(path.join(process.env.EVAVO_AVATAR_RUNTIME_ROOT,'src/top-hat-v3-motion-keyframes.js'))
  : new URL('../../evavo-avatar-runtime/src/top-hat-v3-motion-keyframes.js',import.meta.url);
if(!existsSync(moduleUrl)&&!process.env.EVAVO_AVATAR_RUNTIME_ROOT) {
  test('real Runtime motion compiler to Art Studio handoff',{
    skip:'Sibling avatar-runtime checkout is absent; set EVAVO_AVATAR_RUNTIME_ROOT to run this integration.',
  },()=>{});
} else {
  const { compileTopHatV3ClipMotionPlan }=await import(moduleUrl.href);
  const allRows=(plan)=>[...plan.foundation,...plan.registeredLayers,
    ...plan.clips.flatMap((clip)=>clip.waves.flatMap((wave)=>wave.jobs))];
  function fixture() {
    // Synthetic inventory and artifact bindings; the Runtime and Art Studio
    // compiler functions are real. No image provider or image-quality claim.
    const input=createTopHatV3ContractTestFixture();
    const phase=input.generationPlan.phases.find((p)=>p.id==='body-clips');
    phase.clips=phase.clips.map((clip,index)=>{
      const spec={id:clip.clipId,targetFrames:clip.targetFrames,fps:clip.fps,
        loopMode:clip.loopMode,kind:'fixture',performance:`Fixture direction for ${clip.clipId}`};
      const inventory=clip.waves.flatMap((wave)=>wave.jobs).map((job)=>({
        kind:'body-frame',clipId:clip.clipId,frameOrdinal:job.ordinal,jobId:job.jobId,
        performance:spec.performance,target:{path:job.targetPath},
      }));
      return compileTopHatV3ClipMotionPlan(spec,inventory,index);
    });
    input.generationPlan.strategy.authoredActionAnchorsRequired=true;
    sealTopHatV3ContractTestPlan(input.generationPlan);
    return input;
  }
  const bodyClips=(input)=>input.generationPlan.phases.find((p)=>p.id==='body-clips').clips;
  test('real motion compiler produces 755 compatible provider requests with unchanged job IDs',()=>{
    const input=fixture();const provider=compileTopHatV3ProviderPlan(input);
    assert.equal(provider.counts.total,755);assert.equal(provider.counts.ready,755);
    for(const row of allRows(provider)) assert.equal(row.request.metadata.jobId,row.jobId);
  });
  test('action-keyframe instructions survive the complete handoff into provider prompts and metadata',()=>{
    const input=fixture();const provider=compileTopHatV3ProviderPlan(input);
    for(const clip of bodyClips(input)) {
      for(const job of clip.waves[0].jobs) {
        const request=allRows(provider).find((row)=>row.jobId===job.jobId).request;
        assert.ok(request.creativeIntent.includes(job.authoredDirection));
        assert.ok(request.creativeIntent.includes(job.performance));
        assert.equal(request.metadata.keyPoseLabel,job.keyPoseLabel);
        assert.equal(request.metadata.timestampMs,job.timestampMs);
        assert.equal(request.candidateCount,2);
        assert.equal(request.continuityPhase,'key-pose');
      }
    }
  });
  test('in-betweens still require both earlier-wave temporal reference images',()=>{
    const provider=compileTopHatV3ProviderPlan(fixture());
    for(const row of allRows(provider).filter((r)=>r.request.continuityPhase==='in-between')) {
      const refs=row.request.references;
      assert.ok(refs.some((ref)=>ref.role==='previous-key-pose'&&ref.required));
      assert.ok(refs.some((ref)=>ref.role==='next-key-pose'&&ref.required));
    }
  });
  test('signature prompts permit only the authored rigid tilt, not hat redesign',()=>{
    const row=compileTopHatV3ProviderPlan(fixture()).clips.find((c)=>c.clipId==='hat-tip')
      .waves[0].jobs.find((j)=>j.request.metadata.keyPoseLabel==='hat-tip-apex');
    assert.match(row.request.style.mustHave.join(' '),/authored rigid hat-tip rotation/u);
    assert.ok(row.request.style.mustAvoid.includes('hat redesign or geometry drift'));
  });
  test('ordinary clips do not gain permission to tilt the hat',()=>{
    const row=compileTopHatV3ProviderPlan(fixture()).clips.find((c)=>c.clipId==='blink-single').waves[0].jobs[0];
    assert.ok(row.request.style.mustHave.includes('same exact top-hat crown brim band angle and scale'));
  });
  for(const [label,mutate] of [
    ['missing timeline',(c)=>{delete c.motionTimeline;}],
    ['missing apex label',(c)=>{c.waves[0].jobs[1].keyPoseLabel='wrong-pose';}],
    ['altered apex direction',(c)=>{c.waves[0].jobs[1].authoredDirection='Different unbound action';}],
    ['incorrect timestamp',(c)=>{c.waves[0].jobs[1].timestampMs+=5;}],
    ['duplicate cyclic endpoint',(c)=>{c.waves[0].jobs.at(-1).motionPhase=1;}],
    ['missing performance',(c)=>{delete c.waves[0].jobs[1].performance;}],
    ['incorrect layer ownership',(c)=>{c.waves[0].jobs[1].layerOwnership='eyelid-test-body-pose-no-independent-eye-overlay';}],
    ['mislabelled action anchor',(c)=>{c.waves[0].jobs[1].role='opening-anchor';}],
  ]) {
    test(`motion handoff rejects ${label}, even with a recomputed plan hash`,()=>{
      const input=JSON.parse(JSON.stringify(fixture()));
      mutate(bodyClips(input)[0]);sealTopHatV3ContractTestPlan(input.generationPlan);
      assert.throws(()=>compileTopHatV3ProviderPlan(input),/MOTION|ANCHOR/u);
    });
  }
  test('orphaned motion fields are rejected even without the new strict flag',()=>{
    const input=JSON.parse(JSON.stringify(fixture()));
    delete input.generationPlan.strategy.authoredActionAnchorsRequired;
    delete bodyClips(input)[0].motionTimeline;
    sealTopHatV3ContractTestPlan(input.generationPlan);
    assert.throws(()=>compileTopHatV3ProviderPlan(input),/MOTION/u);
  });
  test('new action anchors remain blocked without actual approved identity bindings',()=>{
    const input=fixture();input.bindings={};
    const p=compileTopHatV3ProviderPlan(input);assert.equal(p.counts.ready,0);
    assert.ok(allRows(p).every((row)=>row.request===null));
  });
}
