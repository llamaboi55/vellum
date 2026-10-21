//! Vellum: makes your screen feel like paper. One transparent, click-through overlay
//! per monitor lays a fine paper grain (and, if you like, the warm light of a desk
//! lamp) over everything, without changing your colors or catching any clicks.

use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder, Wry};
use tauri_plugin_global_shortcut::ShortcutState;

const TOGGLE: &str = "Alt+Shift+P";
const SNOOZE: Duration = Duration::from_secs(60 * 60);

struct State {
    on: Mutex<bool>,
    snooze: AtomicU64, // bumped on every snooze or manual change, so a stale timer does nothing
    item: Mutex<Option<CheckMenuItem<Wry>>>,
}

#[derive(Serialize)]
struct Status {
    cursor: Option<(f64, f64)>,
    app: Option<String>,
}

/// Converts a point in physical screen pixels to a window's own logical pixels.
pub fn to_local(p: (f64, f64), origin: (f64, f64), scale: f64) -> (f64, f64) {
    let s = if scale > 0.0 { scale } else { 1.0 };
    ((p.0 - origin.0) / s, (p.1 - origin.1) / s)
}

/// Lower-cased app name without a trailing ".exe", so lists match on every system.
pub fn app_key(name: &str) -> String {
    let n = name.trim().to_lowercase();
    n.strip_suffix(".exe").unwrap_or(&n).to_string()
}

/// The mouse (in the calling overlay's coordinates) and the app in front.
#[tauri::command]
fn status(app: AppHandle, window: tauri::WebviewWindow, want_app: bool) -> Status {
    let origin = window.outer_position().map(|p| (p.x as f64, p.y as f64)).unwrap_or((0.0, 0.0));
    let scale = window.scale_factor().unwrap_or(1.0);
    let cursor = app.cursor_position().ok().map(|c| to_local((c.x, c.y), origin, scale));
    let front = if want_app {
        active_win_pos_rs::get_active_window().ok().map(|w| app_key(&w.app_name)).filter(|n| !n.is_empty())
    } else {
        None
    };
    Status { cursor, app: front }
}

#[tauri::command]
fn get_on(state: tauri::State<State>) -> bool {
    *state.on.lock().unwrap()
}

#[tauri::command]
fn set_on(app: AppHandle, on: bool) {
    app.state::<State>().snooze.fetch_add(1, Ordering::SeqCst);
    apply(&app, on);
}

fn apply(app: &AppHandle, on: bool) {
    let state = app.state::<State>();
    *state.on.lock().unwrap() = on;
    for (_, win) in app.webview_windows() {
        if win.label().starts_with("overlay-") {
            if on {
                let _ = win.show();
                let _ = win.set_ignore_cursor_events(true);
            } else {
                let _ = win.hide();
            }
        }
    }
    if let Some(item) = state.item.lock().unwrap().as_ref() {
        let _ = item.set_checked(on);
    }
    let _ = app.emit("vellum://on", on);
}

fn toggle(app: &AppHandle) {
    let on = *app.state::<State>().on.lock().unwrap();
    set_on(app.clone(), !on);
}

/// Off for an hour, then back on unless you've changed it yourself in the meantime.
#[tauri::command]
fn snooze(app: AppHandle) {
    let ticket = app.state::<State>().snooze.fetch_add(1, Ordering::SeqCst) + 1;
    apply(&app, false);
    std::thread::spawn(move || {
        std::thread::sleep(SNOOZE);
        if app.state::<State>().snooze.load(Ordering::SeqCst) == ticket {
            apply(&app, true);
        }
    });
}

/// One overlay per monitor, covering it edge to edge.
fn build_overlays(app: &AppHandle) -> tauri::Result<()> {
    let monitors = app.available_monitors()?;
    for (i, m) in monitors.iter().enumerate() {
        let label = format!("overlay-{i}");
        let scale = m.scale_factor();
        let pos = m.position();
        let size = m.size();
        let win = match app.get_webview_window(&label) {
            Some(w) => w,
            None => WebviewWindowBuilder::new(app, &label, WebviewUrl::App("overlay.html".into()))
                .title("Vellum")
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .shadow(false)
                .resizable(false)
                .focused(false)
                .visible(false)
                .visible_on_all_workspaces(true)
                .build()?,
        };
        let _ = win.set_position(LogicalPosition::new(pos.x as f64 / scale, pos.y as f64 / scale));
        let _ = win.set_size(LogicalSize::new(size.width as f64 / scale, size.height as f64 / scale));
        // Linux needs the window shown once before it can be made click-through.
        let _ = win.show();
        let _ = win.set_ignore_cursor_events(true);
        let _ = win.hide();
    }
    Ok(())
}

#[tauri::command]
fn refit(app: AppHandle) {
    let _ = build_overlays(&app);
    let on = *app.state::<State>().on.lock().unwrap();
    apply(&app, on);
}

#[tauri::command]
fn open_settings(app: AppHandle) {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("settings.html".into()))
        .title("Vellum")
        .inner_size(780.0, 720.0)
        .min_inner_size(560.0, 520.0)
        .center()
        .build();
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

pub fn run() {
    tauri::Builder::default()
        .manage(State { on: Mutex::new(false), snooze: AtomicU64::new(0), item: Mutex::new(None) })
        .plugin(tauri_plugin_single_instance::init(|app, _, _| open_settings(app.clone())))
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts([TOGGLE])
                .expect("valid shortcut")
                .with_handler(|app, _, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![status, get_on, set_on, snooze, refit, open_settings, quit])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let handle = app.handle().clone();
            build_overlays(&handle)?;

            let on = CheckMenuItem::with_id(app, "on", "Paper (Alt Shift P)", true, false, None::<&str>)?;
            let lamp = MenuItem::with_id(app, "lamp", "Desk lamp on or off", true, None::<&str>)?;
            let next = MenuItem::with_id(app, "next", "Next paper", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "snooze", "Pause for an hour", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Vellum", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&on, &next, &lamp, &pause, &sep, &settings, &sep2, &quit])?;
            *app.state::<State>().item.lock().unwrap() = Some(on);

            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().expect("app icon"))
                .tooltip("Vellum (Alt Shift P)")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "on" => toggle(app),
                    "lamp" => {
                        let _ = app.emit("vellum://toggle-lamp", ());
                    }
                    "next" => {
                        let _ = app.emit("vellum://next-paper", ());
                    }
                    "snooze" => snooze(app.clone()),
                    "settings" => open_settings(app.clone()),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        toggle(tray.app_handle());
                    }
                })
                .build(app)?;

            // Paper comes on by itself; the first launch also shows the settings.
            apply(&handle, true);
            let first = handle.path().app_config_dir().map(|d| d.join("launched")).ok();
            if let Some(marker) = first {
                if !marker.exists() {
                    let _ = std::fs::create_dir_all(marker.parent().unwrap());
                    let _ = std::fs::write(&marker, b"1");
                    open_settings(handle);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Vellum");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_points_to_window_coordinates() {
        assert_eq!(to_local((2120.0, 200.0), (1920.0, 0.0), 2.0), (100.0, 100.0));
        assert_eq!(to_local((50.0, 60.0), (0.0, 0.0), 0.0), (50.0, 60.0));
    }

    #[test]
    fn app_names_match_across_systems() {
        assert_eq!(app_key("Photoshop.exe"), "photoshop");
        assert_eq!(app_key(" Figma "), "figma");
        assert_eq!(app_key("firefox"), "firefox");
    }
}
