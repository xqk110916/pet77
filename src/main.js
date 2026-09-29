import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, currentMonitor } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { emitTo, listen } from '@tauri-apps/api/event';
import { ANIMS, FRAME_W, FRAME_H, SCALES, SPEED_MUL } from './animations.js';
import { GameState } from './game-state.js';
import { genReply, parseReminder, chatterLine } from './chat-engine.js';

const win = getCurrentWindow();
const petEl = document.getElementById('pet');
const foodEl = document.getElementById('food');
const ballEl = document.getElementById('ball');

// 诊断：JS 错误转发到 Rust 终端
window.addEventListener('error', (e) => {
  invoke('debug_log', { msg: `error: ${e.message} @${e.filename}:${e.lineno}` }).catch(() => {});
});
window.addEventListener('unhandledrejection', (e) => {
  invoke('debug_log', { msg: `rejection: ${e.reason}` }).catch(() => {});
});

// ---------------- 窗口引用 ----------------
let statsWin = null, chatWin = null, menuWin = null;
async function refWins() {
  statsWin = statsWin || await WebviewWindow.getByLabel('stats').catch(() => null);
  chatWin = chatWin || await WebviewWindow.getByLabel('chat').catch(() => null);
  menuWin = menuWin || await WebviewWindow.getByLabel('menu').catch(() => null);
}

// ---------------- 尺寸 / 显示器 ----------------
let scale = 0.5;
let scaleIdx = 0;
let PET_W = FRAME_W * scale;
let PET_H = FRAME_H * scale;
let wa = { x: 0, y: 0, width: 1920, height: 1040 }; // 物理像素工作区
let pos = { x: 0, y: 0 };                            // 逻辑坐标下窗口左上角

async function refreshMonitor() {
  const m = await currentMonitor().catch(() => null);
  const r = await invoke('get_work_area');
  wa = r;
  // get_work_area 返回物理像素；outerPosition 也是物理像素
  // dpiScale 用系统 DPI 缩放（内容缩放 scale 与窗口大小联动，与坐标系无关）
  dpiScale = await win.scaleFactor().catch(() => 1);
  void m;
}

let dpiScale = 1;

async function syncPosFromWindow() {
  const p = await win.outerPosition();
  pos = { x: p.x / dpiScale, y: p.y / dpiScale };
}

async function applyPos() {
  const maxW = (wa.x + wa.width) / dpiScale;
  const maxH = (wa.y + wa.height) / dpiScale;
  pos.x = Math.min(Math.max(pos.x, wa.x / dpiScale), maxW - PET_W);
  pos.y = Math.min(Math.max(pos.y, wa.y / dpiScale), maxH - PET_H);
  await win.setPosition(new LogicalPosition(Math.round(pos.x), Math.round(pos.y)));
  await moveStatsWindow();
}

const STATS_H = 130, STATS_W = 288;
async function moveStatsWindow() {
  try {
    if (!statsWin || !(await statsWin.isVisible())) return;
    let sy = pos.y - STATS_H + Math.round(PET_H * 0.12);
    if (sy < wa.y / dpiScale) sy = pos.y + PET_H;
    let sx = pos.x - (STATS_W - PET_W) / 2;
    sx = Math.min(Math.max(sx, wa.x / dpiScale), (wa.x + wa.width) / dpiScale - STATS_W);
    await statsWin.setPosition(new LogicalPosition(Math.round(sx), Math.round(sy)));
  } catch { /* stats 窗口可能尚未就绪 */ }
}

// ---------------- 动画播放器 ----------------
let anim = { def: ANIMS.doze, frame: 0, acc: 0, loopsLeft: Infinity, onEnd: null, ended: false };

function setAnim(name, loops = Infinity, onEnd = null) {
  const def = ANIMS[name] || ANIMS.doze;
  anim = { def, frame: 0, acc: 0, loopsLeft: loops, onEnd, ended: false };
  petEl.style.setProperty('--row', def.row);
  petEl.style.setProperty('--col', 0);
}

function setAnimIf(name) {
  if (anim.def !== ANIMS[name]) setAnim(name);
}

function animStep(dt) {
  anim.acc += dt;
  const spf = 1 / (anim.def.fps * SPEED_MUL);
  while (anim.acc >= spf) {
    anim.acc -= spf;
    if (anim.ended) break;
    anim.frame++;
    if (anim.frame >= anim.def.frames) {
      if (anim.loopsLeft !== Infinity) {
        anim.loopsLeft -= 1;
        if (anim.loopsLeft <= 0) {
          anim.frame = anim.def.frames - 1;
          anim.ended = true;
          const cb = anim.onEnd;
          anim.onEnd = null;
          if (cb) cb();
          break;
        }
      }
      anim.frame = 0;
    }
  }
  petEl.style.setProperty('--col', anim.frame);
}

// ---------------- 行为状态机 ----------------
let mode = 'boot'; // ai | walk | sleep | eating | playing | dragging | demo
let walkTarget = null;
let walkSpeed = 44;
let aiTimer = null;
let cooldown = { feed: 0, play: 0 };
let gs = new GameState();

function scheduleAI(delay) {
  clearTimeout(aiTimer);
  aiTimer = setTimeout(decideNext, delay);
}

function decideNext() {
  if (mode !== 'ai') return;
  if (gs.energy < 18) return startSleep(true);

  if (gs.hunger < 25 && Math.random() < 0.5) {
    setAnim('alert', 1, () => { bubble('饿了…给点吃的喵？'); scheduleAI(2500); });
    return;
  }

  // 安静模式：只在原地小动作，不自主跑动（跑动仅通过动作演示/拖拽触发）
  const r = Math.random();
  if (r < 0.40) return idleAction('sitWatch', 4000 + Math.random() * 4000);
  if (r < 0.65) return idleAction('curious', 3000 + Math.random() * 3000);
  if (r < 0.85) return idleAction('swipe', 3000 + Math.random() * 3000);
  idleAction('doze', 5000 + Math.random() * 4000);
}

function idleAction(name, ms) {
  setAnim(name);
  scheduleAI(ms);
}

function startWalk(speedMul = 1) {
  mode = 'walk';
  const lo = wa.x / dpiScale + 4;
  const hi = (wa.x + wa.width) / dpiScale - PET_W - 4;
  walkTarget = lo + Math.random() * Math.max(1, hi - lo);
  walkSpeed = 31 * speedMul;
  setAnim(walkTarget > pos.x ? 'walkRight' : 'walkLeft');
}

function walkStep(dt) {
  if (mode !== 'walk') return;
  const d = walkTarget - pos.x;
  if (Math.abs(d) <= walkSpeed * dt) {
    pos.x = walkTarget;
    mode = 'ai';
    setAnim('sitWatch');
    scheduleAI(800 + Math.random() * 1500);
  } else {
    pos.x += Math.sign(d) * walkSpeed * dt;
  }
  applyPos();
}

function startSleep(auto) {
  mode = 'sleep';
  setAnim('doze');
  bubble(auto ? '累了…先睡会儿 Zzz' : '晚安 Zzz', 3000);
}

function wake() {
  if (mode !== 'sleep') return;
  mode = 'ai';
  setAnim('sitWatch', 1, () => scheduleAI(600));
  bubble('睡醒啦~');
}

// ---------------- 拖拽（系统级 startDragging + 轮询跟随） ----------------
let press = null;

petEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  press = { t: performance.now(), sx: e.screenX, sy: e.screenY, dragging: false, timer: null };
  press.timer = setTimeout(startDrag, 170);
});

document.addEventListener('pointermove', (e) => {
  if (!press || press.dragging) return;
  if (Math.hypot(e.screenX - press.sx, e.screenY - press.sy) > 6) {
    clearTimeout(press.timer);
    startDrag();
  }
});

document.addEventListener('pointerup', () => {
  if (!press) return;
  clearTimeout(press.timer);
  if (!press.dragging) {
    if (performance.now() - press.t < 400) onPetClick();
    press = null;
  }
  // 拖拽中不清理 press，交给 pollDragEnd 检测系统拖拽结束后落地
});

async function startDrag() {
  if (!press || press.dragging) return;
  press.dragging = true;
  dragStartPos = { x: pos.x, y: pos.y };
  clearTimeout(aiTimer);
  mode = 'dragging';
  petEl.classList.add('grabbing');
  setAnim('alert', 3);
  try { await win.startDragging(); } catch { /* ignore */ }
  pollDragEnd();
}

let dragStartPos = null;

// 拖拽期间：轮询窗口位置 → 更新 pos、朝向跑动动画、状态栏实时跟随
function pollDragEnd() {
  let last = null, stable = 0;
  const iv = setInterval(async () => {
    if (!press) { clearInterval(iv); return; }
    let p;
    try { p = await win.outerPosition(); } catch { clearInterval(iv); return; }
    const lx = p.x / dpiScale, ly = p.y / dpiScale;
    if (last) {
      const dx = lx - last.x;
      if (Math.abs(dx) > 1) {
        setAnimIf(dx > 0 ? 'walkRight' : 'walkLeft');
      }
      pos = { x: lx, y: ly };
      moveStatsWindow();
    }
    const key = `${p.x},${p.y}`;
    if (last && last.key === key) {
      stable++;
      if (stable >= 3) { clearInterval(iv); finishDrag(); }
    } else {
      stable = 0;
      last = { key, x: lx, y: ly };
    }
  }, 60);
}

async function finishDrag() {
  petEl.classList.remove('grabbing');
  press = null;
  await refreshMonitor();
  await syncPosFromWindow();
  await applyPos(); // 仅夹取到屏幕范围内，不掉落
  mode = 'ai';
  setAnim('sitWatch', 1, () => scheduleAI(500));
  // 拖得够远时说句话
  if (dragStartPos && Math.hypot(pos.x - dragStartPos.x, pos.y - dragStartPos.y) > 90) {
    const t = ['呼…到了到了喵！', '这里风景不错喵~', '嗖的一下就到了！', '呀，换个地方待着喵'];
    bubble(t[(Math.random() * t.length) | 0]);
  }
  dragStartPos = null;
}

// ---------------- 互动 ----------------
const PET_WORDS = ['喵~', '咕噜咕噜…', '喵♥', '摸摸头…', '好舒服~'];

function onPetClick() {
  if (mode === 'sleep') { wake(); return; }
  if (mode === 'eating' || mode === 'playing' || mode === 'dragging') return;
  clearTimeout(aiTimer);
  mode = 'ai';
  setAnim('alert', 1, () => scheduleAI(700));
  spawnFx('♥', PET_W / 2, PET_H * 0.25);
  gs.mood = Math.min(100, gs.mood + 3);
  gainXp(2);
  bubble(PET_WORDS[(Math.random() * PET_WORDS.length) | 0]);
  saveSoon();
}

petEl.addEventListener('dblclick', () => doPlay());

function doFeed() {
  if (mode === 'eating' || mode === 'playing') return;
  if (cooldown.feed > Date.now()) return bubble('还没饿呢喵');
  if (gs.hunger > 95) return bubble('吃不下了喵…');
  if (mode === 'sleep') wake();
  clearTimeout(aiTimer);
  mode = 'eating';
  cooldown.feed = Date.now() + 5000;
  const foods = ['🍗', '🐟', '🥛'];
  foodEl.textContent = foods[(Math.random() * foods.length) | 0];
  foodEl.classList.add('show');
  setAnim('eat', 20, () => {
    foodEl.classList.remove('show');
    gs.hunger = Math.min(100, gs.hunger + 38);
    gs.mood = Math.min(100, gs.mood + 6);
    gainXp(8);
    bubble('喵呜~ 好吃！');
    mode = 'ai';
    scheduleAI(1200);
  });
}

function doPlay() {
  if (mode === 'eating' || mode === 'playing' || mode === 'dragging') return;
  if (gs.energy < 15) {
    bubble('累了…不想动喵');
    return startSleep(true);
  }
  clearTimeout(aiTimer);
  mode = 'playing';
  ballEl.classList.remove('bounce');
  void ballEl.offsetWidth; // 重触发 CSS 动画
  ballEl.classList.add('bounce');
  setAnim('pounce', 3, () => {
    gs.mood = Math.min(100, gs.mood + 26);
    gs.energy = Math.max(0, gs.energy - 14);
    gs.hunger = Math.max(0, gs.hunger - 4);
    gainXp(12);
    bubble('好玩！再来！');
    mode = 'ai';
    scheduleAI(1000);
  });
}

function gainXp(n) {
  if (gs.addXp(n)) {
    spawnFx('🎉', PET_W / 2, PET_H * 0.15);
    bubble(`升级喵！！ Lv.${gs.level}`, 3200);
    setAnim('alert', 2);
  }
  saveSoon();
}

// ---------------- 气泡 / 粒子 ----------------
// 语音气泡：独立窗口渲染，锚定猫头顶（ax=猫中心x, ay=猫顶y, ph=猫高, wa=逻辑工作区）
function bubble(text, ms) {
  if (!text) return;
  emitTo('bubble', 'pet://bubble', {
    text,
    ms,
    ax: Math.round(pos.x + PET_W / 2),
    ay: Math.round(pos.y),
    ph: Math.round(PET_H),
    wa: {
      x: wa.x / dpiScale,
      y: wa.y / dpiScale,
      width: wa.width / dpiScale,
      height: wa.height / dpiScale,
    },
  }).catch(() => {});
}

function spawnFx(char, x, y) {
  const el = document.createElement('div');
  el.className = 'fx float';
  el.textContent = char;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

// ---------------- 缩放 ----------------
async function setScale(idx) {
  idx = Math.max(0, Math.min(SCALES.length - 1, idx));
  if (idx === scaleIdx) return;
  await syncPosFromWindow();
  const oldW = PET_W, oldH = PET_H;
  scaleIdx = idx;
  scale = SCALES[idx];
  localStorage.setItem('pet77_scale', String(scale));
  document.documentElement.style.setProperty('--scale', scale);
  PET_W = FRAME_W * scale;
  PET_H = FRAME_H * scale;
  try {
    await win.setSize(new LogicalSize(Math.round(PET_W), Math.round(PET_H)));
  } catch { /* ignore */ }
  // 保持底部中心锚点不变
  pos.x += (oldW - PET_W) / 2;
  pos.y += oldH - PET_H;
  await applyPos();
  bubble(`大小 ${Math.round(scale * 100)}%`);
  saveSoon();
}

// ---------------- 菜单窗口 ----------------
let menuOpen = false;

async function openMenuWindow(e) {
  if (!menuWin) return;
  menuOpen = true;
  const autostart = await invoke('is_autostart').catch(() => false);
  const statsVisible = statsWin ? await statsWin.isVisible().catch(() => false) : false;
  emitTo('menu', 'pet://menu-open', { autostart, statsVisible }).catch(() => {});
  // 等菜单自撑高度后定位显示（按展开子菜单后的最大宽度预留，避免右侧出屏）
  await new Promise((r) => setTimeout(r, 70));
  let mx = pos.x + e.clientX, my = pos.y + e.clientY;
  const ms = await menuWin.outerSize().catch(() => null);
  const mw = Math.max(ms ? ms.width / dpiScale : 210, 350);
  const mh = Math.max(ms ? ms.height / dpiScale : 400, 420);
  mx = Math.min(Math.max(mx, wa.x / dpiScale), (wa.x + wa.width) / dpiScale - mw);
  my = Math.min(Math.max(my, wa.y / dpiScale), (wa.y + wa.height) / dpiScale - mh);
  try {
    await menuWin.setPosition(new LogicalPosition(Math.round(mx), Math.round(my)));
    await menuWin.show();
  } catch { /* ignore */ }
}

listen('pet://menu-action', (e) => {
  menuOpen = false;
  handleAction(e.payload);
});

function handleAction(action) {
  if (!action) return;
  if (action.startsWith('anim:')) {
    const key = action.slice(5);
    if (!ANIMS[key]) return;
    clearTimeout(aiTimer);
    mode = 'demo';
    setAnim(key, ANIMS[key].loop ? Math.max(1, Math.round(3 * ANIMS[key].fps / ANIMS[key].frames)) : 1, () => {
      mode = 'ai';
      scheduleAI(400);
    });
    return;
  }
  switch (action) {
    case 'feed': doFeed(); break;
    case 'play': doPlay(); break;
    case 'sleep': mode === 'sleep' ? wake() : startSleep(false); break;
    case 'chat': openChat(); break;
    case 'toggle-stats':
      if (statsWin) {
        statsWin.isVisible().then((v) => (v ? statsWin.hide() : statsWin.show()));
      }
      break;
    case 'toggle-autostart':
      invoke('toggle_autostart').then((on) => bubble(on ? '已设置开机自启' : '已取消开机自启')).catch(() => {});
      break;
    case 'scale-up': setScale(scaleIdx + 1); break;
    case 'scale-down': setScale(scaleIdx - 1); break;
    case 'exit': saveNow(); invoke('exit_app'); break;
  }
}

// ---------------- 聊天 / 提醒 ----------------
let reminders = [];
try { reminders = JSON.parse(localStorage.getItem('pet77_reminders') || '[]'); } catch { reminders = []; }
const saveReminders = () => localStorage.setItem('pet77_reminders', JSON.stringify(reminders.filter((r) => !r.fired)));

const fmtTime = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function sendCat(text) {
  if (!text) return;
  emitTo('chat', 'pet://chat-msg', { role: 'cat', text, ts: Date.now() }).catch(() => {});
  bubble(text.length > 46 ? `${text.slice(0, 46)}…` : text, 3200);
  // 聊天窗隐藏时冒个 💬 提示
  (async () => {
    try {
      if (chatWin && !(await chatWin.isVisible())) spawnFx('💬', PET_W / 2, PET_H * 0.1);
    } catch { /* ignore */ }
  })();
  if (mode === 'ai') setAnim('alert', 1, () => scheduleAI(400));
}

const reply = (text) => { if (text) setTimeout(() => sendCat(text), 420 + Math.min(900, text.length * 22)); };

async function openChat() {
  if (!chatWin) return;
  if (await chatWin.isVisible().catch(() => false)) {
    await chatWin.setFocus().catch(() => {});
    return;
  }
  const cw = 320, ch = 460;
  let cx = pos.x - cw - 8, cy = pos.y - 60;
  if (cx < wa.x / dpiScale) cx = Math.min(pos.x + PET_W + 8, (wa.x + wa.width) / dpiScale - cw);
  cy = Math.max(wa.y / dpiScale + 8, Math.min(cy, (wa.y + wa.height) / dpiScale - ch - 8));
  try {
    await chatWin.setPosition(new LogicalPosition(Math.round(cx), Math.round(cy)));
    await chatWin.show();
    await chatWin.setFocus().catch(() => {});
  } catch { /* ignore */ }
}

listen('tray://chat', () => openChat());

listen('pet://chat-send', (e) => {
  const text = (e.payload?.text || '').trim();
  if (!text) return;
  gs.mood = Math.min(100, gs.mood + 1);
  gainXp(1);

  if (/睡觉|休息吧|去睡/.test(text) && mode !== 'sleep') return reply('好喵，我先睡会儿 Zzz'), startSleep(false);
  if (/起床|醒来|别睡/.test(text)) { wake(); return reply('喵呜~ 醒了！'); }
  if (/来玩|陪我玩|玩耍|逗你/.test(text)) { doPlay(); return reply('耶！接球喵！'); }

  const rem = parseReminder(text);
  if (rem.cancel) {
    const last = [...reminders].reverse().find((r) => !r.fired);
    if (last) {
      reminders = reminders.filter((r) => r !== last);
      saveReminders();
      return reply(`好，已取消「${last.text}」的提醒喵`);
    }
    return reply('现在没有进行中的提醒喵');
  }
  if (rem.pending) {
    if (rem.at) {
      reminders.push(rem.item);
      saveReminders();
      return reply(`收到喵！我会在 ${fmtTime(rem.at)} 提醒你「${rem.item.text}」📌`);
    }
    return reply('想什么时候提醒你呢？这样说就行：「30分钟后提醒我喝水」或「明天9点提醒我开会」喵');
  }
  reply(genReply(text, {
    hunger: gs.hunger, mood: gs.mood, energy: gs.energy, level: gs.level, sleeping: mode === 'sleep',
  }));
});

// 到点提醒（1s 轮询，重启后补发过期项）
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const r of reminders) {
    if (!r.fired && r.at <= now) {
      r.fired = true;
      changed = true;
      sendCat(`⏰ 叮咚！该「${r.text}」啦喵！`);
      spawnFx('⏰', PET_W / 2, PET_H * 0.2);
      if (mode === 'ai') setAnim('alert', 2);
    }
  }
  if (changed) saveReminders();
}, 1000);

// 猫主动搭话
let nextChatAt = Date.now() + 120000 + Math.random() * 180000;
setInterval(() => {
  if (Date.now() < nextChatAt) return;
  nextChatAt = Date.now() + 180000 + Math.random() * 240000;
  if (mode !== 'ai') return;
  sendCat(chatterLine({ hunger: gs.hunger, mood: gs.mood, energy: gs.energy }));
}, 30000);

// ---------------- 数值循环 / 持久化 ----------------
function currentTickMode() {
  if (mode === 'sleep') return 'doze';
  if (mode === 'walk') return 'walk';
  return 'idle';
}

setInterval(() => {
  const up = gs.tick(currentTickMode());
  if (up) {
    spawnFx('🎉', PET_W / 2, PET_H * 0.15);
    bubble(`升级喵！！ Lv.${gs.level}`, 3200);
  }
  emitTo('stats', 'pet://stats', gs.toJSON()).catch(() => {});
  if (mode === 'sleep' && gs.energy >= 95) wake();
}, 1000);

let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 1500);
}

async function saveNow() {
  try {
    await invoke('save_state', { state: gs.toJSON() });
  } catch { /* ignore */ }
}

setInterval(saveNow, 20000);
window.addEventListener('beforeunload', saveNow);

// ---------------- 主循环 ----------------
let last = performance.now();
function raf(t) {
  const dt = Math.min((t - last) / 1000, 0.1);
  last = t;
  animStep(dt);
  walkStep(dt);
  requestAnimationFrame(raf);
}

// ---------------- 右键菜单 ----------------
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  openMenuWindow(e);
});

// ---------------- 启动 ----------------
(async function init() {
  // 恢复缩放档位
  const saved = parseFloat(localStorage.getItem('pet77_scale') ?? '0.5');
  scaleIdx = Math.max(0, SCALES.indexOf(saved));
  scale = SCALES[scaleIdx];
  document.documentElement.style.setProperty('--scale', scale);
  PET_W = FRAME_W * scale;
  PET_H = FRAME_H * scale;
  try { await win.setSize(new LogicalSize(Math.round(PET_W), Math.round(PET_H))); } catch { /* ignore */ }

  // 养成存档 + 离线结算
  try {
    const s = await invoke('load_state');
    gs = GameState.fromJSON(s);
    gs.applyOffline();
  } catch { /* 首次运行无存档 */ }

  await refreshMonitor();
  await refWins();
  invoke('debug_log', { msg: `dpiScale=${dpiScale} contentScale=${scale} wa=${JSON.stringify(wa)} pos=${JSON.stringify(pos)}` }).catch(() => {});
  await syncPosFromWindow();
  pos.y = Math.min(pos.y, (wa.y + wa.height) / dpiScale - PET_H);
  await applyPos();

  // 状态悬浮窗默认隐藏，可从右键菜单打开
  try {
    await moveStatsWindow();
  } catch { /* ignore */ }

  // 补发离线期间到点的提醒
  const now = Date.now();
  let changed = false;
  for (const r of reminders) {
    if (!r.fired && r.at <= now) {
      r.fired = true;
      changed = true;
      sendCat(`⏰（补发）你交代的「${r.text}」时间到啦喵！`);
    }
  }
  if (changed) saveReminders();

  if (gs.hunger < 20) bubble('好饿…');
  mode = 'ai';
  setAnim('sitWatch', 1, () => scheduleAI(600));
  requestAnimationFrame(raf);
})();
