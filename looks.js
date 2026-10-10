// Art directions share navigation and data; each changes scene, camera and UI.
export const LOOKS={
 observatory:{name:'深空观测台',caption:'Alkaid · 深空观测',sky:'deep-field.webp',skyIntensity:.65,skyRotation:[0,2,.8],starCount:12000,starTint:[1,1,1],exposure:1.22,palette:[1,1,1],diagram:0,systemCamera:[16,120,172],systemTarget:[0,-7,0],mobileCamera:[0,220,285],closeYaw:.83,closeHeight:.36,closeDistance:5.8,orbitOpacity:.18,haloScale:42,haloOpacity:1,bloom:{strength:.55,radius:.32,threshold:.95}},
 cinema:{name:'静谧远航',caption:'Alkaid · 航行日志',sky:'deep-field.webp',skyIntensity:.40,skyRotation:[.2,1.5,.2],starCount:6200,starTint:[1,.96,.86],exposure:1.10,palette:[1.05,.96,.89],diagram:0,systemCamera:[46,68,225],systemTarget:[-10,-8,0],mobileCamera:[0,160,300],closeYaw:1.2,closeHeight:.17,closeDistance:4.9,orbitOpacity:.055,haloScale:65,haloOpacity:.8,bloom:{strength:.7,radius:.45,threshold:.9}},
 atlas:{name:'星图档案',caption:'Alkaid · 轨道制图',sky:'deep-field.webp',skyIntensity:.24,skyRotation:[0,1,0],starCount:3200,starTint:[.67,.84,1],exposure:1.25,palette:[.75,.93,1.12],diagram:1,systemCamera:[0,218,.2],systemTarget:[0,0,0],mobileCamera:[0,340,.3],closeYaw:.65,closeHeight:.95,closeDistance:7.1,orbitOpacity:.35,haloScale:24,haloOpacity:.45,bloom:{strength:.35,radius:.25,threshold:1.05}},
 nebula:{name:'星云梦境',caption:'Alkaid · 星云漫游',sky:'nebula-field.webp',skyIntensity:.93,skyRotation:[0,1.6,.7],starCount:17000,starTint:[.95,.82,1.13],exposure:1.28,palette:[1.04,.95,1.06],diagram:0,systemCamera:[-44,146,160],systemTarget:[0,-8,0],mobileCamera:[-20,228,288],closeYaw:.62,closeHeight:.50,closeDistance:6.0,orbitOpacity:.10,haloScale:59,haloOpacity:1.1,bloom:{strength:.8,radius:.5,threshold:.85}}
};
const requested=new URLSearchParams(location.search).get('style');
export const LOOK=LOOKS[requested]||LOOKS.observatory;
export const LOOK_ID=Object.hasOwn(LOOKS,requested)?requested:'observatory';
