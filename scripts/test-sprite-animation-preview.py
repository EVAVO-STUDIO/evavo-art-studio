from __future__ import annotations
import hashlib, json, struct, subprocess, tempfile, unittest, zlib
from pathlib import Path
SCRIPT=Path(__file__).resolve().parents[1]/'tools'/'sprite_animation_preview.py'
def png(color):
    sig=b'\x89PNG\r\n\x1a\n';w=h=2
    def ch(k,p):return struct.pack('>I',len(p))+k+p+struct.pack('>I',zlib.crc32(k+p)&0xffffffff)
    ih=struct.pack('>IIBBBBB',w,h,8,6,0,0,0);raw=b''.join(b'\x00'+bytes(color)*w for _ in range(h));return sig+ch(b'IHDR',ih)+ch(b'IDAT',zlib.compress(raw))+ch(b'IEND',b'')
class PreviewTests(unittest.TestCase):
    def test_preview_outputs_are_review_only(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d);frames=[]
            for i,c in enumerate(((255,0,0,255),(0,255,0,255),(0,0,255,255))):
                p=r/f'f{i}.png';p.write_bytes(png(c));frames.append({'path':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'durationMs':125})
            plan={'schema':'evavo.sprite-animation-preview-plan.v1','frames':frames,'fps':8,'scale':4,'background':'checker','createOnlyOutput':True,'repositoryMutation':False};pp=r/'plan.json';pp.write_text(json.dumps(plan));digest=hashlib.sha256(pp.read_bytes()).hexdigest()
            result=subprocess.run(['python',str(SCRIPT),'--workspace-root',str(r),'--plan',str(pp),'--plan-sha256',digest,'--output-root',str(r/'out')],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr);rec=json.loads(result.stdout);self.assertEqual(rec['frameCount'],3);self.assertTrue(rec['reviewOnly']);self.assertFalse(rec['automaticApproval']);self.assertFalse(rec['repositoryMutation']);self.assertTrue((r/'out'/'animation-preview.gif').is_file());self.assertTrue((r/'out'/'frame-strip.png').is_file())
    def test_plan_hash_tamper_fails(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d);p=r/'f.png';p.write_bytes(png((255,0,0,255)));plan={'schema':'evavo.sprite-animation-preview-plan.v1','frames':[{'path':'f.png','sha256':hashlib.sha256(p.read_bytes()).hexdigest()}],'fps':8,'scale':2,'createOnlyOutput':True,'repositoryMutation':False};pp=r/'plan.json';pp.write_text(json.dumps(plan));digest=hashlib.sha256(pp.read_bytes()).hexdigest();plan['fps']=12;pp.write_text(json.dumps(plan));result=subprocess.run(['python',str(SCRIPT),'--workspace-root',str(r),'--plan',str(pp),'--plan-sha256',digest,'--output-root',str(r/'out')],capture_output=True,text=True);self.assertEqual(result.returncode,2);self.assertIn('plan SHA-256 mismatch',result.stderr)
if __name__=='__main__':unittest.main()
