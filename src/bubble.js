// 语音气泡窗口：按文字自动撑尺寸，锚定在猫头顶，点击穿透（Rust 侧设置）
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { listen } from '@tauri-apps/api/event';

const win = getCurrentWindow();
const box = document.getElementById('bubble-box');

let hideTimer = null;
let posTimer = null;

listen('pet://bubble', async (e) => {
  const { text, ms, ax, ay, ph, wa } = e.payload || {};
  if (!text) return;

  // 先按内容测量自然尺寸
  box.classList.remove('show');
  box.textContent = text;
  const rect = box.getBoundingClientRect();
  const w = Math.min(330, Math.ceil(rect.width) + 24 + 2);
  const h = Math.ceil(rect.height) + 12 + 14; // 内边距 + 尾巴空间
  try {
    await win.setSize(new LogicalSize(w, h));
  } catch { /* ignore */ }

  // 定位：猫头顶居中；上方放不下则放猫下方
  let x = ax - w / 2;
  x = Math.min(Math.max(x, wa.x + 4), wa.x + wa.width - w - 4);
  let y = ay - h - 6;
  if (y < wa.y + 4) y = ay + ph + 6;
  y = Math.min(y, wa.y + wa.height - h - 4);
  try {
    await win.setPosition(new LogicalPosition(Math.round(x), Math.round(y)));
    await win.show();
  } catch { /* ignore */ }

  requestAnimationFrame(() => box.classList.add('show'));

  clearTimeout(hideTimer);
  hideTimer = setTimeout(async () => {
    box.classList.remove('show');
    clearTimeout(posTimer);
    posTimer = setTimeout(() => {
      try { box.textContent = ''; } catch { /* ignore */ }
      win.hide().catch(() => {});
    }, 220);
  }, ms || 2600);
});
