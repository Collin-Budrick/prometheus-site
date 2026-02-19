use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Runtime};
#[cfg(desktop)]
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Serialize)]
pub struct NativeUpdateCheckResult {
    pub checked: bool,
    pub available: bool,
    pub installed: bool,
    pub status: String,
}

#[tauri::command]
pub async fn native_update_check<R: Runtime>(
    app: AppHandle<R>,
    trigger: Option<String>,
) -> NativeUpdateCheckResult {
    let trigger_value = trigger.unwrap_or_else(|| "manual".to_string());

    #[allow(unused_mut)]
    let mut result = NativeUpdateCheckResult {
        checked: false,
        available: false,
        installed: false,
        status: "unsupported-platform".to_string(),
    };

    #[cfg(desktop)]
    {
        result.status = "disabled".to_string();
        match app.updater() {
            Ok(updater) => match updater.check().await {
                Ok(Some(update)) => {
                    result.checked = true;
                    result.available = true;
                    result.status = "available".to_string();

                    match update.download_and_install(|_, _| {}, || {}).await {
                        Ok(()) => {
                            result.installed = true;
                            result.status = "installed".to_string();
                        }
                        Err(error) => {
                            result.status = format!("install-failed:{error}");
                        }
                    }
                }
                Ok(None) => {
                    result.checked = true;
                    result.status = "up-to-date".to_string();
                }
                Err(error) => {
                    result.status = format!("check-failed:{error}");
                }
            },
            Err(error) => {
                result.status = format!("updater-unavailable:{error}");
            }
        }
    }

    let _ = app.emit(
        "prom:native-update-check",
        json!({
          "trigger": trigger_value,
          "checked": result.checked,
          "available": result.available,
          "installed": result.installed,
          "status": result.status
        }),
    );

    result
}
