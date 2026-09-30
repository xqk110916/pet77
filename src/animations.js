// 精灵图表：8 列 × 16 行，每格 192×208（渲染时按 SCALE 缩放）
// 0–8 是日常动作，9–10 是朝向，11–15 是睡觉、翻肚皮、伸懒腰、追尾巴、喝水
export const GRID_COLS = 8;
export const GRID_ROWS = 9;
export const FRAME_W = 192;
export const FRAME_H = 208;

// 缩放档位（1.5/3 = 0.5 为默认档，即缩小三倍）
export const SCALES = [0.5, 0.75, 1, 1.5, 2];

// 动作播放速度倍率（数值越小越慢）。0.42 让整段动作大约放慢到原先的六成
export const SPEED_MUL = 0.42;

export const ANIMS = {
  doze:     { row: 0, frames: 6, fps: 5,  loop: true,  label: '打盹' },
  walkRight:{ row: 1, frames: 8, fps: 10, loop: true,  label: '向右跑' },
  walkLeft: { row: 2, frames: 8, fps: 10, loop: true,  label: '向左跑' },
  sitWatch: { row: 8, frames: 6, fps: 6,  loop: true,  label: '端详' },
  eat:      { row: 7, frames: 6, fps: 8,  loop: true,  label: '忙活' },
  pounce:   { row: 4, frames: 5, fps: 9,  loop: false, label: '蹦跳' },
  alert:    { row: 5, frames: 8, fps: 8,  loop: false, label: '委屈' },
  swipe:    { row: 3, frames: 4, fps: 7,  loop: true,  label: '挥手' },
  curious:  { row: 6, frames: 6, fps: 6,  loop: true,  label: '张望' },
  sleepLie: { row: 11, frames: 8, fps: 3, loop: true,  label: '睡觉' },
  belly:    { row: 12, frames: 8, fps: 6, loop: true,  label: '翻肚皮求摸摸' },
  stretch:  { row: 13, frames: 8, fps: 7, loop: false, label: '睡醒伸懒腰' },
  tailChase:{ row: 14, frames: 8, fps: 8, loop: true,  label: '追自己尾巴' },
  drink:    { row: 15, frames: 8, fps: 6, loop: true,  label: '喝水' },
};

export const PET_META = { displayName: '三花' };
