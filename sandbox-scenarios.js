// Cosmic Sandbox 2.0 Phase 2: One-click Scenarios, Instant Phenomena,
// Anti-Gravity / Big Bang Rebirth, and Discoverable Cosmic Easter Eggs.

export const SANDBOX_SCENARIOS = Object.freeze([
 {
  id: 'default',
  name: '瑶光本系',
  icon: '✦',
  badge: '标准',
  summary: '瑶光主星 + 归墟暗伴体 + 六颗原始行星的实时 N-Body 演化'
 },
 {
  id: 'threebody',
  name: '三体乱纪元',
  icon: '✺',
  badge: '混沌',
  summary: '三颗恒星相互缠绕博弈，六星在恒纪元与乱纪元间剧烈摇摆'
 },
 {
  id: 'binary-bh',
  name: '双黑洞并合',
  icon: '◉',
  badge: '引力波',
  summary: '归墟与伴生黑洞旋进逼近，时空涟漪加剧直至铃振并合'
 },
 {
  id: 'rogue-bh',
  name: '流浪黑洞穿城',
  icon: '☄',
  badge: '灾变',
  summary: '16.5 M☉ 流浪黑洞高速斜切行星盘，正面撕扯六星轨道'
 },
 {
  id: 'slingshot',
  name: '引力弹弓靶场',
  icon: '▲',
  badge: '弹弓',
  summary: '远航号探测器贴近归墟极限借力加速，自动骑乘追踪视角'
 },
 {
  id: 'supernova',
  name: '超新星末日',
  icon: '💥',
  badge: '爆裂',
  summary: '红巨星伴星坠入主星瑶光，秒级触发席卷星系的极超新星爆发'
 }
]);

export const SANDBOX_PHENOMENA = Object.freeze([
 { id: 'detonate-star', label: '引爆主星超新星', icon: '💥', kind: 'danger', title: '立刻引爆场内最重恒星，激波横扫星系并坍缩出残骸' },
 { id: 'comet-storm', label: '彗星潮汐雨', icon: '☄', kind: 'cool', title: '从外缘向核心倾泻 8 颗冰核彗星，看潮汐撕裂流星雨' },
 { id: 'summon-pulsar', label: '脉冲星灯塔', icon: '✧', kind: 'violet', title: '投放一颗高速旋转双极脉冲星切入星系' },
 { id: 'anti-gravity', label: '反重力炸花', icon: '⚡', kind: 'gold', title: '切换负引力斥力场（-1.2×），一键把整个星系炸成礼花' },
 { id: 'big-bang', label: '奇点大爆炸', icon: '✦', kind: 'dawn', title: '清空旧宇宙，从奇点爆发全新原行星盘与新生恒星' }
]);

export const SANDBOX_EGGS = Object.freeze([
 { id: 'three-body', title: '乱纪元 · 三日凌空', desc: '场内同时存在至少 3 颗活跃恒星，行星实时切换恒纪元/乱纪元温态' },
 { id: 'slingshot-master', title: '洛希险胜 · 引力弹弓', desc: '探测器或行星贴近大质量天体借力加速至 ≥1.85× 初始速率' },
 { id: 'self-collapse', title: '造物主坍缩', desc: '在微调面板调大质量，亲手点燃行星成星或令恒星坍缩为黑洞' },
 { id: 'anti-gravity', title: '斥力星花 · 反重力场', desc: '将引力倍率推入负值区域，翻转万有引力让星系绚丽炸散' },
 { id: 'big-bang', title: '万物归墟 · 奇点重开', desc: '触发奇点大爆炸重开新生宇宙（或令黑洞吞尽所有星辰）' }
]);

export function computeEraTag(planetPos, aliveStars) {
 if (!aliveStars || aliveStars.length < 3) return null;
 let flux = 0;
 let closeCount = 0;
 for (const st of aliveStars) {
  const d = Math.max(planetPos.distanceTo(st.pos), 4);
  flux += (st.mass / 6.1) * (950 / (d * d));
  if (d < 52) closeCount++;
 }
 if (closeCount >= 3 || flux > 2.9) return '三日凌空 · 炙烤';
 if (flux > 1.75) return '酷热乱纪元';
 if (flux < 0.28) return '严寒乱纪元';
 return '恒纪元';
}

export function applySandboxScenario(scenarioId, api) {
 // api provides: initBase(), hide(id), fling(id, pos, vel), setMass(id, m),
 // setGravity(g), setBhMass(m), spawn(type, pos, vel, opts), follow(id),
 // select(id), cameraView(preset), banner(title, detail, badge)
 api.setGravity(1.0);
 api.setBhMass(12.4);
 api.initBase();

 if (scenarioId === 'default') {
  api.cameraView('overview');
  api.banner('剧本 · 瑶光本系', '标准双星构型就绪 · 自由探索、造物发射或抓取制造灾变', 'info');
  return;
 }

 if (scenarioId === 'threebody') {
  api.hide('guixu');
  // Asymmetric triangular three-star choreography (guaranteed lively chaotic dance!)
  api.fling('yaoguang', [-28, 0, -14], [3.6, 0.2, -3.2]);
  api.spawn('star-red', [30, 2.5, -12], [-1.8, -0.3, 4.4], { mass: 5.2, radius: 5.7, name: '参宿赤星', silent: true });
  api.spawn('star-blue', [0, -2.0, 32], [-2.0, 0.1, -1.6], { mass: 5.6, radius: 4.8, name: '天枢蓝伴', silent: true });
  api.cameraView('overview');
  api.banner('剧本 · 三体乱纪元', '三颗恒星相互缠绕博弈，六星轨道陷入恒纪元与乱纪元交替！', 'egg');
  return;
 }

 if (scenarioId === 'binary-bh') {
  // Move Alkaid gently to outer rim so outer planets remain lit while binary BH dominates center
  api.fling('yaoguang', [92, 6, -54], [2.4, 0, 3.8]);
  api.setBhMass(14.0);
  api.fling('guixu', [-18, 0, 0], [1.4, 0, -5.6]);
  api.spawn('bh', [20, 0.5, 0], [-1.6, 0, 6.4], { mass: 11.5, radius: 2.05, name: '幽墟伴洞', silent: true });
  // Ring of comets witnessing the inspiral!
  for (let i = 0; i < 6; i++) {
   const a = (i / 6) * Math.PI * 2;
   const r = 34 + (i % 2) * 8;
   api.spawn('comet', [Math.cos(a) * r, (i % 3 - 1) * 2.5, Math.sin(a) * r], [-Math.sin(a) * 10.5, 0, Math.cos(a) * 10.5], { single: true, silent: true });
  }
  api.cameraView('barycenter');
  api.banner('剧本 · 双黑洞并合', '归墟与幽墟伴洞旋进逼近，注意观察时空网格的引力波涟漪与铃振！', 'gw');
  return;
 }

 if (scenarioId === 'rogue-bh') {
  api.setBhMass(16.5);
  api.fling('guixu', [-76, 3.0, -34], [17.8, -0.4, 8.8]);
  api.cameraView('overview');
  api.banner('剧本 · 流浪黑洞穿城', '16.5 M☉ 流浪黑洞正高速斜切瑶光行星盘，迎接星系级动荡！', 'tde');
  return;
 }

 if (scenarioId === 'slingshot') {
  api.setBhMass(18.0);
  api.fling('yaoguang', [16, 0, -18], [1.2, 0, 2.2]);
  api.fling('guixu', [-24, 0, 10], [1.5, 0, -3.5]);
  api.spawn('gas', [34, 0, 26], [-5.2, 0, -3.4], { mass: 1.15, radius: 4.1, name: '巨木借力星', silent: true });
  // Pre-aimed slingshot probe poised to skim right past Guixu's photon sphere for >2x Δv!
  const probe = api.spawn('probe', [6, 0.4, 42], [-10.2, 0, -9.8], { name: '远航号探测器', silent: true });
  if (probe) {
   api.select(probe.id);
   api.follow(probe.id);
  }
  api.banner('剧本 · 引力弹弓靶场', '远航号正扑向归墟引力深井，准备见证贴脸借力加速（≥2× Δv）！', 'slingshot');
  return;
 }

 if (scenarioId === 'supernova') {
  api.fling('guixu', [-74, 4, 26], [1.8, 0, -2.6]);
  api.fling('yaoguang', [-2, 0, 0], [1.8, 0, 0]);
  api.spawn('star-red', [17, 0.5, 2], [-11.5, 0, -1.2], { mass: 7.4, radius: 5.9, name: '赤霄伴星', silent: true });
  api.cameraView('overview');
  api.banner('剧本 · 超新星末日', '赤霄伴星正正面撞向主星瑶光，极超新星激波即将席卷六星！', 'supernova');
 }
}
