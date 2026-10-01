use std::{fs, path::PathBuf, sync::Mutex};

use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow, WindowEvent, Wry,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use winapi::shared::windef::{POINT, RECT};
use winapi::um::winuser::{
    GetMonitorInfoW, MonitorFromPoint, MONITOR_DEFAULTTONEAREST, MONITORINFO,
};

type StateMirror = Mutex<Option<serde_json::Value>>;

#[derive(Serialize, Clone, Copy)]
struct WorkArea {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

fn work_area_at(cx: i32, cy: i32) -> Option<WorkArea> {
    unsafe {
        let mon = MonitorFromPoint(POINT { x: cx, y: cy }, MONITOR_DEFAULTTONEAREST);
        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(mon, &mut mi) == 0 {
            return None;
        }
        let RECT { left, top, right, bottom } = mi.rcWork;
        Some(WorkArea { x: left, y: top, width: right - left, height: bottom - top })
    }
}

fn window_work_area(window: &WebviewWindow<Wry>) -> Option<WorkArea> {
    let pos = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    work_area_at(pos.x + size.width as i32 / 2, pos.y + size.height as i32 / 2)
}

#[derive(Serialize, Clone, Copy)]
struct ScreenPoint {
    x: i32,
    y: i32,
}

#[tauri::command]
fn get_work_area(window: WebviewWindow<Wry>) -> Result<WorkArea, String> {
    window_work_area(&window).ok_or_else(|| "无法获取工作区".into())
}

/// 鼠标的物理屏幕坐标。右键菜单用它做锚点，避免拖动后窗口位置读数短暂变成左上角。
#[tauri::command]
fn cursor_pos() -> Result<ScreenPoint, String> {
    unsafe {
        let mut pt: POINT = std::mem::zeroed();
        if winapi::um::winuser::GetCursorPos(&mut pt) == 0 {
            return Err("无法读取鼠标位置".into());
        }
        Ok(ScreenPoint { x: pt.x, y: pt.y })
    }
}

/// 某个物理坐标所在显示器的工作区（已去掉任务栏）。
#[tauri::command]
fn work_area_at_point(x: i32, y: i32) -> Result<WorkArea, String> {
    work_area_at(x, y).ok_or_else(|| "无法获取工作区".into())
}

// ---------- 状态持久化 ----------

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("state.json"))
}

fn write_state(app: &AppHandle, v: &serde_json::Value) -> Result<(), String> {
    let p = state_path(app)?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let body = serde_json::to_string_pretty(v).map_err(|e| e.to_string())?;
    fs::write(&p, body).map_err(|e| e.to_string())
}

fn save_mirror(app: &AppHandle) {
    let snapshot = { app.state::<StateMirror>().lock().unwrap().clone() };
    if let Some(v) = snapshot {
        let _ = write_state(app, &v);
    }
}

#[tauri::command]
fn save_state(app: AppHandle, state: serde_json::Value) -> Result<(), String> {
    let mirror = app.state::<StateMirror>();
    *mirror.lock().unwrap() = Some(state.clone());
    write_state(&app, &state)
}

#[tauri::command]
fn load_state(app: AppHandle) -> Option<serde_json::Value> {
    let p = state_path(&app).ok()?;
    let s = fs::read_to_string(&p).ok()?;
    serde_json::from_str(&s).ok()
}

#[tauri::command]
fn debug_log(msg: String) {
    println!("[js] {msg}");
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    save_mirror(&app);
    app.exit(0);
}

// ---------- 自启 ----------

#[tauri::command]
fn toggle_autostart(app: AppHandle) -> Result<bool, String> {
    let mgr = app.autolaunch();
    if mgr.is_enabled().unwrap_or(false) {
        mgr.disable().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        mgr.enable().map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
fn is_autostart(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

// ---------- 托盘 ----------

fn toggle_visible(app: &AppHandle) {
    let Some(main) = app.get_webview_window("main") else { return };
    let visible = main.is_visible().unwrap_or(false);
    if visible {
        let _ = main.hide();
        for label in ["stats", "bubble"] {
            if let Some(w) = app.get_webview_window(label) {
                let _ = w.hide();
            }
        }
    } else {
        let _ = main.show();
        if let Some(stats) = app.get_webview_window("stats") {
            let _ = stats.show();
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .manage(Mutex::new(None::<serde_json::Value>))
        .setup(|app| {
            let main = app
                .get_webview_window("main")
                .ok_or("主窗口未创建")?;

            // 初始位置：工作区底部居中（前端 init 会按存档缩放档位校正）
            if let Some(wa) = window_work_area(&main) {
                let sf = main.scale_factor().unwrap_or(1.0);
                let w = (96.0 * sf) as i32;
                let h = (104.0 * sf) as i32;
                let _ = main.set_position(PhysicalPosition::new(
                    wa.x + (wa.width - w) / 2,
                    wa.y + wa.height - h,
                ));
            }

            // 状态悬浮窗（点击穿透，先隐藏避免左上角闪烁）
            let stats = tauri::WebviewWindowBuilder::new(
                app,
                "stats",
                tauri::WebviewUrl::App("stats.html".into()),
            )
            .inner_size(288.0, 130.0)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .shadow(false)
            .resizable(false)
            .visible(false)
            .build()?;
            let _ = stats.set_ignore_cursor_events(true);

            // 语音气泡窗口（点击穿透，按文字自撑尺寸）
            let bubble = tauri::WebviewWindowBuilder::new(
                app,
                "bubble",
                tauri::WebviewUrl::App("bubble.html".into()),
            )
            .inner_size(200.0, 60.0)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .shadow(false)
            .resizable(false)
            .visible(false)
            .build()?;
            let _ = bubble.set_ignore_cursor_events(true);

            // 右键菜单弹窗（内容自撑高度，打开时由前端调整尺寸）
            tauri::WebviewWindowBuilder::new(
                app,
                "menu",
                tauri::WebviewUrl::App("menu.html".into()),
            )
            .inner_size(210.0, 100.0)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .shadow(false)
            .resizable(false)
            .visible(false)
            .build()?;

            // 聊天窗口
            tauri::WebviewWindowBuilder::new(
                app,
                "chat",
                tauri::WebviewUrl::App("chat.html".into()),
            )
            .inner_size(320.0, 460.0)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .shadow(false)
            .resizable(false)
            .visible(false)
            .build()?;

            // 托盘
            let show_i = MenuItem::with_id(app, "show", "显示/隐藏宠物", true, None::<&str>)?;
            let chat_i = MenuItem::with_id(app, "chat", "聊天窗口", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &chat_i, &quit_i])?;
            TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Pet77 桌宠")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        save_mirror(app);
                        app.exit(0);
                    }
                    "show" => toggle_visible(app),
                    "chat" => {
                        let _ = app.emit_to("main", "tray://chat", ());
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_visible(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                match window.label() {
                    // 辅助窗口关闭 = 隐藏（保留 webview 与状态）
                    "stats" | "menu" | "chat" | "bubble" => {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    "main" => {
                        // 主窗关闭 = 退出应用（先落盘）
                        let app = window.app_handle();
                        save_mirror(app);
                        app.exit(0);
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_work_area,
            cursor_pos,
            work_area_at_point,
            save_state,
            load_state,
            toggle_autostart,
            is_autostart,
            debug_log,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
