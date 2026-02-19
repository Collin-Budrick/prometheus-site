use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Runtime};
#[cfg(desktop)]
use tauri::Manager;
#[cfg(desktop)]
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogResult};
use tauri_plugin_notification::NotificationExt;

fn is_supported_haptic_kind(kind: &str) -> bool {
    matches!(kind, "tap" | "selection" | "success" | "warning" | "error")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionSheetOption {
    pub title: String,
    pub style: Option<String>,
}

#[tauri::command]
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub fn hide_native_splash<R: Runtime>(app: AppHandle<R>) -> bool {
    #[cfg(desktop)]
    let hidden = if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        true
    } else {
        false
    };

    #[cfg(not(desktop))]
    let hidden = true;

    let _ = app.emit(
        "prom:native-splash-hidden",
        json!({
          "ok": hidden
        }),
    );

    hidden
}

#[tauri::command]
pub async fn native_show_toast<R: Runtime>(
    app: AppHandle<R>,
    text: String,
    duration: Option<String>,
) -> bool {
    let mut shown = false;

    let notification = app
        .notification()
        .builder()
        .title("Prometheus")
        .body(text.clone());

    if notification.show().is_ok() {
        shown = true;
    }

    let _ = app.emit(
        "prom:native-toast",
        json!({
          "text": text,
          "duration": duration.unwrap_or_else(|| "short".to_string()),
          "shown": shown
        }),
    );

    shown
}

#[cfg(desktop)]
fn resolve_desktop_action_sheet(
    app: &AppHandle<impl Runtime>,
    title: String,
    options: Vec<ActionSheetOption>,
) -> Option<usize> {
    if options.is_empty() {
        return None;
    }

    let mut dialog = app.dialog().message("Choose an option");
    if !title.trim().is_empty() {
        dialog = dialog.title(title);
    }

    let first = options
        .first()
        .map(|entry| entry.title.clone())
        .unwrap_or_else(|| "OK".to_string());
    let second = options
        .get(1)
        .map(|entry| entry.title.clone())
        .unwrap_or_else(|| "Cancel".to_string());
    let third = options
        .get(2)
        .map(|entry| entry.title.clone())
        .unwrap_or_else(|| "Cancel".to_string());

    let result = if options.len() == 1 {
        dialog
            .buttons(MessageDialogButtons::OkCustom(first.clone()))
            .blocking_show_with_result()
    } else if options.len() == 2 {
        dialog
            .buttons(MessageDialogButtons::OkCancelCustom(
                first.clone(),
                second.clone(),
            ))
            .blocking_show_with_result()
    } else {
        dialog
            .buttons(MessageDialogButtons::YesNoCancelCustom(
                first.clone(),
                second.clone(),
                third.clone(),
            ))
            .blocking_show_with_result()
    };

    match result {
        MessageDialogResult::Ok | MessageDialogResult::Yes => Some(0),
        MessageDialogResult::No => Some(1),
        MessageDialogResult::Cancel => {
            if options.len() == 2 {
                Some(1)
            } else {
                Some(2)
            }
        }
        MessageDialogResult::Custom(label) => options.iter().position(|entry| entry.title == label),
    }
}

#[tauri::command]
pub async fn native_action_sheet<R: Runtime>(
    app: AppHandle<R>,
    title: String,
    options: Vec<ActionSheetOption>,
) -> Option<usize> {
    #[cfg(desktop)]
    let selected = resolve_desktop_action_sheet(&app, title.clone(), options.clone());

    #[cfg(not(desktop))]
    let selected: Option<usize> = None;

    let _ = app.emit(
        "prom:native-action-sheet",
        json!({
          "title": title,
          "options": options,
          "selected": selected
        }),
    );

    selected
}

#[tauri::command]
pub async fn native_haptic<R: Runtime>(app: AppHandle<R>, kind: String) -> bool {
    let supported_platform = cfg!(target_os = "android") || cfg!(target_os = "ios");
    let supported = supported_platform && is_supported_haptic_kind(kind.as_str());

    let _ = app.emit(
        "prom:native-haptic",
        json!({
          "kind": kind,
          "supported": supported,
          "supportedPlatform": supported_platform
        }),
    );

    supported
}

#[cfg(test)]
mod tests {
    use super::is_supported_haptic_kind;

    #[test]
    fn validates_haptic_kind_allowlist() {
        assert!(is_supported_haptic_kind("tap"));
        assert!(is_supported_haptic_kind("selection"));
        assert!(is_supported_haptic_kind("success"));
        assert!(is_supported_haptic_kind("warning"));
        assert!(is_supported_haptic_kind("error"));
        assert!(!is_supported_haptic_kind("unknown"));
        assert!(!is_supported_haptic_kind(""));
    }
}
