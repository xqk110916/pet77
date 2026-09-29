// 养成数值系统：饱食 / 心情 / 精力 / 经验等级 + 离线衰减
export class GameState {
  constructor() {
    this.hunger = 80;   // 饱食度
    this.mood = 80;     // 心情
    this.energy = 90;   // 精力
    this.xp = 0;        // 经验
    this.level = 1;
    this.lastSeen = Date.now();
  }

  static xpForLevel(level) {
    return level * 80;
  }

  levelUpThreshold() {
    return GameState.xpForLevel(this.level);
  }

  // 每秒衰减。mode: 'walk' | 'idle' | 'doze'
  tick(mode) {
    this.hunger = clamp01(this.hunger - 0.8 / 60);
    const moodDecay = this.hunger < 25 ? 2.0 / 60 : 0.5 / 60;
    this.mood = clamp01(this.mood - moodDecay);
    if (mode === 'doze') {
      this.energy = clamp01(this.energy + 5 / 60);
    } else if (mode === 'walk') {
      this.energy = clamp01(this.energy - 3.6 / 60);
    } else {
      this.energy = clamp01(this.energy - 1.2 / 60);
    }
    this.lastSeen = Date.now();
    return this.checkLevelUp();
  }

  addXp(n) {
    this.xp += n;
    return this.checkLevelUp();
  }

  checkLevelUp() {
    let up = false;
    while (this.xp >= this.levelUpThreshold()) {
      this.xp -= this.levelUpThreshold();
      this.level += 1;
      up = true;
    }
    return up;
  }

  // 离线期间按分钟衰减（上限 24h），精力离线缓慢回复
  applyOffline() {
    const mins = Math.min((Date.now() - this.lastSeen) / 60000, 24 * 60);
    if (mins < 1) return;
    this.hunger = Math.max(this.hunger - mins * 0.5, 5);
    this.mood = Math.max(this.mood - mins * 0.35, 5);
    this.energy = Math.min(this.energy + mins * 0.8, 100);
  }

  toJSON() {
    return {
      hunger: round2(this.hunger),
      mood: round2(this.mood),
      energy: round2(this.energy),
      xp: round2(this.xp),
      level: this.level,
      lastSeen: this.lastSeen,
    };
  }

  static fromJSON(o) {
    const s = new GameState();
    if (o) {
      s.hunger = num(o.hunger, s.hunger);
      s.mood = num(o.mood, s.mood);
      s.energy = num(o.energy, s.energy);
      s.xp = num(o.xp, 0);
      s.level = Math.max(1, o.level | 0);
      s.lastSeen = num(o.lastSeen, Date.now());
    }
    return s;
  }
}

const clamp01 = (v) => Math.min(100, Math.max(0, v));
const round2 = (v) => Math.round(v * 100) / 100;
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
