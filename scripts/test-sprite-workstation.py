from __future__ import annotations
import hashlib,json,struct,subprocess,tempfile,unittest,zlib
from pathlib import Path
SCRIPT=Path(__file__).resolve().parents[1]/'tools'/'sprite_workstation.py'
def png(c):
    s=b'\x89PNG\r\n\x1a\n';w=h=2
    def ch(k,p):return struct.pack('>I',len(p))+k+p+struct.pack('>I',zlib.crc32(k+p)&0xffffffff)
    ih=struct.pack('>IIBBBBB',w,h,8,6,0,0,0);raw=b''.join(b'\x00'+bytes(c)*2 for _ in range(2));return s+ch(b'IHDR',ih)+ch(b'IDAT',zlib.compress(raw))+ch(b'IEND',b'')
class SpriteWorkstationTests(unittest.TestCase):
    def test_build(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d);frames=[]
            for i,c in enumerate(((255,0,0,255),(0,0,255,255),(0,255,0,255))):
                p=r/f'f{i}.png';p.write_bytes(png(c));frames.append({'id':f'run_{i}','animation':'run','path':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'durationMs':125})
            plan={'schema':'evavo.sprite-workstation-plan.v1','repositoryMutation':False,'automaticApproval':False,'cell':{'width':8,'height':8},'columns':2,'hardAlpha':True,'frames':frames,'animations':{'run':{'fps':8,'loop':True}},'godotAtlasPath':'res://assets/run.png'};(r/'plan.json').write_text(json.dumps(plan))
            result=subprocess.run(['python',str(SCRIPT),'--workspace-root',str(r),'--plan',str(r/'plan.json'),'--output-root',str(r/'out')],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr);receipt=json.loads(result.stdout);self.assertEqual(receipt['frameCount'],3);self.assertEqual(receipt['animationCount'],1);self.assertFalse(receipt['repositoryMutation']);self.assertFalse(receipt['automaticApproval'])
            tres=(r/'out'/'sprite_frames.tres').read_text();self.assertTrue(tres.startswith('[gd_resource type="SpriteFrames"'));self.assertIn('AtlasTexture_0000',tres);self.assertIn('&"run"',tres)
    def test_create_only_output(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d);(r/'out').mkdir();(r/'plan.json').write_text('{}');result=subprocess.run(['python',str(SCRIPT),'--workspace-root',str(r),'--plan',str(r/'plan.json'),'--output-root',str(r/'out')],capture_output=True,text=True);self.assertEqual(result.returncode,2);self.assertIn('create-only',result.stderr)
if __name__=='__main__':unittest.main()
