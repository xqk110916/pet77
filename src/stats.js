// 状态悬浮窗：只读展示数值条，点击穿透由 Rust 侧设置
import { listen } from '@tauri-apps/api/event';

const bars = {
  hunger: document.getElementById('bar-hunger'),
  mood: document.getElementById('bar-mood'),
  energy: document.getElementById('bar-energy'),
};
const levelEl = document.getElementById('level');

listen('pet://stats', (e) => {
  const s = e.payload || {};
  for (const key of ['hunger', 'mood', 'energy']) {
    const el = bars[key];
    const v = Math.max(0, Math.min(100, s[key]));
    el.style.width = `${v}%`;
    el.classList.toggle('low', v < 20);
  }
  levelEl.textContent = `Lv.${s.level}`;
});
