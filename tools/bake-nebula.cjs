const {createNoise3D}=require('simplex-noise');const {PNG}=require('pngjs');const fs=require('node:fs');
let seed=8181;const random=()=>{seed|=0;seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const n=createNoise3D(random);function f(x,y,z){let s=0,a=.5;for(let i=0;i<7;i++){s+=n(x,y,z)*a;x=x*2.1+7;y=y*2.1+17;z=z*2.1+27;a*=.5;}return s;}
const W=2048,H=1024,im=new PNG({width:W,height:H});
for(let j=0;j<H;j++)for(let i=0;i<W;i++){
 const a=i/(W-1)*Math.PI*2,b=(j/(H-1)-.5)*Math.PI,x=Math.cos(a)*Math.cos(b),y=Math.sin(b),z=Math.sin(a)*Math.cos(b);
 const p=x*.24+y*.87+z*.43,w=f(x*3+10,y*3,z*3),band=Math.exp(-Math.pow((p+w*.28)/.34,2));
 const detail=f(x*12+w,y*12,z*12-w),dust=Math.max(0,detail+.10)*1.6;const brightness=band*(.50+w*.5)*(1-Math.min(.88,dust));
 const hue=.5+.5*n(x*1.6+7,y*1.6,z*1.6),veil=Math.max(0,f(x*3,y*3+20,z*3));const k=(j*W+i)*4;
 im.data[k]=6+brightness*(hue*66+13)+veil*7;im.data[k+1]=8+brightness*(51-hue*27)+veil*10;im.data[k+2]=18+brightness*(74+hue*16)+veil*18;im.data[k+3]=255;
}fs.writeFileSync('vendor/textures/worlds/nebula-field.png',PNG.sync.write(im));console.log('nebula field baked');
