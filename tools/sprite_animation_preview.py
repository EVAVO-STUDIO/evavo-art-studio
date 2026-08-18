#!/usr/bin/env python3
"""Render create-only sprite animation review GIF/contact strip from exact frame plans."""
from __future__ import annotations
import argparse, hashlib, json, os, re, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps
SCHEMA='evavo.sprite-animation-preview-plan.v1'; RECEIPT='evavo.sprite-animation-preview-receipt.v1'; SHA=re.compile(r'^[0-9a-f]{64}$'); MAX_FRAMES=512; MAX_PIXELS=64_000_000
Image.MAX_IMAGE_PIXELS=MAX_PIXELS

def fail(m): raise ValueError(m)
def digest(b): return hashlib.sha256(b).hexdigest()
def inside(r,p):
    try:p.relative_to(r);return True
    except ValueError:return False
def secure(root,v,label,exist=True):
    if not isinstance(v,str) or not v or '\\' in v or '\x00' in v:fail(f'{label} invalid')
    p=Path(v)
    if p.is_absolute() or '..' in p.parts or any(x in {'','.'} for x in p.parts):fail(f'{label} invalid')
    q=(root/p).resolve(strict=exist)
    if not inside(root,q):fail(f'{label} escaped root')
    if exist and (q.is_symlink() or not q.is_file()):fail(f'{label} must be regular file')
    return q
def abs_out(root,v,label):
    q=Path(os.path.abspath(v)).resolve(strict=False)
    if not inside(root,q):fail(f'{label} escaped root')
    return q
def checker(size,a=(24,24,24,255),b=(48,48,48,255),step=8):
    w,h=size;im=Image.new('RGBA',size,a);d=ImageDraw.Draw(im)
    for y in range(0,h,step):
        for x in range(0,w,step):
            if (x//step+y//step)%2:d.rectangle((x,y,min(w-1,x+step-1),min(h-1,y+step-1)),fill=b)
    return im
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--workspace-root',required=True);ap.add_argument('--plan',required=True);ap.add_argument('--plan-sha256',required=True);ap.add_argument('--output-root',required=True);ns=ap.parse_args()
    try:
        root=Path(os.path.abspath(ns.workspace_root)).resolve(strict=True)
        if root.is_symlink() or not root.is_dir():fail('workspace root invalid')
        planp=abs_out(root,ns.plan,'plan')
        if not planp.is_file() or planp.is_symlink():fail('plan must be ordinary file')
        pb=planp.read_bytes();ps=str(ns.plan_sha256).lower().strip()
        if not SHA.fullmatch(ps) or digest(pb)!=ps:fail('plan SHA-256 mismatch')
        plan=json.loads(pb.decode('utf-8'))
        if plan.get('schema')!=SCHEMA or plan.get('createOnlyOutput') is not True or plan.get('repositoryMutation') is not False:fail('plan boundary invalid')
        frames=plan.get('frames')
        if not isinstance(frames,list) or not frames or len(frames)>MAX_FRAMES:fail('frames invalid')
        out=abs_out(root,ns.output_root,'output root')
        if out.exists() or out.is_symlink():fail('output root is create-only')
        out.mkdir(parents=True)
        scale=int(plan.get('scale',4)); fps=float(plan.get('fps',8)); bg=plan.get('background','checker')
        if not 1<=scale<=16 or not .5<=fps<=60:fail('preview timing/scale invalid')
        rendered=[];records=[];cell_w=cell_h=0
        for i,item in enumerate(frames):
            p=secure(root,item['path'],f'frame {i}',True);b=p.read_bytes();expected=item.get('sha256')
            if expected and digest(b)!=expected:fail(f'frame {i} hash mismatch')
            with Image.open(p) as src:src.load();im=ImageOps.exif_transpose(src).convert('RGBA')
            cell_w=max(cell_w,im.width);cell_h=max(cell_h,im.height);rendered.append(im);records.append({'path':item['path'],'sha256':digest(b),'durationMs':item.get('durationMs')})
        if cell_w*cell_h*len(rendered)>MAX_PIXELS:fail('preview exceeds pixel bound')
        gif=[]
        for im in rendered:
            frame=checker((cell_w,cell_h)) if bg=='checker' else Image.new('RGBA',(cell_w,cell_h),(0,0,0,0))
            frame.alpha_composite(im,((cell_w-im.width)//2,cell_h-im.height));gif.append(frame.resize((cell_w*scale,cell_h*scale),Image.Resampling.NEAREST).convert('P',palette=Image.Palette.ADAPTIVE,colors=255))
        duration=max(1,round(1000/fps));gif_path=out/'animation-preview.gif';gif[0].save(gif_path,save_all=True,append_images=gif[1:],duration=duration,loop=0,disposal=2,optimize=False,transparency=255)
        strip=Image.new('RGBA',(cell_w*len(rendered),cell_h),(0,0,0,0))
        for i,im in enumerate(rendered):strip.alpha_composite(im,(i*cell_w+(cell_w-im.width)//2,cell_h-im.height))
        strip_path=out/'frame-strip.png';strip.resize((strip.width*scale,strip.height*scale),Image.Resampling.NEAREST).save(strip_path,'PNG',compress_level=9)
        rec={'schema':RECEIPT,'status':'passed','planSha256':ps,'frameCount':len(frames),'fps':fps,'scale':scale,'gifSha256':digest(gif_path.read_bytes()),'stripSha256':digest(strip_path.read_bytes()),'frames':records,'reviewOnly':True,'automaticApproval':False,'repositoryMutation':False,'storageMutation':False,'publication':False,'forcePush':False}
        (out/'receipt.json').write_text(json.dumps(rec,sort_keys=True,indent=2)+'\n',encoding='utf-8');print(json.dumps(rec,sort_keys=True));return 0
    except (OSError,ValueError,KeyError,UnicodeError,json.JSONDecodeError) as e:print(json.dumps({'schema':RECEIPT,'status':'failed','error':str(e)[:2048]}),file=sys.stderr);return 2
if __name__=='__main__':raise SystemExit(main())
