use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, Runtime};

fn resolve_platform() -> &'static str {
    if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "ios") {
        "ios"
    } else {
        "desktop"
    }
}

#[tauri::command]
pub async fn native_privacy_screen_set<R: Runtime>(
    app: AppHandle<R>,
    enabled: bool,
    source: Option<String>,
) -> bool {
    let platform = resolve_platform();
    let mut applied = true;
    let mut mode = "native-protected";

    // Desktop keeps web behavior unchanged and reports success telemetry without
    // applying OS-level privacy overlays by default.
    if platform == "desktop" {
        mode = "desktop-noop";
    } else if let Some(window) = app.get_webview_window("main") {
        if window.set_content_protected(enabled).is_err() {
            applied = false;
        }
    } else {
        applied = false;
    }

    let _ = app.emit(
        "prom:native-privacy-screen",
        json!({
          "enabled": enabled,
          "applied": applied,
          "platform": platform,
          "mode": mode,
          "source": source.unwrap_or_else(|| "unknown".to_string())
        }),
    );

    applied
}

#[cfg(test)]
mod tests {
    use super::resolve_platform;

    #[test]
    fn resolves_supported_platform_label() {
        let platform = resolve_platform();
        assert!(matches!(platform, "android" | "ios" | "desktop"));
    }
}
