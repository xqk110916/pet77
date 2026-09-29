// 右键菜单窗口：主列表 + 悬停右弹的动作子菜单，事件转发给主窗口
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { listen, emitTo } from '@tauri-apps/api/event';
import { ANIMS } from './animations.js';

const win = getCurrentWindow();
const panel = document.getElementById('menu-panel');
const animEntry = document.getElementById('anim-entry');
const flyout = document.getElementById('flyout');

for (const [key, def] of Object.entries(ANIMS)) {
  const el = document.createElement('div');
  el.className = 'menu-item sub';
  el.textContent = def.label;
  el.dataset.action = `anim:${key}`;
  flyout.appendChild(el);
}

let flyoutOpen = false;

async function resizeToContent() {
  const rect = panel.getBoundingClientRect();
  const w = Math.ceil(rect.width) + 10;
  const h = Math.ceil(rect.height) + 10;
  try { await win.setSize(new LogicalSize(w, h)); } catch { /* ignore */ }
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

listen('pet://menu-open', (e) => {
  const { autostart, statsVisible } = e.payload || {};
  document.getElementById('chk-autostart').textContent = autostart ? '✔' : '◻';
  document.getElementById('chk-stats').textContent = statsVisible ? '✔' : '◻';
  setFlyout(false);
  resizeToContent();
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
