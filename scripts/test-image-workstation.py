from __future__ import annotations
import hashlib, json, shutil, struct, subprocess, tempfile, unittest, zlib
from pathlib import Path
SCRIPT=Path(__file__).resolve().parents[1]/'tools'/'image_workstation.py'

def png(width=4,height=4):
    sig=b'\x89PNG\r\n\x1a\n'
    def chunk(k,p): return struct.pack('>I',len(p))+k+p+struct.pack('>I',zlib.crc32(k+p)&0xffffffff)
    ih=struct.pack('>IIBBBBB',width,height,8,6,0,0,0)
    rows=[]
    for y in range(height): rows.append(b'\x00'+b''.join(bytes((255,0,0,255 if (x+y)%2==0 else 0)) for x in range(width)))
    return sig+chunk(b'IHDR',ih)+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b'')

class ImageWorkstationTests(unittest.TestCase):
    def setUp(self): self.t=tempfile.TemporaryDirectory(); self.r=Path(self.t.name); (self.r/'in.png').write_bytes(png())
    def tearDown(self): self.t.cleanup()
    def run_plan_file(self):
        plan_path=self.r/'plan.json'; digest=hashlib.sha256(plan_path.read_bytes()).hexdigest()
        return subprocess.run(['python',str(SCRIPT),'--workspace-root',str(self.r),'--plan',str(plan_path),'--plan-sha256',digest,'--receipt',str(self.r/'receipt.json')],capture_output=True,text=True)
    def execute_plan(self,ops,out='out.png'):
        b=(self.r/'in.png').read_bytes(); plan={'schema':'evavo.raster-workstation-plan.v1','input':'in.png','output':out,'sourceSha256':hashlib.sha256(b).hexdigest(),'createOnlyOutput':True,'sourceOverwrite':False,'operations':ops}; (self.r/'plan.json').write_text(json.dumps(plan))
        return self.run_plan_file()
    def test_pixel_clean_pipeline(self):
        p=self.execute_plan([{'op':'trim-alpha','padding':1},{'op':'resize','width':8,'height':8,'filter':'nearest'},{'op':'alpha-threshold','threshold':128},{'op':'palette-quantize','colors':8},{'op':'outline','radius':1,'colour':'#000000ff'}]); self.assertEqual(p.returncode,0,p.stderr); rec=json.loads(p.stdout); self.assertEqual(rec['partialAlphaPixels'],0); self.assertRegex(rec['planSha256'],r'^[0-9a-f]{64}$'); self.assertFalse(rec['repositoryMutation']); self.assertFalse(rec['automaticApproval'])
    def test_create_only(self):
        (self.r/'out.png').write_bytes(b'x'); p=self.execute_plan([]); self.assertEqual(p.returncode,2); self.assertIn('create-only',p.stderr)
    def test_source_hash(self):
        plan={'schema':'evavo.raster-workstation-plan.v1','input':'in.png','output':'out.png','sourceSha256':'0'*64,'createOnlyOutput':True,'sourceOverwrite':False,'operations':[]}; (self.r/'plan.json').write_text(json.dumps(plan)); p=self.run_plan_file(); self.assertEqual(p.returncode,2); self.assertIn('source hash mismatch',p.stderr)
    def test_plan_hash_rejects_tamper(self):
        b=(self.r/'in.png').read_bytes(); plan={'schema':'evavo.raster-workstation-plan.v1','input':'in.png','output':'out.png','sourceSha256':hashlib.sha256(b).hexdigest(),'createOnlyOutput':True,'sourceOverwrite':False,'operations':[]}; plan_path=self.r/'plan.json'; plan_path.write_text(json.dumps(plan)); digest=hashlib.sha256(plan_path.read_bytes()).hexdigest(); plan['operations']=[{'op':'flip','axis':'horizontal'}]; plan_path.write_text(json.dumps(plan)); p=subprocess.run(['python',str(SCRIPT),'--workspace-root',str(self.r),'--plan',str(plan_path),'--plan-sha256',digest,'--receipt',str(self.r/'receipt.json')],capture_output=True,text=True); self.assertEqual(p.returncode,2); self.assertIn('plan SHA-256 mismatch',p.stderr)
    def test_composite_mask_and_adjust(self):
        shutil.copy2(self.r/'in.png',self.r/'overlay.png'); shutil.copy2(self.r/'in.png',self.r/'mask.png'); p=self.execute_plan([{'op':'composite','source':'overlay.png','x':0,'y':0,'opacity':0.5},{'op':'mask-alpha','mask':'mask.png','pixelArt':True},{'op':'levels','black':0,'white':255,'gamma':1.1},{'op':'brightness','factor':1.05},{'op':'contrast','factor':1.1},{'op':'saturation','factor':0.9}]); self.assertEqual(p.returncode,0,p.stderr)

if __name__=='__main__': unittest.main()
