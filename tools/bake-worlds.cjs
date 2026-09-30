// Offline spherical texture authoring. No source Earth geography or AI API.
// simplex-noise (MIT) is only a development dependency.
const {createNoise3D}=require('simplex-noise');
const {PNG}=require('pngjs');
const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'../vendor/textures/worlds');fs.mkdirSync(root,{recursive:true});
const W=2048,H=1024;
function random(seed){return()=>{seed|=0;seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
function smooth(a,b,x){let t=clamp((x-a)/(b-a));return t*t*(3-2*t);}
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*clamp(t));
function save(name,png){fs.writeFileSync(path.join(root,name),PNG.sync.write(png));}
function noises(seed){const n=createNoise3D(random(seed));const f=(x,y,z,oct=6)=>{let sum=0,a=.5;for(let i=0;i<oct;i++){sum+=n(x,y,z)*a;x=x*2.04+17.1;y=y*2.04+9.2;z=z*2.04+4.7;a*=.49;}return sum;};return {n,f};}
const worlds=[
 {id:'jixi',seed:711,scale:1.7,sea:-.18,ocean:[18,67,76],shelf:[80,151,152],low:[154,159,142],high:[207,208,189],ice:[220,229,222]},
 {id:'lingxi',seed:1351,scale:2.8,sea:.245,ocean:[5,21,42],shelf:[16,91,102],low:[53,75,58],high:[132,125,94],ice:[180,207,213]},
 {id:'xunqi',seed:5168,scale:1.85,sea:-.035,ocean:[9,33,39],shelf:[24,94,85],low:[49,75,43],high:[127,138,88],ice:[195,209,192]},
 {id:'qitang',seed:726,scale:1.55,sea:-.30,ocean:[21,42,49],shelf:[60,91,89],low:[145,97,85],high:[202,157,127],ice:[221,204,192]},
 {id:'suxian',seed:381,scale:2.2,sea:-2,ocean:[0,0,0],shelf:[0,0,0],low:[129,160,170],high:[215,225,219],ice:[222,229,221]},
 {id:'mingai',seed:271,gas:true}
];
const report={resolution:[W,H],source:'original spherical noise, no Earth maps',worlds:[]};
for(const d of worlds){
 const {n,f}=noises(d.seed),color=new PNG({width:W,height:H}),relief=new PNG({width:W,height:H});let waterArea=0,totalArea=0;
 for(let j=0;j<H;j++){
  const lat=Math.PI*(j/(H-1)-.5),cy=Math.sin(lat),radius=Math.cos(lat);
  for(let i=0;i<W;i++){
   const lon=i/(W-1)*Math.PI*2,x=Math.cos(lon)*radius,z=Math.sin(lon)*radius,y=cy;const k=(j*W+i)*4;
   let rgb,h,water=0;
   if(d.gas){
    const warp=f(x*3.5,y*7,z*3.5,5);let band=y*35+warp*1.6;
    // A large embedded vortex distorts the bands locally, with no real Jupiter map.
    const dx=Math.atan2(Math.sin(lon-2.2),Math.cos(lon-2.2)),dy=(lat+.24)*2.6;const dist=Math.hypot(dx,dy);band+=Math.exp(-dist*dist*12)*Math.sin(Math.atan2(dy,dx)+dist*13)*2.2;
    let v=.5+.5*Math.sin(band+f(x*12,y*16,z*12)*.5);const thin=n(x*38,y*150,z*38)*.024;
    rgb=mix([82,71,84],[186,171,163],v);rgb=mix(rgb,[170,139,119],smooth(.4,.9,n(x*2.5,y*11,z*2.5))*.25);rgb=rgb.map(v=>v*(.95+thin));h=.5;
   }else{
    const wx=f(x*2.1+12,y*2.1,z*2.1,4),wy=f(x*2.1,y*2.1+29,z*2.1,4),wz=f(x*2.1,y*2.1,z*2.1+41,4);
    const xx=x*d.scale+wx*.6,yy=y*d.scale+wy*.6,zz=z*d.scale+wz*.6;
    const terrain=f(xx,yy,zz,8);const fine=f(x*72,y*72,z*72,4);const ridge=Math.pow(1-Math.abs(f(x*22,y*22,z*22,5)*1.6),5);
    const elevation=terrain-d.sea;water=1-smooth(-.005,.007,elevation);
    const depth=smooth(-.17,0,elevation);rgb=mix(d.ocean,d.shelf,Math.pow(depth,4)*.85);
    let land=mix(d.low,d.high,smooth(0,.46,elevation)*.78+ridge*.15);
    if(d.id==='xunqi'){const dry=smooth(.2,.6,Math.abs(y))*(1-smooth(.6,.8,Math.abs(y)));land=mix(land,[123,113,77],dry*smooth(-.2,.4,f(x*5+7,y*5,z*5))*.45);}
    if(d.id==='lingxi'){land=mix([38,64,51],[117,114,87],smooth(0,.25,elevation)+ridge*.10);}
    land=land.map(v=>v*(.96+fine*.17+ridge*.07));
    const coast=smooth(-.008,.009,elevation);rgb=mix(rgb,land,coast);
    let polar=smooth(d.id==='jixi'?.82:.91,.98,Math.abs(y)+n(x*8,y*8,z*8)*.022);
    if(d.id==='qitang')polar*=.45;
    rgb=mix(rgb,d.ice,polar);
    h=clamp(.43+Math.max(elevation,0)*.48+(fine*.025+ridge*.019)*(1-water));
    if(d.id==='suxian'){
     const crack=Math.pow(clamp(1-Math.abs(n(xx*1.7,yy*1.7,zz*1.7)+f(x*15,y*15,z*15)*.2)*11),3);
     const folds=.5+.5*f(xx*3,yy*3,zz*3);rgb=mix(d.low,d.high,smooth(-.35,.4,terrain));rgb=mix(rgb,[88,116,126],crack*.37);rgb=rgb.map(v=>v*(.96+fine*.10+folds*.04));h=.55+terrain*.13-crack*.035+fine*.012;water=0;
    }
    waterArea+=water*radius;totalArea+=radius;
   }
   for(let c=0;c<3;c++)color.data[k+c]=Math.round(clamp(rgb[c],0,255));color.data[k+3]=255;
   relief.data[k]=Math.round(h*255);relief.data[k+1]=Math.round(water*255);relief.data[k+2]=d.gas?180:220;relief.data[k+3]=255;
  }
 }
 save(d.id+'-albedo.png',color);save(d.id+'-relief.png',relief);
 // Separate global weather map, sampled on a sphere and stretched by latitude winds.
 if(!d.gas&&d.id!=='suxian'){
  const C=1024,D=512,cloud=new PNG({width:C,height:D});
  for(let j=0;j<D;j++)for(let i=0;i<C;i++){
   const lat=Math.PI*(j/(D-1)-.5);let lon=i/(C-1)*Math.PI*2;
   lon+=Math.sin(lat*5)*.23;
   const r=Math.cos(lat),x=Math.cos(lon)*r,y=Math.sin(lat),z=Math.sin(lon)*r;
   const w=f(x*3+6,y*3,z*3,4);const vapor=f(x*6+w*2,y*11,z*6-w*2,7);const streak=f(x*28,y*40,z*28,4);
   const v=smooth(.04,.46,vapor+streak*.16);const k=(j*C+i)*4;cloud.data[k]=cloud.data[k+1]=cloud.data[k+2]=Math.round(v*255);cloud.data[k+3]=255;
  }save(d.id+'-clouds.png',cloud);
 }
 report.worlds.push({id:d.id,seed:d.seed,waterFraction:d.gas?null:+(waterArea/totalArea).toFixed(4)});console.log(d.id,'baked',report.worlds.at(-1));
}
// Milky-way-like background: broad light band, irregular dust extinction and small star clusters.
const sky=new PNG({width:W,height:H});const {n,f}=noises(1977);
for(let j=0;j<H;j++)for(let i=0;i<W;i++){
 const a=i/(W-1)*Math.PI*2,b=(j/(H-1)-.5)*Math.PI;
 const x=Math.cos(a)*Math.cos(b),y=Math.sin(b),z=Math.sin(a)*Math.cos(b);
 const plane=x*.24+y*.87+z*.43;const knots=f(x*4,y*4,z*4,5);const band=Math.exp(-Math.pow((plane+knots*.09)/.17,2));
 const filaments=f(x*19,y*19,z*19,6);const dust=smooth(-.15,.28,filaments)*Math.exp(-Math.pow((plane+.024)/.065,2));
 const core=.6+.4*n(x*1.4+3,y*1.4,z*1.4);const glow=band*(.30+core*.6+knots*.3)*(1-dust*.9);
 const detail=band*smooth(.06,.45,filaments)*12;
 const k=(j*W+i)*4;sky.data[k]=Math.round(4+glow*23+detail*.80);sky.data[k+1]=Math.round(7+glow*28+detail*.92);sky.data[k+2]=Math.round(14+glow*37+detail*1.15);sky.data[k+3]=255;
}save('deep-field.png',sky);
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(report,null,2));console.log('background baked');
