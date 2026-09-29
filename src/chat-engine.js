// 聊天/提醒纯逻辑模块：不依赖 Tauri，可在 Node 中直接单测
const ZH_NUM = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

export function parseZhNum(s) {
  if (!s) return NaN;
  s = String(s).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  if (s === '半') return 0.5;
  if (s.includes('十')) {
    const [a, b] = s.split('十');
    const tens = a === '' ? 1 : (ZH_NUM[a] ?? NaN);
    const ones = b === '' || b == null ? 0 : (ZH_NUM[b] ?? NaN);
    return tens * 10 + ones;
  }
  return ZH_NUM[s] ?? NaN;
}

// 解析提醒意图：{pending:false} 非提醒 | {cancel:true} | {pending:true, at:null} 缺时间 | {pending:true, at, item}
export function parseReminder(text, now = Date.now()) {
  const t = (text || '').trim();
  if (/提醒/.test(t) && /取消|不用|别提/.test(t)) return { cancel: true };
  if (!/提醒/.test(t)) return { pending: false };

  const rest = ((t.split(/提醒我?(?:要|记得)?/)[1]) ?? '').trim()
    .replace(/^[，,。；;：:\s]+/, '')
    .replace(/[。！!？?，,]+$/, '')
    .trim();

  // 绝对时间：今天/明天 9点(半|30分)
  const abs = t.match(/(今天|明天)?\s*(\d{1,2})\s*[点时]\s*(半|\d{1,2})?\s*分?/);
  // 相对时间：30分钟后 / 半小时以后 / 十秒之后
  const rel = t.match(/([0-9]+(?:\.[05])?|[零一二两三四五六七八九十半]+)\s*个?\s*(小时|分钟|分|秒)\s*(?:之?后|以后|后)/);

  let at = null;
  if (abs && /点|时/.test(t)) {
    const h = parseInt(abs[2], 10);
    const m = abs[3] === '半' ? 30 : abs[3] ? parseInt(abs[3], 10) : 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      const d = new Date(now);
      d.setHours(h, m, 0, 0);
      if (abs[1] === '明天' || d.getTime() <= now) d.setDate(d.getDate() + 1);
      at = d.getTime();
    }
  } else if (rel) {
    const n = parseZhNum(rel[1]);
    const unit = rel[2].startsWith('小时') ? 3600e3 : rel[2].startsWith('秒') ? 1e3 : 60e3;
    if (!isNaN(n) && n > 0) at = now + n * unit;
  }

  if (!at) return { pending: true, at: null, item: null };
  return {
    pending: true,
    at,
    item: { id: `r${now}`, at, text: rest || '记得完成交代的事', fired: false },
  };
}

const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const DEFAULTS = ['喵？', '喵喵~', '咕噜咕噜…', '有什么吩咐喵？', '（歪着头看你）', '（尾巴摇了摇）'];

export function genReply(text, ctx) {
  const t = (text || '').trim();
  const rules = [
    [/你好|您好|hi|hello|哈喽|嗨/i, () => pick(['喵~ 你好呀！', '嗨嗨~ 今天也要元气满满喵！'])],
    [/你是谁|叫什么|名字/, () => '我是77号喵！一只灰白小猫~'],
    [/饿|想吃|吃了吗|干饭/, () => ctx.hunger < 35 ? '肚子咕咕叫了喵…快右键喂我！' : '现在还不饿，不过小鱼干永远不嫌多喵'],
    [/摸|抱|rua|撸|蹭/i, () => pick(['咕噜咕噜咕噜…好舒服~', '再摸摸头喵♥'])],
    [/开心|高兴|哈哈/, () => '嘿嘿，你开心我也开心喵！'],
    [/累|难过|烦|不开心|压力|emo/i, () => pick(['抱抱你！累了就歇会儿，我一直陪着你喵', '不开心的话，看我跑两圈给你打气喵！'])],
    [/笑话|讲个|段子/, () => pick(['从前有一只猫，它叫77…故事讲完了喵 :3', '为什么猫不怕晒？因为自带毛绒遮阳伞喵！'])],
    [/天气|出门/, () => '窗外的太阳很适合晒猫喵~'],
    [/谢谢|感谢|多谢/, () => '不客气喵♥'],
    [/拜拜|再见|晚安|睡了/, () => ctx.sleeping ? 'Zzz…（说梦话）' : '拜拜喵，我会乖乖等你回来~'],
    [/爱|喜欢你|可爱|漂亮/, () => pick(['我也喜欢你喵♥', '咕噜咕噜…被夸奖了好开心！'])],
    [/几岁|多大|等级|多少级/, () => `我现在 Lv.${ctx.level} 喵，正在努力长大~`],
    [/状态|怎么样|还好吗/, () => `饱食${Math.round(ctx.hunger)}、心情${Math.round(ctx.mood)}、精力${Math.round(ctx.energy)}，一切正常喵~`],
  ];
  for (const [re, fn] of rules) {
    if (re.test(t)) return fn();
  }
  if (ctx.hunger < 30) return pick(['好饿好饿…先给我点吃的喵…', '（有气无力）主人…饭…']);
  if (ctx.energy < 25) return pick(['有点困了…眼皮在打架喵…', '（打哈欠）Zzz…']);
  if (ctx.mood < 30) return pick(['心情有点低落…陪我玩会儿嘛！', '（蹲在角落画圈圈）…']);
  return pick(DEFAULTS);
}

export function chatterLine(ctx) {
  if (ctx.hunger < 25) return pick(['肚子咕咕叫了…有吃的吗喵？', '（可怜巴巴）好饿…']);
  if (ctx.energy < 20) return pick(['眼睛睁不开了喵…我去眯一会儿…', '（打瞌睡）Zzz…']);
  if (ctx.mood < 35) return pick(['好无聊哦，陪我玩嘛！', '（用尾巴扫你的手）关注我一下喵~']);
  return pick(['喵喵喵~', '（伸了个大懒腰）', '今天也要加油喵！', '（盯着窗外的鸟发呆）', '摸摸我嘛~', '（突然起立又坐下）']);
}
