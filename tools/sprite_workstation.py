#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, math, os, re, sys
from pathlib import Path
from PIL import Image, ImageOps
SCHEMA='evavo.sprite-workstation-plan.v1'; RECEIPT='evavo.sprite-workstation-receipt.v1'; MAX_PIXELS=220_000_000
SAFE=re.compile(r'^[A-Za-z0-9_.-]+$'); SHA256=re.compile(r'^[0-9a-f]{64}$')
def fail(m): raise ValueError(m)
def sha(b): return hashlib.sha256(b).hexdigest()
def inside(root:Path,p:Path)->bool:
    try:p.relative_to(root);return True
    except ValueError:return False
def safe(root:Path,v:str,label:str,exist=True):
    p=Path(v)
    if not v or p.is_absolute() or '..' in p.parts or '\\' in v: fail(f'{label} invalid')
    q=(root/p).resolve(strict=exist)
    if not inside(root,q):fail(f'{label} escaped root')
    current=root
    for part in p.parts:
        current=current/part
        if current.exists() and current.is_symlink():fail(f'{label} contains symlink')
    if exist and (q.is_symlink() or not q.is_file()): fail(f'{label} must be regular file')
    return q
def safe_absolute(root:Path,v,label,exist=False):
    q=Path(os.path.abspath(v)).resolve(strict=exist)
    if not inside(root,q):fail(f'{label} escaped root')
    current=root
    for part in q.relative_to(root).parts:
        current=current/part
        if current.exists() and current.is_symlink():fail(f'{label} contains symlink')
    return q
def jwrite(p:Path,v):p.write_text(json.dumps(v,sort_keys=True,indent=2)+'\n',encoding='utf-8')
def alpha_clean(im,threshold):
    a=im.getchannel('A').point(lambda x:255 if x>=threshold else 0); out=im.copy(); out.putalpha(a); return out
def contain(im,w,h,anchor='bottom-center'):
    scale=min(w/im.width,h/im.height,1 if im.width<=w and im.height<=h else 999); nw=max(1,round(im.width*scale)); nh=max(1,round(im.height*scale)); im=im.resize((nw,nh),Image.Resampling.NEAREST); out=Image.new('RGBA',(w,h),(0,0,0,0)); x=(w-nw)//2; y=h-nh if anchor=='bottom-center' else (h-nh)//2; out.alpha_composite(im,(x,y)); return out
def godot(plan,frames,atlas_res):
    runtime=[(i,f) for i,f in enumerate(frames) if f.get('runtime',True)]
    lines=[f'[gd_resource type="SpriteFrames" load_steps={len(runtime)+2} format=3]','',f'[ext_resource type="Texture2D" path="{atlas_res}" id="1_atlas"]','']
    for i,f in runtime:
        sid=f'AtlasTexture_{i:04d}'; x,y,w,h=f['region']; lines += [f'[sub_resource type="AtlasTexture" id="{sid}"]','atlas = ExtResource("1_atlas")',f'region = Rect2({x}, {y}, {w}, {h})','']
    by={}
    for i,f in runtime:by.setdefault(f['animation'],[]).append((i,f))
    anim=[];default_fps=float(plan.get('defaultFps',8))
    for name,items in by.items():
        cfg=(plan.get('animations') or {}).get(name,{});fps=float(cfg.get('fps',default_fps));loop=bool(cfg.get('loop',True));arr=[]
        for i,f in items:
            multiplier=float(f.get('durationMs') or 1000/fps)/(1000/fps);arr.append('{"duration": %.6f, "texture": SubResource("AtlasTexture_%04d")}'%(multiplier,i))
        anim.append('{\n"frames": [%s],\n"loop": %s,\n"name": &"%s",\n"speed": %.6f\n}'%(', '.join(arr),'true' if loop else 'false',name,fps))
    lines += ['[resource]','animations = [%s]'%(',\n'.join(anim)),''];return '\n'.join(lines)
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--workspace-root',required=True);ap.add_argument('--plan',required=True);ap.add_argument('--plan-sha256',required=True);ap.add_argument('--output-root',required=True);ns=ap.parse_args()
    try:
        root=Path(os.path.abspath(ns.workspace_root)).resolve(strict=True);planp=safe_absolute(root,ns.plan,'plan',True);out=safe_absolute(root,ns.output_root,'output root',False)
        if root.is_symlink() or not root.is_dir():fail('workspace root invalid')
        if out.exists():fail('output root is create-only')
        plan_bytes=planp.read_bytes();expected_plan=str(ns.plan_sha256).strip().lower()
        if not SHA256.fullmatch(expected_plan) or sha(plan_bytes)!=expected_plan:fail('plan SHA-256 mismatch')
        plan=json.loads(plan_bytes.decode('utf-8'))
        if plan.get('schema')!=SCHEMA or plan.get('repositoryMutation') is not False or plan.get('automaticApproval') is not False:fail('authority boundary invalid')
        cell=plan['cell'];cw,ch=int(cell['width']),int(cell['height']);cols=int(plan.get('columns',8));threshold=int(plan.get('alphaThreshold',128))
        if not(1<=cw<=4096 and 1<=ch<=4096 and 1<=cols<=64):fail('layout invalid')
        source=plan.get('frames')
        if not isinstance(source,list) or not source or len(source)>4096:fail('frames invalid')
        prepared=[];reserved_count=0
        for index,item in enumerate(source):
            if not isinstance(item,dict):fail('frame entry invalid')
            fid=item.get('id');anim=item.get('animation','reserved')
            if not SAFE.fullmatch(str(fid or '')) or not SAFE.fullmatch(str(anim or '')):fail('frame/animation id invalid')
            runtime=item.get('runtime',True)
            if type(runtime) is not bool:fail(f'frame {fid} runtime invalid')
            reserved=item.get('reserved',False)
            if type(reserved) is not bool:fail(f'frame {fid} reserved invalid')
            if reserved:
                if runtime is not False or 'path' in item or 'sha256' in item:fail(f'reserved frame {fid} must be runtime=false and source-free')
                frame=Image.new('RGBA',(cw,ch),(0,0,0,0));source_sha=None;reserved_count+=1
            else:
                p=safe(root,item['path'],f'frame {fid}');b=p.read_bytes();expected=item.get('sha256')
                if not isinstance(expected,str) or not SHA256.fullmatch(expected) or sha(b)!=expected:fail(f'frame {fid} hash mismatch')
                source_sha=expected
                with Image.open(p) as im:im.load();frame=ImageOps.exif_transpose(im).convert('RGBA')
                frame=alpha_clean(frame,threshold) if plan.get('hardAlpha',True) else frame
                if plan.get('trimAlpha',False):
                    box=frame.getchannel('A').getbbox()
                    if not box:fail(f'frame {fid} empty')
                    frame=frame.crop(box)
                frame=contain(frame,cw,ch,plan.get('anchor','bottom-center'))
            prepared.append({'id':fid,'animation':anim,'durationMs':item.get('durationMs'),'pivot':item.get('pivot',{'x':cw//2,'y':ch}),'sourceSha256':source_sha,'runtime':runtime,'reserved':reserved,'cellIndex':index,'image':frame})
        rows=math.ceil(len(prepared)/cols);aw,ah=cw*cols,ch*rows
        if aw*ah>MAX_PIXELS:fail('atlas exceeds pixel bound')
        atlas=Image.new('RGBA',(aw,ah),(0,0,0,0));manifest_frames=[]
        for i,f in enumerate(prepared):
            x=(i%cols)*cw;y=(i//cols)*ch;atlas.alpha_composite(f['image'],(x,y));manifest_frames.append({k:v for k,v in f.items() if k!='image'}|{'region':[x,y,cw,ch]})
        out.mkdir(parents=True);atlas_name=plan.get('atlasFile','atlas.png');manifest_name=plan.get('manifestFile','atlas.json');tres_name=plan.get('godotFile','sprite_frames.tres')
        if any(Path(n).name!=n for n in (atlas_name,manifest_name,tres_name)):fail('output names must be basenames')
        atlas_path=out/atlas_name;atlas.save(atlas_path,'PNG',optimize=False,compress_level=9)
        atlas_res=plan.get('godotAtlasPath')
        if not isinstance(atlas_res,str) or not atlas_res.startswith('res://'):fail('godotAtlasPath required')
        manifest={'schema':'evavo.sprite-workstation-manifest.v2','planSha256':expected_plan,'atlasFile':atlas_name,'atlasSha256':sha(atlas_path.read_bytes()),'size':{'width':aw,'height':ah},'cell':{'width':cw,'height':ch},'frames':manifest_frames,'animations':plan.get('animations',{}),'hardAlpha':bool(plan.get('hardAlpha',True)),'reservedFrameCount':reserved_count,'repositoryMutation':False,'automaticApproval':False}
        jwrite(out/manifest_name,manifest);(out/tres_name).write_text(godot(plan,manifest_frames,atlas_res),encoding='utf-8')
        receipt={'schema':RECEIPT,'status':'passed','planSha256':expected_plan,'frameCount':len(prepared),'runtimeFrameCount':sum(1 for f in prepared if f['runtime']),'reservedFrameCount':reserved_count,'animationCount':len({f['animation'] for f in prepared if f['runtime']}),'atlasSha256':manifest['atlasSha256'],'manifestSha256':sha((out/manifest_name).read_bytes()),'godotSha256':sha((out/tres_name).read_bytes()),'repositoryMutation':False,'storageMutation':False,'automaticApproval':False,'forcePush':False}
        jwrite(out/'receipt.json',receipt);print(json.dumps(receipt,sort_keys=True));return 0
    except (OSError,ValueError,KeyError,UnicodeError,json.JSONDecodeError) as e:print(json.dumps({'schema':RECEIPT,'status':'failed','error':str(e)[:1024]}),file=sys.stderr);return 2
if __name__=='__main__':raise SystemExit(main())
