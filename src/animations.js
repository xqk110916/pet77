// 精灵图表：8 列 × 9 行，每格 192×208（渲染时按 SCALE 缩放）
// 每行是一组动作动画；frames 为该行非空帧数
export const GRID_COLS = 8;
export const GRID_ROWS = 9;
export const FRAME_W = 192;
export const FRAME_H = 208;

// 缩放档位（1.5/3 = 0.5 为默认档，即缩小三倍）
export const SCALES = [0.5, 0.75, 1, 1.5, 2];

// 动作播放速度倍率（数值越小越慢）
export const SPEED_MUL = 0.7;

export const ANIMS = {
  doze:     { row: 0, frames: 6, fps: 5,  loop: true,  label: '打盹' },
  walkRight:{ row: 1, frames: 8, fps: 10, loop: true,  label: '向右走' },
  walkLeft: { row: 2, frames: 8, fps: 10, loop: true,  label: '向左走' },
  sitWatch: { row: 3, frames: 4, fps: 6,  loop: true,  label: '坐着张望' },
  eat:      { row: 4, frames: 5, fps: 8,  loop: true,  label: '进食/理毛' },
  pounce:   { row: 5, frames: 7, fps: 9,  loop: false, label: '扑抓玩耍' },
  alert:    { row: 6, frames: 6, fps: 8,  loop: false, label: '警觉竖耳' },
  swipe:    { row: 7, frames: 6, fps: 7,  loop: true,  label: '伸爪洗脸' },
  curious:  { row: 8, frames: 6, fps: 6,  loop: true,  label: '探头好奇' },
};

export const PET_META = { displayName: '77' };
