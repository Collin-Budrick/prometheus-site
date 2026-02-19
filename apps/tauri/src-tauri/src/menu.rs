use serde_json::json;
use tauri::{
    menu::{MenuBuilder, MenuEvent, SubmenuBuilder},
    AppHandle, Emitter, Manager, Runtime,
};

pub const MENU_EVENT_SHOW: &str = "app_show";
pub const MENU_EVENT_ABOUT: &str = "app_about";
pub const MENU_EVENT_PREFERENCES: &str = "app_preferences";
pub const MENU_EVENT_CHECK_UPDATES: &str = "app_check_updates";
pub const MENU_EVENT_QUIT: &str = "app_quit";

#[cfg(desktop)]
pub fn install_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let app_menu = SubmenuBuilder::new(app, "App")
        .text(MENU_EVENT_SHOW, "Show")
        .text(MENU_EVENT_ABOUT, "About Prometheus")
        .text(MENU_EVENT_PREFERENCES, "Preferences")
        .text(MENU_EVENT_CHECK_UPDATES, "Check for Updates")
        .separator()
        .text(MENU_EVENT_QUIT, "Quit")
        .build()?;

    let menu = MenuBuilder::new(app).item(&app_menu).build()?;
    app.set_menu(menu)?;
    Ok(())
}

#[cfg(not(desktop))]
pub fn install_menu<R: Runtime>(_app: &AppHandle<R>) -> tauri::Result<()> {
    Ok(())
}

pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref().to_string();
    let _ = app.emit("prom:native-menu", json!({ "id": id.clone() }));

    match id.as_str() {
        MENU_EVENT_SHOW => {
            if let Some(window) = app.get_webview_window("main") {
                let is_visible = window.is_visible().unwrap_or(false);
                if is_visible {
                    let _ = window.hide();
                } else {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }
        MENU_EVENT_ABOUT => {
            let _ = app.emit("prom:native-menu-about", json!({ "id": id }));
        }
        MENU_EVENT_PREFERENCES => {
            let _ = app.emit("prom:native-menu-preferences", json!({ "id": id }));
        }
        MENU_EVENT_CHECK_UPDATES => {
            let _ = app.emit("prom:native-menu-update-check", json!({ "id": id }));
            #[cfg(desktop)]
            {
                let app_handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = crate::commands::update::native_update_check(
                        app_handle,
                        Some("manual".to_string()),
                    )
                    .await;
                });
            }
        }
        MENU_EVENT_QUIT => app.exit(0),
        _ => {}
    }
}
