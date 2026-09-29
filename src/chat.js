// 聊天窗口 UI：历史存 localStorage（与主窗口同源共享），消息经主窗口大脑转发
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen, emitTo } from '@tauri-apps/api/event';

const win = getCurrentWindow();
const msgsEl = document.getElementById('msgs');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const clearBtn = document.getElementById('clear');
const closeBtn = document.getElementById('close');

let history = [];
try { history = JSON.parse(localStorage.getItem('pet77_chat') || '[]'); } catch { history = []; }

const save = () => localStorage.setItem('pet77_chat', JSON.stringify(history.slice(-200)));

const fmtTime = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function add(role, text, persist = true, ts = Date.now()) {
  if (persist) {
    history.push({ role, text, ts });
    save();
  }
  msgsEl.appendChild(buildRow(role, text, ts));
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

function buildRow(role, text, ts) {
  const row = document.createElement('div');
  row.className = `row ${role === 'user' ? 'user' : 'cat'}`;

  const face = document.createElement('span');
  face.className = 'face';
  face.textContent = role === 'user' ? '🧑' : '🐱';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;

  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = fmtTime(ts);

  if (role === 'user') row.append(bubble, time, face);
  else row.append(face, bubble, time);
  return row;
}

function renderAll() {
  msgsEl.innerHTML = '';
  const shown = history.slice(-60);
  for (const m of shown) msgsEl.appendChild(buildRow(m.role, m.text, m.ts));
  if (!shown.length) {
    add('cat', '喵~ 想聊点什么？我可以帮你设提醒哦，比如「30分钟后提醒我喝水」！', false);
  }
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

let typingEl = null;
function showTyping() {
  typingEl = buildRow('cat', '喵…', Date.now());
  typingEl.querySelector('.bubble').classList.add('typing');
  msgsEl.appendChild(typingEl);
  msgsEl.scrollTop = msgsEl.scrollHeight;
}
function hideTyping() {
  typingEl?.remove();
  typingEl = null;
}

listen('pet://chat-msg', (e) => {
  hideTyping();
  add('cat', e.payload?.text || '喵', true, e.payload?.ts || Date.now());
});

function doSend() {
  const t = input.value.trim();
  if (!t) return;
  input.value = '';
  add('user', t);
  emitTo('main', 'pet://chat-send', { text: t }).catch(() => {});
  showTyping();
}

async function closeChat() {
  try { await win.hide(); } catch { /* ignore */ }
}

sendBtn.addEventListener('click', doSend);
closeBtn.addEventListener('click', closeChat);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    doSend();
  }
  if (e.key === 'Escape') closeChat();
});
clearBtn.addEventListener('click', () => {
  history = [];
  localStorage.removeItem('pet77_chat');
  renderAll();
});

renderAll();
