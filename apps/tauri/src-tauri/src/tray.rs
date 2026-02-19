#[cfg(desktop)]
use std::sync::Mutex;
#[cfg(desktop)]
use tauri::{
    AppHandle,
    Runtime,
    menu::MenuBuilder,
    tray::{TrayIcon, TrayIconBuilder},
    Manager,
};

#[cfg(desktop)]
use crate::menu;

#[cfg(desktop)]
pub struct ManagedTray<R: Runtime>(pub Mutex<Option<TrayIcon<R>>>);

#[cfg(desktop)]
pub fn install_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let tray_menu = MenuBuilder::new(app)
        .text(menu::MENU_EVENT_SHOW, "Show / Hide")
        .text(menu::MENU_EVENT_CHECK_UPDATES, "Check for Updates")
        .separator()
        .text(menu::MENU_EVENT_QUIT, "Quit")
        .build()?;

    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&tray_menu)
        .tooltip("Prometheus")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| menu::handle_menu_event(app, event));

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    let tray = builder.build(app)?;
    app.manage(ManagedTray(Mutex::new(Some(tray))));
    Ok(())
}
