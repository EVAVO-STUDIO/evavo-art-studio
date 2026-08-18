#!/usr/bin/env python3
"""Deterministic create-only raster workstation for EVAVO Art Studio.

Executes a JSON recipe over local raster inputs. It covers deterministic
Photoshop-like transforms while leaving generative repair/inpainting and human
creative approval to governed provider/review surfaces.
"""
from __future__ import annotations
import argparse, hashlib, json, os, sys
from pathlib import Path
from typing import Any
try:
    from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageOps
except ImportError as exc:
    raise SystemExit(f"Pillow unavailable: {exc}")

SCHEMA="evavo.raster-workstation-plan.v1"; RECEIPT="evavo.raster-workstation-receipt.v1"
MAX_BYTES=512*1024*1024; MAX_PIXELS=220_000_000; Image.MAX_IMAGE_PIXELS=MAX_PIXELS

def fail(msg:str): raise ValueError(msg)
def sha_bytes(b:bytes)->str: return hashlib.sha256(b).hexdigest()
def canonical(v:Any)->bytes: return (json.dumps(v,sort_keys=True,separators=(",",":"),ensure_ascii=False)+"\n").encode()
def inside(root:Path,p:Path)->bool:
    try: p.relative_to(root); return True
    except ValueError: return False

def secure(root:Path,value:str,label:str,must_exist=False)->Path:
    if not isinstance(value,str) or not value or "\x00" in value: fail(f"{label} invalid")
    p=Path(value)
    if p.is_absolute() or ".." in p.parts or "\\" in value: fail(f"{label} must be forward-slash relative")
    q=(root/p).resolve(strict=must_exist)
    if not inside(root,q): fail(f"{label} escaped workspace")
    cur=root
    for part in p.parts:
        cur=cur/part
        if cur.exists() and cur.is_symlink(): fail(f"{label} contains symlink")
    return q

def regular(p:Path,label:str):
    if p.is_symlink() or not p.is_file(): fail(f"{label} must be regular file")
    if p.stat().st_size<=0 or p.stat().st_size>MAX_BYTES: fail(f"{label} size outside bounds")

def colour(v:Any,alpha=255):
    if isinstance(v,list) and len(v) in (3,4) and all(isinstance(x,int) and 0<=x<=255 for x in v): return tuple(v)+(alpha,) if len(v)==3 else tuple(v)
    if isinstance(v,str) and v.startswith('#') and len(v) in (7,9):
        vals=tuple(int(v[i:i+2],16) for i in range(1,len(v),2)); return vals+(alpha,) if len(vals)==3 else vals
    fail("invalid colour")

def open_rgba(p:Path)->Image.Image:
    regular(p,"input")
    with Image.open(p) as im:
        im.load(); im=ImageOps.exif_transpose(im)
        if im.width*im.height>MAX_PIXELS: fail("decoded pixels exceed bounds")
        return im.convert('RGBA')

def alpha_bbox(im:Image.Image,threshold=1):
    a=im.getchannel('A')
    if threshold>1: a=a.point(lambda x:255 if x>=threshold else 0)
    return a.getbbox()

def levels_channel(x:int,black:float,white:float,gamma:float):
    n=max(0.0,min(1.0,(x-black)/max(1e-9,white-black))); return int(round((n**(1.0/gamma))*255))

def apply_op(base:Image.Image,op:dict[str,Any],workspace:Path)->Image.Image:
    kind=op.get('op')
    if kind=='crop':
        x,y,w,h=(int(op[k]) for k in ('x','y','width','height'))
        if w<1 or h<1 or x<0 or y<0 or x+w>base.width or y+h>base.height: fail('crop outside image')
        return base.crop((x,y,x+w,y+h))
    if kind=='trim-alpha':
        bbox=alpha_bbox(base,int(op.get('threshold',1)))
        if not bbox: fail('trim-alpha found no visible pixels')
        pad=int(op.get('padding',0)); l,t,r,b=bbox
        return base.crop((max(0,l-pad),max(0,t-pad),min(base.width,r+pad),min(base.height,b+pad)))
    if kind=='resize':
        w,h=int(op['width']),int(op['height']); method=str(op.get('filter','nearest')).lower()
        if w<1 or h<1 or w*h>MAX_PIXELS: fail('resize dimensions invalid')
        filt={'nearest':Image.Resampling.NEAREST,'lanczos':Image.Resampling.LANCZOS,'bicubic':Image.Resampling.BICUBIC,'bilinear':Image.Resampling.BILINEAR}.get(method)
        if filt is None: fail('unsupported resize filter')
        return base.resize((w,h),filt)
    if kind=='scale-integer':
        factor=int(op['factor'])
        if factor<1 or factor>32: fail('integer scale invalid')
        return base.resize((base.width*factor,base.height*factor),Image.Resampling.NEAREST)
    if kind=='flip':
        axis=op.get('axis'); return ImageOps.mirror(base) if axis=='horizontal' else ImageOps.flip(base) if axis=='vertical' else fail('flip axis invalid')
    if kind=='rotate-90':
        turns=int(op.get('turns',1))%4; return base.rotate(90*turns,expand=True,resample=Image.Resampling.NEAREST) if turns else base.copy()
    if kind=='canvas':
        w,h=int(op['width']),int(op['height']); bg=colour(op.get('background','#00000000'),0)
        if w<1 or h<1 or w*h>MAX_PIXELS: fail('canvas dimensions invalid')
        out=Image.new('RGBA',(w,h),bg); x=int(op.get('x',(w-base.width)//2)); y=int(op.get('y',(h-base.height)//2)); out.alpha_composite(base,(x,y)); return out
    if kind=='alpha-threshold':
        threshold=int(op.get('threshold',128)); a=base.getchannel('A').point(lambda x:255 if x>=threshold else 0); out=base.copy(); out.putalpha(a); return out
    if kind=='mask-alpha':
        mp=secure(workspace,str(op['mask']),'mask',True); mask=open_rgba(mp).convert('L')
        if mask.size!=base.size: mask=mask.resize(base.size,Image.Resampling.NEAREST if op.get('pixelArt',False) else Image.Resampling.LANCZOS)
        if op.get('invert'): mask=ImageOps.invert(mask)
        out=base.copy(); out.putalpha(ImageChops.multiply(base.getchannel('A'),mask)); return out
    if kind=='composite':
        overlay=open_rgba(secure(workspace,str(op['source']),'composite source',True))
        if 'opacity' in op:
            factor=float(op['opacity']); overlay.putalpha(overlay.getchannel('A').point(lambda x:int(round(x*factor))))
        out=base.copy(); out.alpha_composite(overlay,(int(op.get('x',0)),int(op.get('y',0)))); return out
    if kind=='erase-colour':
        target=colour(op['colour'])[:3]; tolerance=float(op.get('tolerance',0)); rgba=base.copy(); pix=rgba.load()
        for y in range(rgba.height):
            for x in range(rgba.width):
                r,g,b,a=pix[x,y]; d=((r-target[0])**2+(g-target[1])**2+(b-target[2])**2)**0.5
                if d<=tolerance: pix[x,y]=(r,g,b,0)
        return rgba
    if kind=='replace-colour':
        src=colour(op['from'])[:3]; dst=colour(op['to'])[:3]; tolerance=float(op.get('tolerance',0)); rgba=base.copy(); pix=rgba.load()
        for y in range(rgba.height):
            for x in range(rgba.width):
                r,g,b,a=pix[x,y]; d=((r-src[0])**2+(g-src[1])**2+(b-src[2])**2)**0.5
                if d<=tolerance: pix[x,y]=(*dst,a)
        return rgba
    if kind=='levels':
        black=float(op.get('black',0)); white=float(op.get('white',255)); gamma=float(op.get('gamma',1))
        if not(0<=black<white<=255 and .05<=gamma<=20): fail('levels invalid')
        lut=[levels_channel(x,black,white,gamma) for x in range(256)]; r,g,b,a=base.split(); return Image.merge('RGBA',(r.point(lut),g.point(lut),b.point(lut),a))
    if kind=='brightness': return ImageEnhance.Brightness(base).enhance(float(op['factor']))
    if kind=='contrast': return ImageEnhance.Contrast(base).enhance(float(op['factor']))
    if kind=='saturation': return ImageEnhance.Color(base).enhance(float(op['factor']))
    if kind=='sharpen': return ImageEnhance.Sharpness(base).enhance(float(op.get('factor',2)))
    if kind=='palette-quantize':
        colors=int(op.get('colors',256))
        if colors<2 or colors>256: fail('palette colors invalid')
        a=base.getchannel('A'); rgb=base.convert('RGB').quantize(colors=colors,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).convert('RGB'); out=rgb.convert('RGBA'); out.putalpha(a); return out
    if kind=='pixelate':
        w=max(1,int(op['width'])); h=max(1,int(op['height'])); small=base.resize((w,h),Image.Resampling.NEAREST); return small.resize(base.size,Image.Resampling.NEAREST)
    if kind=='outline':
        radius=int(op.get('radius',1)); c=colour(op.get('colour','#000000ff'))
        if radius<1 or radius>32: fail('outline radius invalid')
        a=base.getchannel('A'); expanded=a.filter(ImageFilter.MaxFilter(radius*2+1)); ring=ImageChops.subtract(expanded,a); layer=Image.new('RGBA',base.size,c); layer.putalpha(ImageChops.multiply(ring,Image.new('L',base.size,c[3]))); layer.alpha_composite(base); return layer
    fail(f"unsupported operation: {kind}")

def main()->int:
    ap=argparse.ArgumentParser(); ap.add_argument('--workspace-root',type=Path,required=True); ap.add_argument('--plan',type=Path,required=True); ap.add_argument('--receipt',type=Path,required=True); ns=ap.parse_args()
    try:
        root=Path(os.path.abspath(ns.workspace_root)).resolve(strict=True)
        if root.is_symlink() or not root.is_dir(): fail('workspace-root invalid')
        planp=Path(os.path.abspath(ns.plan)); regular(planp,'plan'); plan=json.loads(planp.read_text('utf-8'))
        if plan.get('schema')!=SCHEMA or plan.get('createOnlyOutput') is not True or plan.get('sourceOverwrite') is not False: fail('plan authority boundary invalid')
        inp=secure(root,plan['input'],'input',True); out=secure(root,plan['output'],'output',False); receipt=Path(os.path.abspath(ns.receipt))
        if out.exists() or receipt.exists(): fail('output and receipt are create-only')
        source=inp.read_bytes(); expected=plan.get('sourceSha256')
        if expected and sha_bytes(source)!=expected: fail('source hash mismatch')
        image=open_rgba(inp)
        for op in plan.get('operations',[]):
            if not isinstance(op,dict): fail('operation must be object')
            image=apply_op(image,op,root)
        out.parent.mkdir(parents=True,exist_ok=True)
        if str(plan.get('format','png')).lower()!='png': fail('workstation v1 runtime output must be png')
        image.save(out,format='PNG',optimize=False,compress_level=9)
        outb=out.read_bytes(); alpha=list(image.getchannel('A').get_flattened_data()); visible=sum(1 for x in alpha if x); partial=sum(1 for x in alpha if 0<x<255)
        rec={'schema':RECEIPT,'status':'passed','sourceSha256':sha_bytes(source),'outputSha256':sha_bytes(outb),'outputBytes':len(outb),'width':image.width,'height':image.height,'visiblePixels':visible,'partialAlphaPixels':partial,'operations':[x.get('op') for x in plan.get('operations',[])],'createOnlyOutput':True,'sourceOverwrite':False,'automaticApproval':False,'repositoryMutation':False,'storageMutation':False,'forcePush':False}
        receipt.parent.mkdir(parents=True,exist_ok=True); receipt.write_bytes(canonical(rec)); print(json.dumps(rec,sort_keys=True)); return 0
    except (OSError,ValueError,KeyError,json.JSONDecodeError) as exc:
        print(json.dumps({'schema':RECEIPT,'status':'failed','error':str(exc)[:1024]}),file=sys.stderr); return 2
if __name__=='__main__': raise SystemExit(main())
