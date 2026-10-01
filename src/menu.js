// 右键菜单窗口：主列表 + 悬停右弹的动作子菜单，事件转发给主窗口
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { listen, emitTo } from '@tauri-apps/api/event';
import { ANIMS } from './animations.js';

const win = getCurrentWindow();
const panel = document.getElementById('menu-panel');
const animEntry = document.getElementById('anim-entry');
const flyout = document.getElementById('flyout');

const ON_MAIN_MENU = new Set(['sleepLie', 'belly', 'stretch', 'tailChase', 'drink', 'happy', 'wink']);

for (const [key, def] of Object.entries(ANIMS)) {
  if (ON_MAIN_MENU.has(key)) continue;
  const el = document.createElement('div');
  el.className = 'menu-item sub';
  el.textContent = def.label;
  el.dataset.action = `anim:${key}`;
  flyout.appendChild(el);
}

let flyoutOpen = false;

async function resizeToContent() {
  const w = Math.ceil(Math.max(panel.scrollWidth, panel.offsetWidth)) + 16;
  const h = Math.ceil(Math.max(panel.scrollHeight, panel.offsetHeight)) + 16;
  try { await win.setSize(new LogicalSize(w, h)); } catch { /* ignore */ }
  return { w, h };
}

function setFlyout(open) {
  if (flyoutOpen === open) return;
  flyoutOpen = open;
  flyout.style.display = open ? 'block' : 'none';
  resizeToContent();
}

async function hide() {
  clearTimeout(idleTimer);
  setFlyout(false);
  try { await win.hide(); } catch { /* ignore */ }
}

let idleTimer = null;
function armHide() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(hide, 10000);
}

animEntry.addEventListener('mouseenter', () => setFlyout(true));
panel.addEventListener('mouseleave', () => { setFlyout(false); armHide(); });
panel.addEventListener('pointermove', armHide);

listen('pet://menu-open', async (e) => {
  const { autostart, statsVisible } = e.payload || {};
  document.getElementById('chk-autostart').textContent = autostart ? '✔' : '◻';
  document.getElementById('chk-stats').textContent = statsVisible ? '✔' : '◻';
  flyoutOpen = false;
  flyout.style.display = 'none';
  const size = await resizeToContent();
  emitTo('main', 'pet://menu-sized', size).catch(() => {});
  armHide();
});

win.listen('tauri://blur', () => hide());

panel.addEventListener('click', (e) => {
  if (e.target.closest('#anim-entry')) return; // 仅悬停展开，点击不动作
  const item = e.target.closest('[data-action]');
  if (!item) return;
  emitTo('main', 'pet://menu-action', item.dataset.action).catch(() => {});
  hide();
});

setTimeout(resizeToContent, 100);
