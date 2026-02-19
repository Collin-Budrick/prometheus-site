#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod menu;
mod tray;

use tauri::{Emitter, Manager};

fn init_tls_provider() {
    // Required by rustls 0.23+/reqwest on Android to avoid "No provider set"
    // panics from WebView request interception.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_tls_provider();

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_sql::Builder::default().build());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            .plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(|app| {
            #[cfg(desktop)]
            {
                menu::install_menu(app.handle())?;
                tray::install_tray(app.handle())?;
                app.handle().on_menu_event(menu::handle_menu_event);
            }

            if let Some(window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if matches!(event, tauri::WindowEvent::Focused(true)) {
                        let _ = app_handle.emit(
                            "prom:native-resume",
                            serde_json::json!({ "reason": "window-focus" }),
                        );
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::native_ui::app_version,
            commands::native_ui::hide_native_splash,
            commands::native_ui::native_show_toast,
            commands::native_ui::native_action_sheet,
            commands::native_ui::native_haptic,
            commands::privacy::native_privacy_screen_set,
            commands::review::native_request_review,
            commands::update::native_update_check,
            commands::background::native_background_dispatch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
