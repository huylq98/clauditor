use anyhow::Result;
use tauri::{
    menu::{Menu, MenuBuilder, MenuEvent, MenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Manager, Wry,
};

pub fn create(app: &AppHandle) -> Result<TrayIcon<Wry>> {
    let show = MenuItem::with_id(app, "show", "Show Clauditor", true, None::<&str>)?;
    let new_session = MenuItem::with_id(app, "new_session", "New session", true, None::<&str>)?;
    let check_updates = MenuItem::with_id(
        app,
        "check_updates",
        "Check for updates…",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu: Menu<Wry> = MenuBuilder::new(app)
        .items(&[&show, &new_session])
        .separator()
        .items(&[&check_updates])
        .separator()
        .items(&[&quit])
        .build()?;

    let tray = TrayIconBuilder::with_id("main")
        .tooltip("Clauditor")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event: MenuEvent| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "new_session" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
                let _ = tauri::Emitter::emit(app, "ui:new-session", ());
            }
            "check_updates" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
                let _ = tauri::Emitter::emit(app, "ui:check-updates", ());
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            use tauri::tray::TrayIconEvent;
            if let TrayIconEvent::Click { .. } = event {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(tray)
}
