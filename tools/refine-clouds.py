from PIL import Image, ImageFilter
from pathlib import Path
import math
root=Path(__file__).resolve().parents[1] / 'vendor' / 'textures'
base=Image.open(root/'2k_earth_clouds.jpg').convert('L').resize((2048,1024))
pixels=base.load()
for name,phase,twist in [('jixi',.12,.15),('lingxi',.41,.10),('xunqi',.67,.21),('qitang',.86,.18)]:
 w,h=2048,1024
 out=Image.new('L',(w,h));dst=out.load()
 for y in range(h):
  lat=(y/(h-1)-.5)*math.pi
  shift=phase+math.sin(lat*3+phase*6)*twist
  for x in range(w):
   u=x/(w-1)
   sx=int(((u+shift)%1)*(w-1))
   v=y/(h-1)+math.sin(u*math.pi*2+phase*8)*.035*math.cos(lat)
   sy=min(h-1,max(0,int(v*(h-1))))
   dst[x,y]=pixels[sx,sy]
 out=out.filter(ImageFilter.GaussianBlur(.65))
 p=out.load()
 for y in range(h):p[w-1,y]=p[0,y]
 out.convert('RGB').save(root/'worlds'/(name+'-clouds.png'))
 print(name,'cloud map refined')
