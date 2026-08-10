#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, math, os, struct, zlib
from pathlib import Path

SCHEMA='evavo.pixel-font-family-master.v2'
FACE_SCHEMA='evavo.pixel-font-face-master.v2'


def sha256_bytes(b: bytes)->str: return hashlib.sha256(b).hexdigest()
def load_json(p: Path): return json.loads(p.read_text(encoding='utf-8'))
def write_create_only(p: Path,b: bytes):
    p.parent.mkdir(parents=True,exist_ok=True)
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o644)
    try: os.write(fd,b)
    finally: os.close(fd)
def png_rgba(w,h,rgba: bytes)->bytes:
    assert len(rgba)==w*h*4
    raw=b''.join(b'\x00'+rgba[y*w*4:(y+1)*w*4] for y in range(h))
    def chunk(t,d):
        body=t+d
        return struct.pack('>I',len(d))+body+struct.pack('>I',zlib.crc32(body)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')

def norm_bitmap(rows,label):
    if not isinstance(rows,list) or not rows: raise ValueError(f'{label}.bitmap must be non-empty')
    width=len(rows[0])
    if width<1 or any(not isinstance(r,str) or len(r)!=width or any(c not in '.#' for c in r) for r in rows):
        raise ValueError(f'{label}.bitmap must be rectangular .# rows')
    return rows

def validate_face(face):
    if face.get('schema')!=FACE_SCHEMA: raise ValueError(f"{face.get('faceId','face')}: expected {FACE_SCHEMA}")
    metrics=face.get('metrics') or {}
    for k in ('capHeight','xHeight','baseline','lineHeight','spaceAdvance'):
        if not isinstance(metrics.get(k),int) or metrics[k]<1: raise ValueError(f"{face['faceId']}: invalid metric {k}")
    if not (metrics['xHeight']<=metrics['capHeight']<=metrics['lineHeight']): raise ValueError(f"{face['faceId']}: invalid vertical metrics")
    cps=set(); records={}
    for i,g in enumerate(face.get('glyphs') or []):
        cp=g.get('codepoint'); label=f"{face['faceId']}.glyphs[{i}]"
        if not isinstance(cp,int) or cp<32 or cp>0x10ffff or cp in cps: raise ValueError(f'{label}: invalid/duplicate codepoint')
        cps.add(cp); rows=norm_bitmap(g.get('bitmap'),label)
        w,h=len(rows[0]),len(rows)
        if g.get('width')!=w or g.get('height')!=h: raise ValueError(f'{label}: dimensions disagree with bitmap')
        for k in ('xOffset','yOffset','xAdvance'):
            if not isinstance(g.get(k),int): raise ValueError(f'{label}: {k} must be integer')
        if g['xAdvance']<1: raise ValueError(f'{label}: xAdvance must be positive')
        if cp!=32 and not any('#' in r for r in rows): raise ValueError(f'{label}: visible glyph is empty')
        if cp==32 and any('#' in r for r in rows): raise ValueError(f'{label}: space must be empty')
        records[cp]=g
    required=list(range(32,127))
    missing=[cp for cp in required if cp not in cps]
    if missing: raise ValueError(f"{face['faceId']}: missing printable ASCII: {missing}")
    for pair in face.get('kerning') or []:
        if set(pair)!= {'first','second','amount'}: raise ValueError(f"{face['faceId']}: invalid kerning record")
        if pair['first'] not in cps or pair['second'] not in cps or not isinstance(pair['amount'],int): raise ValueError(f"{face['faceId']}: invalid kerning pair")
    # Confusable hard gate: exact matrices may not be identical.
    for chars in [('0','O'),('1','I'),('1','l'),('5','S'),('2','Z'),('8','B')]:
        a,b=map(ord,chars)
        if a in records and b in records and records[a]['bitmap']==records[b]['bitmap']:
            raise ValueError(f"{face['faceId']}: confusable glyphs {chars[0]}/{chars[1]} are identical")
    return records

def pack(records,max_edge=1024,padding=1):
    items=sorted(records.items())
    maxw=max(g['width'] for _,g in items)
    width=64
    area=sum((g['width']+padding)*(g['height']+padding) for _,g in items)
    while width<max(maxw+padding,math.sqrt(area)*1.25) and width<max_edge: width*=2
    width=min(width,max_edge)
    x=y=padding; rowh=0; placed=[]
    for cp,g in items:
        if x+g['width']+padding>width:
            x=padding; y+=rowh+padding; rowh=0
        placed.append((cp,g,x,y)); x+=g['width']+padding; rowh=max(rowh,g['height'])
    need=y+rowh+padding; height=32
    while height<need: height*=2
    if height>max_edge: raise ValueError('font atlas exceeds maximum edge')
    return width,height,placed

def build_face(face,outroot:Path,resource_base:str):
    records=validate_face(face); width,height,placed=pack(records)
    rgba=bytearray(width*height*4)
    for cp,g,x,y in placed:
        for yy,row in enumerate(g['bitmap']):
            for xx,c in enumerate(row):
                if c=='#':
                    o=((y+yy)*width+x+xx)*4; rgba[o:o+4]=b'\xff\xff\xff\xff'
    face_id=face['faceId']; d=outroot/face_id; d.mkdir(parents=True,exist_ok=False)
    atlas=png_rgba(width,height,bytes(rgba)); write_create_only(d/f'{face_id}.png',atlas)
    m=face['metrics']; lines=[
      f'info face="{face["displayName"].replace(chr(34),"")}" size={m["lineHeight"]} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=0 padding=0,0,0,0 spacing=0,0',
      f'common lineHeight={m["lineHeight"]} base={m["baseline"]} scaleW={width} scaleH={height} pages=1 packed=0 alphaChnl=0 redChnl=4 greenChnl=4 blueChnl=4',
      f'page id=0 file="{face_id}.png"',f'chars count={len(placed)}']
    for cp,g,x,y in placed:
        lines.append(f'char id={cp} x={x} y={y} width={g["width"]} height={g["height"]} xoffset={g["xOffset"]} yoffset={g["yOffset"]} xadvance={g["xAdvance"]} page=0 chnl=15')
    ks=face.get('kerning') or []; lines.append(f'kernings count={len(ks)}')
    for k in ks: lines.append(f'kerning first={k["first"]} second={k["second"]} amount={k["amount"]}')
    write_create_only(d/f'{face_id}.fnt',('\n'.join(lines)+'\n').encode())
    tres=f'''[gd_resource type="FontVariation" load_steps=2 format=3]\n\n[ext_resource type="FontFile" path="res://{resource_base.rstrip('/')}/{face_id}/{face_id}.fnt" id="1_font"]\n\n[resource]\nbase_font = ExtResource("1_font")\nspacing_glyph = 0\nspacing_space = 0\nspacing_top = 0\nspacing_bottom = 0\n'''
    write_create_only(d/f'{face_id}.tres',tres.encode())
    write_create_only(d/f'{face_id}.master.json',(json.dumps(face,ensure_ascii=False,indent=2)+'\n').encode())
    return {'faceId':face_id,'glyphCount':len(placed),'atlas':[width,height], 'files':{p.name:sha256_bytes(p.read_bytes()) for p in sorted(d.iterdir())}}

def build(master_path:Path,outroot:Path):
    family=load_json(master_path)
    if family.get('schema')!=SCHEMA: raise ValueError(f'expected {SCHEMA}')
    godot=family.get('godot') or {}
    if godot.get('targetVersion')!='4.6.2': raise ValueError(ghodot.targetVersion must be 4.6.2')
    if godot.get('textureFilter')!='nearest' or godot.get('integerScaleOnly') is not True or godot.get('subpixelPositioning') is not False or godot.get('mipmaps') is not False or godot.get('systemFallback') is not False:
        raise ValueError('Godot policy must be nearest, integer-only, no subpixel, no mipmaps, no system fallback')
    if outroot.exists() and any(outroot.iterdir()): raise ValueError('output root must be empty/create-only')
    outroot.mkdir(parents=True,exist_ok=True)
    faces=[]
    for ref in family.get('faces') or []:
        p=(master_path.parent/ref['master']).resolve(); faces.append(build_face(load_json(p),outroot,godot['resourceBasePath']))
    manifest={'schema':'evavo.pixel-font-family.v2','familyId':family['familyId'],'displayName':family['displayName'],'version':family['version'],'godot':godot,'faces':faces,'sourceMasterSha256':sha256_bytes(master_path.read_bytes())}
    write_create_only(outroot/'pixel-font-family.json',(json.dumps(manifest,indent=2)+'\n').encode())
    return manifest

def validate_output(manifest_path:Path):
    m=load_json(manifest_path); root=manifest_path.parent
    if m.get('schema')!='evavo.pixel-font-family.v2': raise ValueError('invalid family output schema')
    for f in m['faces']:
        d=root/f['faceId']
        for name,digest in f['files'].items():
            p=d/name
            if not p.is_file() or sha256_bytes(p.read_bytes())!=digest: raise ValueError(f'{f["faceId"]}/{name} identity mismatch')
        text=(d/f'{f["faceId"]}.fnt').read_text()
        if f'chars count={f["glyphCount"]}' not in text: raise ValueError(f'{f["faceId"]}: BMFont count mismatch')
    return {'status':'passed','familyId':m['familyId'],'faces':len(m['faces'])}

def main():
    ap=argparse.ArgumentParser(description='EVAVO Pixel Font Studio v2 authored-master builder')
    sub=ap.add_subparsers(dest='cmd',required=True)
    b=sub.add_parser('build'); b.add_argument('--master',required=True); b.add_argument('--output',required=True)
    v=sub.add_parser('validate'); v.add_argument('--family',required=True)
    c=sub.add_parser('catalog')
    a=ap.parse_args()
    if a.cmd=='catalog': print(json.dumps({'schema':SCHEMA,'canonicalRuntime':['AngelCode BMFont .fnt','RGBA PNG'],'supports':['arbitrary glyph matrices','per-glyph offsets/advances','per-face kerning','Unicode','Godot 4.6.2 policy','create-only output','confusable QA']},indent=2)); return
    if a.cmd=='build': print(json.dumps(build(Path(a.master).resolve(),Path(a.output).resolve()),indent=2)); return
    print(json.dumps(validate_output(Path(a.family).resolve()),indent=2))
if __name__=='__main__': main()
