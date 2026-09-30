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

  // 先把窗口撑开再量文字，避免沿用上一次的窄宽度把句子折成很多行
  box.classList.remove('show');
  box.textContent = text;
  try { await win.setSize(new LogicalSize(520, 180)); } catch { /* ignore */ }
  await new Promise((r) => requestAnimationFrame(r));
  const rect = box.getBoundingClientRect();
  const w = Math.min(520, Math.max(120, Math.ceil(rect.width) + 28));
  const h = Math.max(48, Math.ceil(rect.height) + 28);
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
