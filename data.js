export const PLANETS = [
 {id:'jixi',name:'霁晞',roman:'Jìxī',type:'高反照岩质行星',service:'示例服务',color:'#b7d9dd',kind:0,seed:8,au:.42,period:24,orbit:14,radius:2.05,phase:2.5,tilt:.09,cloud:.16,atmosphere:'#8dbad4',url:'https://example.com/jixi',base:'https://example.com/jixi/v1',description:'雨止天青，白露未晞。薄薄的大气之下，银白高地与浅青色海湾映着瑶光。',moons:[{title:'晞露',desc:'天光未明时，薄雾在这颗小卫星上凝成银白露珠。这里提供一个可自行配置的示例入口。',url:'https://example.com/jixi',kind:3}]},
 {id:'mingai',name:'暝霭',roman:'Míng’ǎi',type:'风暴气态行星',service:'示例服务',color:'#a492b0',kind:1,seed:27,au:.68,period:50,orbit:23,radius:3.45,phase:4.6,tilt:.17,cloud:0,atmosphere:'#8d88b2',ring:.24,url:'https://example.com/mingai',base:'https://example.com/mingai/v1',description:'云气晦暝，风暴不息。灰紫与铜褐色云带环绕星体，深处的巨大涡旋缓缓舒展。',moons:[{title:'玄弦',desc:'深灰的弧面如一张未拨响的弦，风暴巨星的光沿着边缘流动。这里提供一个可自行配置的示例入口。',url:'https://example.com/mingai',kind:3},{title:'岚缄',desc:'封存雾岚的暗色小月。新的探索入口仍在等待点亮。',kind:4},{title:'流照',desc:'风暴短暂停息时，一束微光会越过它的晨昏线。可复制一个用于演示的示例地址。',copy:'https://example.com/mingai/v1',kind:3}]},
 {id:'lingxi',name:'聆汐',roman:'Língxī',type:'双月海洋行星',service:'示例服务',color:'#619fbc',kind:2,seed:13,au:1.05,period:95,orbit:33,radius:3.1,phase:.5,tilt:.21,cloud:.66,atmosphere:'#5bafff',url:'https://example.com/lingxi',base:'https://example.com/lingxi/v1',description:'双月引潮，百川汇海。深蓝全球洋之间，零星岛陆穿出云层，潮汐在漫长的海岸边往复。',moons:[{title:'望舒',desc:'它在海的这一边升起，替另一轮月亮守望潮汐。这里提供一个可自行配置的示例入口。',url:'https://example.com/lingxi',kind:3},{title:'既白',desc:'海的另一边，天色将白未白。它与望舒的引力在深海相逢；这里可复制一个示例地址。',copy:'https://example.com/lingxi/v1',kind:4}]},
 {id:'suxian',name:'素霰',roman:'Sùxiàn',type:'冰壳环系行星',service:'预留星域',color:'#dbd9c7',kind:4,seed:38,au:1.62,period:182,orbit:46,radius:4.4,phase:5.9,tilt:.38,cloud:0,atmosphere:null,ring:1,url:null,description:'如彼雨雪，先集维霰。层层碎冰铺展成宽阔的环，五颗冰卫星沿着寂静的轨道守望。',moons:[{title:'凝珀',kind:4,desc:'透明冰层封住远古落尘，仿佛一枚无人拾起的琥珀。这里是一处等待探索的预留入口。'},{title:'闻璧',kind:4,desc:'冰崖上刻着第二个词：「聆听」。有谁在很久以前，等候一声叩门之后的回音。这里是一处等待探索的预留入口。'},{title:'叩玉',kind:3,desc:'一块敲裂的冰玉上，首段刻痕写着：「叩门」。这似乎是三段旧信号的开头。这里是一处等待探索的预留入口。'},{title:'照隙',kind:4,desc:'细缝把瑶光分成很多窄窄的白昼，每一束都像被保存下来的瞬间。这里是一处等待探索的预留入口。'},{title:'应弦',kind:3,desc:'末段刻痕只有「作答」二字。叩门之后聆听，聆听之后作答，远行者如此约定。这里是一处等待探索的预留入口。'}]},
 {id:'xunqi',name:'浔萋',roman:'Xúnqī',type:'生物圈岩质行星',service:'示例画廊',color:'#87a993',kind:5,seed:51,au:2.55,period:359,orbit:60,radius:3.05,phase:3.35,tilt:.24,cloud:.43,atmosphere:'#8abccb',url:'https://example.com/xunqi',description:'蒹葭萋萋，水岸绵延。苔青大陆与浅海交错，云影越过山脊，每一处光照都孕育新的颜色。',moons:[{title:'青蘅',desc:'像一粒随风落入星海的青色种子，月面柔和地映着浔萋的大陆。由此进入示例画廊，开始图像创作。',url:'https://example.com/xunqi',kind:3}]},
 {id:'qitang',name:'栖棠',roman:'Qītáng',type:'温带岩质行星',service:'示例工作台',color:'#c79f95',kind:6,seed:72,au:3.9,period:680,orbit:75,radius:3.3,phase:.97,tilt:.28,cloud:.32,atmosphere:'#c8b4bf',ring:.3,url:'https://example.com/qitang',description:'海棠暖霞，万物有栖。外圈最安静的星球，赭粉高地被薄云轻覆，一道淡环掠过晨昏。',moons:[{title:'棠灯',desc:'栖棠的长夜里，一盏暖灯始终亮着。这里展示可自行配置的工作台入口。',url:'https://example.com/qitang',kind:3},{title:'归鸿',desc:'候鸟不知星海有多远，只记得归来的方向。归途的灯尚未点亮，新的探索入口仍在等待。',kind:4}]}
];

// Astronomical values come from the original 2D world bible. Display geometry
// is deliberately compressed; these fictional planets are not observed worlds.
export const STAR={id:'yaoguang',name:'瑶光',roman:'Alkaid',type:'蓝白主序星 · B3V',mass:6.1,radiusSolar:3.4,temperature:16800,
 description:'第七星，亦是这片星海的光源。蓝白色光球缓缓自转，细密的明暗纹理沿纬度流动，稀薄的光晕在边缘散开。六条轨道，收束于同一束光。'};
const radii=[1.04,3.2,1.31,2.7,1.18,1.09];
const notes=[
 '银白高地延伸至浅青海湾，通透的大气只留下几缕薄云。内圈的第一颗行星，以雨止天青之色回应瑶光。',
 '灰紫色高空云带与铜褐色深层云交错。风暴在纬向急流中拉长，一圈微尘在背光处若隐若现。',
 '深蓝全球洋包围着散落的岛弧。两颗小卫星牵引潮汐，海水反射柔和的蓝白光，云影慢慢越过海面。',
 '浅蓝裂隙穿过银白冰壳，碎冰环被分隔为宽窄不同的明暗带。五颗小卫星沿环外运行，守着尚未启用的星域。',
 '苔青大陆、河口与浅海相互交织。它与霁晞的名字同出《蒹葭》：萋萋与未晞，是遥相呼应的两句诗。',
 '赭粉色高地渐渐过渡到海棠色平原，薄云覆住晨昏线。淡环与两颗小卫星陪伴它走完最漫长的一年。'
];
export function orbitalDays(au){return 365.25*Math.sqrt(au**3/STAR.mass);}
export function orbitSeconds(au){return 24*(au/.42)**1.5;}
export function formatPeriod(days){return days>=365.25?`${days.toFixed(1)} 天 · ${(days/365.25).toFixed(2)} 年`:`${days.toFixed(1)} 天`;}
PLANETS.forEach((p,i)=>{
 p.radiusEarth=radii[i];p.periodDays=orbitalDays(p.au);p.period=orbitSeconds(p.au);
 p.description=notes[i];p.original={au:p.au,cloud:p.cloud,radius:p.radius,orbit:p.orbit};
});
