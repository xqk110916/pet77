# Pet77 — Windows 桌宠

一只基于 Tauri 2 的 Windows 桌面宠物猫（77号），素材来自 petdex 精灵图（spritesheet）。
支持养成数值（饱食/心情/精力/经验等级）、拖拽互动、右键菜单、聊天对话与定时提醒、托盘常驻、开机自启。

---

## 一、技术栈与依赖

### 前端（`package.json`）

| 依赖 | 版本 | 用途 |
|---|---|---|
| `vite` | ^6 (dev) | 构建与 dev server（4 个 HTML 入口） |
| `@tauri-apps/cli` | ^2 (dev) | `tauri dev` / `tauri build` 命令 |
| `@tauri-apps/api` | ^2 | 前端调用窗口/事件/IPC（`invoke`、`emitTo`、`WebviewWindow` 等） |
| `@tauri-apps/plugin-autostart` | ^2 | 开机自启（前端不直接用，由 Rust 侧插件承担） |

前端是**原生 JS（ESM）**，无框架、无 UI 库，动画渲染就是 CSS `background-position` 切帧。

### Rust（`src-tauri/Cargo.toml`）

| Crate | 版本 | 用途 |
|---|---|---|
| `tauri` | 2（feature: `tray-icon`） | 应用壳、多窗口、系统托盘 |
| `tauri-plugin-autostart` | 2 | 开机自启注册表写入 |
| `serde` / `serde_json` | 1 | 存档序列化 |
| `winapi`（feature: `winuser`） | 0.3 | Win32 API：`MonitorFromPoint` + `GetMonitorInfoW` 获取工作区（扣掉任务栏的可用区域） |
| `tauri-build` | 2 (build-dep) | 资源/图标构建 |

实际编译验证过的版本：tauri 2.12、vite 6.4、rustc 1.98（向上兼容）。

---

## 二、环境要求（Windows）

| 组件 | 说明 |
|---|---|
| Windows 10 21H2+ / Windows 11 x64 | 依赖 WebView2 渲染 |
| WebView2 Runtime | Win11 自带；缺失时装 [Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) 即可 |
| Node.js ≥ 18 | 包管理与 Vite（开发机用的 v24） |
| Rust stable（`x86_64-pc-windows-msvc` 目标） | 编译 Rust 侧 |
| Visual Studio 2022 Build Tools + **"使用 C++ 的桌面开发"** 工作负载 | 提供 MSVC 链接器，Rust 必需 |

一键安装（winget，管理员 PowerShell）：

```powershell
winget install Rustlang.Rustup
rustup default stable-x86_64-pc-windows-msvc
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

> Build Tools 装完可能提示重启，重启一次再编译最稳。
> 验证：`cargo --version`、`rustc --version`、`npm -v` 都有输出即可。

---

## 三、安装 / 运行 / 打包

```bash
npm install          # 装前端依赖
npm run tauri dev    # 开发调试：起 vite(5173) + 编译 debug 版并运行，Rust/前端改动热更新
npm run tauri build  # 产出 release exe + NSIS 安装包
```

产物位置：

- 可执行文件：`src-tauri/target/release/pet77.exe`（约 8 MB）
- 安装包：`src-tauri/target/release/bundle/nsis/Pet77_0.1.0_x64-setup.exe`（约 3.3 MB）

常见问题：

- **端口 5173 被占**：上次 dev 的 vite 进程残留，`netstat -ano | findstr 5173` 找到 PID 后 taskkill，或重启终端。
- **链接器报错 `link.exe not found`**：C++ 工作负载没装全。
- **前端改了没生效**：dev 下 vite 会热更新；Rust 侧改动由 `tauri dev` 自动重编译。

---

## 四、项目结构

```
pet/
├─ index.html              # 主窗口：宠物本体（透明、置顶、点击交互）
├─ stats.html              # 状态悬浮窗：三条数值条 + 等级（点击穿透）
├─ bubble.html             # 语音气泡窗口：猫说话的悬浮气泡（点击穿透、按文字自撑尺寸）
├─ menu.html               # 右键菜单窗口（主列表 + 悬停右弹的动作子菜单）
├─ chat.html               # 聊天窗口（对话 + 提醒入口）
├─ vite.config.js          # 5 个页面入口
├─ spritesheet.webp        # 精灵图原始资源（petdex 下载，8列×9行，每格192×208）
├─ pet.json                # 资源元信息（petdex 格式）
├─ src/
│  ├─ animations.js        # ★ 精灵图切分参数 + 动作→行映射 + 缩放档位 + 速度倍率
│  ├─ main.js              # ★ 主逻辑：状态机、行走、拖拽、缩放、聊天大脑、提醒调度、气泡分发
│  ├─ chat-engine.js       # ★ 聊天纯逻辑（应答规则/提醒解析），可 Node 单测
│  ├─ game-state.js        # 养成数值：衰减/经验/离线结算
│  ├─ bubble.js / bubble.css   # 气泡窗：测量文字→自撑尺寸→锚定猫头顶→定时隐藏
│  ├─ menu.js / menu.css   # 菜单窗口逻辑与样式
│  ├─ chat.js / chat.css   # 聊天窗口 UI（历史存 localStorage）
│  ├─ stats.js / stats.css # 状态窗只读渲染
│  ├─ pet.css              # 主窗样式（--scale 驱动一切缩放）
│  └─ assets/
│     └─ spritesheet.webp  # 构建用精灵图（与根目录同源拷贝）
└─ src-tauri/
   ├─ tauri.conf.json      # 窗口配置（main 96×104 透明置顶）、NSIS 打包
   ├─ capabilities/default.json  # Tauri 2 权限：哪些窗口能用哪些 API
   ├─ src/lib.rs           # ★ Rust 侧全部逻辑：窗口创建/托盘/持久化/工作区/自启
   ├─ src/main.rs          # 入口
   └─ icons/               # tauri icon 生成的应用图标（源图 icon-source.png）
```

---

## 五、架构速览（接手前必读）

### 5.1 五个窗口

| label | 职责 | 特性 |
|---|---|---|
| `main` | 宠物本体，唯一的"大脑"（状态机、数值、提醒都在这） | 96×104 逻辑尺寸（随缩放档位变），透明、置顶、跳过任务栏 |
| `stats` | 数值展示 | 点击穿透（`set_ignore_cursor_events`），跟随宠物头顶，默认隐藏 |
| `bubble` | **语音气泡**：猫所有"说话"的出口（交互反馈/聊天回复/提醒/主动搭话） | 点击穿透、按文字自撑尺寸、锚定猫头顶（上方放不下自动换下方）、显示 2.6s 后自动隐藏 |
| `menu` | 右键菜单 | 平时隐藏，右键时定位到光标处，内容自撑高度 |
| `chat` | 聊天 | 平时隐藏，可拖动（header 拖拽区）、Esc/✕ 关闭 |

为什么菜单单独开窗口：宠物窗口缩小后（50% 档只有 96×104）塞不下菜单，且独立窗口不受缩放影响、体验一致。

### 5.2 事件通信（全部走 Tauri event）

| 事件 | 方向 | 载荷 | 用途 |
|---|---|---|---|
| `pet://stats` | main → stats | 数值 JSON | 每秒刷新状态条 |
| `pet://bubble` | main → bubble | `{text, ms, ax, ay, ph, wa}` | 语音气泡：锚点(猫中心x/顶y/高)+逻辑工作区，bubble.js 自行测量定位 |
| `pet://menu-open` | main → menu | `{autostart, statsVisible}` | 打开菜单并刷新勾选态 |
| `pet://menu-action` | menu → main | action 字符串 | 菜单项点击（见 `handleAction`） |
| `pet://chat-send` | chat → main | `{text}` | 用户发消息 |
| `pet://chat-msg` | main → chat | `{role, text, ts}` | 猫的回复（含主动搭话/提醒） |
| `tray://chat` | Rust → main | — | 托盘菜单打开聊天窗 |

### 5.3 Tauri commands（前端 `invoke` 调 Rust）

`get_work_area`（工作区物理像素）、`save_state` / `load_state`（存档）、`toggle_autostart` / `is_autostart`、`debug_log`（dev 时把 JS 错误打到终端）、`exit_app`。

### 5.4 持久化

| 数据 | 位置 | 说明 |
|---|---|---|
| 养成存档 | `%APPDATA%\com.pet77.desktop\state.json` | 饱食/心情/精力/xp/等级/lastSeen，20s 自动存 + 退出落盘 + 离线衰减结算 |
| 缩放档位 | localStorage `pet77_scale` | 注意：**dev(localhost:5173) 与 release(http://tauri.localhost) 存储隔离** |
| 提醒任务 | localStorage `pet77_reminders` | 启动时补发过期提醒 |
| 聊天记录 | localStorage `pet77_chat` | 上限 200 条 |

### 5.5 关键实现机制（改代码前了解，避免踩坑）

- **动画渲染**：精灵图整张作为 `background-image`，`--row`/`--col` 两个 CSS 变量控制 `background-position` 偏移切帧，每帧时长 = 1/(fps×SPEED_MUL)。
- **拖拽**：`win.startDragging()` 是系统级拖动，期间 JS 收不到 pointermove。靠 60ms 轮询 `outerPosition()`：位移差决定朝向动画、同步状态栏位置，连续 3 次坐标不变判定松手。`pointerup` 时若在拖拽中**不能清空 `press`**，否则轮询提前退出。
- **坐标体系**：窗口位置用物理像素（`outerPosition`），Tauri 的 `LogicalPosition/LogicalSize` 转换依赖 `win.scaleFactor()`（系统 DPI 缩放）；宠物内容缩放 `SCALES` 是另一套，二者无关。
- **透明窗口**：Tauri 透明区域内仍会接收鼠标事件，所以菜单/聊天窗口必须精确贴合内容（内容自撑高度 + `setSize`），不能开大留白。

---

## 六、扩展指南

### 6.1 新增一个动画动作（最常见）

前提：精灵图里有对应的行（每行一组循环帧）。

1. **`src/animations.js`** 的 `ANIMS` 加一条：

   ```js
   stretch: { row: 9, frames: 6, fps: 8, loop: true, label: '伸懒腰' },
   ```

   - `row`：精灵图第几行（0 起）
   - `frames`：该行**非空帧数**（用空格补齐的格子会切出空白帧）
   - `fps`：基础帧率（全局再乘 `SPEED_MUL`）
   - `label`：菜单里显示的名字

2. 完成。菜单「动作演示」子菜单会自动出现新条目；想让它进入待机随机行为池，在 `src/main.js` 的 `decideNext()` 里加分支。

3. 如果换了整张新精灵图，同步改切分参数：`GRID_COLS` / `GRID_ROWS` / `FRAME_W` / `FRAME_H`，以及 `pet.css` 里 `background-size` 的 1536/1872 基准值。

### 6.2 新增一个右键菜单交互

以「拍照」为例：

1. `menu.html` 主列表加一项（要勾选态就带 `<span class="chk">`）：

   ```html
   <div class="menu-item" data-action="photo">📷 拍照</div>
   ```

2. `src/main.js` 的 `handleAction()` 的 `switch` 加分支：

   ```js
   case 'photo': doPhoto(); break;
   ```

3. 实现 `doPhoto()`：用 `setAnim('alert', 1, ...)` 之类播动画，用 `bubble('...')` 让猫在头顶气泡里说话，用 `spawnFx('✨', PET_W/2, PET_H*0.3)` 冒粒子，用 `gainXp(n)` 给经验。**任何交互都建议带一句 `bubble()`，这是猫"开口说话"的唯一通道**（同时想在聊天窗留一条就改用 `sendCat()`，它会自动气泡+聊天双发）。

带子菜单的交互参考「动作演示」：`menu.js` 里往 `#flyout` 塞条目，`data-action` 用 `前缀:参数` 格式（如 `anim:doze`），`handleAction` 里 `action.startsWith('anim:')` 解析。

### 6.3 新增聊天指令 / 应答

全部在 **`src/chat-engine.js`**（纯函数，无 Tauri 依赖，可直接 `node` 单测）：

- **关键词应答**：往 `genReply()` 的 `rules` 数组加 `[ /正则/, () => '回复文案' ]`。`ctx` 里有 `{hunger, mood, energy, level, sleeping}` 可以做条件回复。
- **主动搭话**：`chatterLine()` 按数值状态挑台词，直接加文案。
- **指令型交互**（如"睡觉""陪我玩"）：在 `src/main.js` 的 `pet://chat-send` 监听器里加正则分支，直接调 `doFeed()/doPlay()/startSleep()` 等。
- **提醒语法扩展**：`parseReminder()` 目前支持「N分钟后 / 半小时 / 明天9点 / 今天14点半 / 十五分钟 / 取消提醒」。新增句式改这里的 `abs`/`rel` 两个正则；中文数字解析在 `parseZhNum()`。

改完建议跑一遍冒烟（把测试文件放临时目录，用 `import { parseReminder } from 'file:///F:/testCode/pet/src/chat-engine.js'` 断言后删除）。

### 6.4 新增养成数值

以「清洁度」为例：

1. `src/game-state.js`：`constructor` 加字段、`tick()` 加衰减速率、`toJSON/fromJSON` 加序列化（老存档缺字段走 `num()` 默认值，天然兼容）。
2. `stats.html/.css/.js`：加一条 bar（照抄 hunger 那三行）。
3. `src/main.js`：相关交互里更新它，并通过 `pet://stats` 事件自动带到状态窗。

### 6.5 新增一个窗口

以「成就面板」为例，四处必须同步：

1. 新建 `achievements.html` + `src/achievements.js`
2. `vite.config.js`：`rollupOptions.input` 加 `achievements: page('./achievements.html')`
3. `src-tauri/src/lib.rs`：`setup` 里照抄 bubble/chat 窗口的 `WebviewWindowBuilder`（注意 `visible(false)`，由前端定位后再 show；纯展示窗加 `set_ignore_cursor_events(true)`）；`on_window_event` 的关闭即隐藏分支加上新 label；托盘隐藏时若需要联动，改 `toggle_visible`
4. `src-tauri/capabilities/default.json`：`windows` 数组加 `"achievements"`（否则前端所有 API 调用会被权限拒绝）

Tauri 2 的权限体系很严：窗口用了哪个 API（show/hide/setPosition/emitTo/listen…），capabilities 里就要有对应 `core:window:allow-*` / `core:event:allow-*`。

### 6.6 新增 Tauri command

1. `src-tauri/src/lib.rs` 写 `#[tauri::command] fn xxx(...)`，注册进 `invoke_handler` 的 `generate_handler![...]`
2. 需要权限的命令在 capabilities 加 permission（自定义命令默认放行，标准 API 才要）
3. 前端 `invoke('xxx', { args })` 调用

### 6.7 其它调参入口

| 想改什么 | 改哪里 |
|---|---|
| 缩放档位/默认大小 | `animations.js` 的 `SCALES`（首元素为默认档） |
| 动作整体快慢 | `animations.js` 的 `SPEED_MUL`（0.7 = 慢放 30%） |
| 单个动作帧率 | `ANIMS` 里该项的 `fps` |
| 行走速度 | `main.js` `startWalk()` 里的 `31` |
| 待机行为概率 | `main.js` `decideNext()` 的随机分支 |
| 数值衰减/经验曲线 | `game-state.js` `tick()` / `xpForLevel()` |
| 聊天窗尺寸/位置 | `chat.html` 旁的 `openChat()` 里 `cw/ch` 与定位逻辑 |
| 托盘菜单 | `lib.rs` setup 里 `MenuItem::with_id` 一组 |

---

## 七、已知边界

- 精灵图为 petdex 的固定 8×9 布局；换其它资源需重定切分参数（见 6.1）。
- 拖拽方向动画依赖轮询（60ms），极快甩动时朝向可能晚半拍，属正常。
- 聊天应答是本地规则库，不联网、无 LLM；提醒语法解析不了的句子会引导用户换说法。
- dev 与 release 的 localStorage 互不相通（数据不同源），测试时注意。
