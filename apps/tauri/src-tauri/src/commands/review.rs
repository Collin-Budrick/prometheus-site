use serde_json::json;
use tauri::{AppHandle, Emitter, Runtime};

#[tauri::command]
pub async fn native_request_review<R: Runtime>(
    app: AppHandle<R>,
    flow: Option<String>,
    trigger: Option<String>,
) -> bool {
    let supported = cfg!(target_os = "ios") || cfg!(target_os = "android");
    let _ = app.emit(
        "prom:native-review-request",
        json!({
          "supported": supported,
          "flow": flow.unwrap_or_else(|| "manual".to_string()),
          "trigger": trigger.unwrap_or_else(|| "manual".to_string())
        }),
    );
    supported
}
