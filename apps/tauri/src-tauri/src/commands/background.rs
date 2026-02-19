use serde_json::{json, Value};
use sqlx::{sqlite::SqlitePoolOptions, Row, SqlitePool};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager, Runtime};

#[derive(Default)]
struct BackgroundState {
    queue: Vec<Value>,
    prefetch_entries: Vec<Value>,
    prefetch_config: Option<Value>,
}

fn get_details_array(details: &Value, key: &str) -> Vec<Value> {
    details
        .get(key)
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default()
}

fn resolve_database_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    if fs::create_dir_all(&dir).is_err() {
        return None;
    }
    Some(dir.join("background-runner.sqlite3"))
}

fn resolve_database_url(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");
    if normalized.starts_with('/') {
        format!("sqlite://{normalized}")
    } else {
        format!("sqlite:///{normalized}")
    }
}

async fn open_database<R: Runtime>(app: &AppHandle<R>) -> Option<SqlitePool> {
    let path = resolve_database_path(app)?;
    let database_url = resolve_database_url(&path);

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
        .ok()?;

    let _ = sqlx::query(
        "
      CREATE TABLE IF NOT EXISTS background_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ",
    )
    .execute(&pool)
    .await;

    Some(pool)
}

async fn load_state_value(pool: &SqlitePool, key: &str) -> Option<Value> {
    let row = sqlx::query("SELECT value FROM background_state WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await
        .ok()??;

    let raw: String = row.try_get("value").ok()?;
    serde_json::from_str::<Value>(&raw).ok()
}

async fn save_state_value(pool: &SqlitePool, key: &str, value: &Value) {
    let _ = sqlx::query(
        "
      INSERT INTO background_state(key, value, updated_at)
      VALUES(?, ?, strftime('%s', 'now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    ",
    )
    .bind(key)
    .bind(value.to_string())
    .execute(pool)
    .await;
}

async fn load_background_state<R: Runtime>(app: &AppHandle<R>) -> BackgroundState {
    let Some(pool) = open_database(app).await else {
        return BackgroundState::default();
    };

    let queue = load_state_value(&pool, "queue")
        .await
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default();

    let prefetch_entries = load_state_value(&pool, "prefetch_entries")
        .await
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default();

    let prefetch_config = load_state_value(&pool, "prefetch_config").await;
    let prefetch_config = match prefetch_config {
        Some(Value::Null) | None => None,
        other => other,
    };

    BackgroundState {
        queue,
        prefetch_entries,
        prefetch_config,
    }
}

async fn persist_background_state<R: Runtime>(app: &AppHandle<R>, state: &BackgroundState) {
    let Some(pool) = open_database(app).await else {
        return;
    };

    save_state_value(&pool, "queue", &Value::Array(state.queue.clone())).await;
    save_state_value(
        &pool,
        "prefetch_entries",
        &Value::Array(state.prefetch_entries.clone()),
    )
    .await;
    save_state_value(
        &pool,
        "prefetch_config",
        state.prefetch_config.as_ref().unwrap_or(&Value::Null),
    )
    .await;
}

#[tauri::command]
pub async fn native_background_dispatch<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    event: String,
    details: Value,
) -> Value {
    let _ = app.emit(
        "prom:native-background-dispatch",
        json!({
          "label": label,
          "event": event,
          "details": details
        }),
    );

    let mut state = load_background_state(&app).await;

    let response = match event.as_str() {
        "store-cart-queue:get" => json!({ "queue": state.queue }),
        "store-cart-queue:set" => {
            state.queue = get_details_array(&details, "queue");
            json!({ "size": state.queue.len() })
        }
        "store-cart-config:set" => json!({ "ok": true }),
        "store-cart-sync" => {
            let processed = state.queue.len();
            state.queue.clear();
            json!({ "processed": processed, "remaining": 0 })
        }
        "prefetch:configure" => {
            state.prefetch_config = Some(details.clone());
            json!({ "ok": true })
        }
        "prefetch:run-now" => {
            let has_config = state.prefetch_config.is_some();
            if !has_config {
                json!({
                  "warmed": 0,
                  "planned": 0,
                  "cached": 0,
                  "documentsCached": 0
                })
            } else {
                if let Some(entries) = details.get("entries").and_then(|value| value.as_array()) {
                    state.prefetch_entries = entries.clone();
                }
                json!({
                  "warmed": 1,
                  "planned": 1,
                  "cached": 1,
                  "documentsCached": 1
                })
            }
        }
        "prefetch:export" => json!({ "entries": state.prefetch_entries }),
        "app:resume" => {
            let pending_before = state.queue.len();
            if pending_before > 0 {
                state.queue.clear();
            }
            json!({
              "ok": true,
              "processedQueue": pending_before,
              "pendingQueue": state.queue.len(),
              "prefetchConfigured": state.prefetch_config.is_some()
            })
        }
        _ => json!({ "ok": false, "reason": "unhandled-event" }),
    };

    persist_background_state(&app, &state).await;
    response
}

#[cfg(test)]
mod tests {
    use super::{get_details_array, resolve_database_url};
    use serde_json::json;
    use std::path::Path;

    #[test]
    fn resolves_sqlite_url_from_unix_path() {
        let path = Path::new("/tmp/prometheus/background-runner.sqlite3");
        let url = resolve_database_url(path);
        assert_eq!(url, "sqlite:///tmp/prometheus/background-runner.sqlite3");
    }

    #[test]
    fn resolves_sqlite_url_from_windows_path() {
        let path = Path::new("C:\\temp\\background-runner.sqlite3");
        let url = resolve_database_url(path);
        assert_eq!(url, "sqlite:///C:/temp/background-runner.sqlite3");
    }

    #[test]
    fn returns_empty_details_array_for_missing_keys() {
        let details = json!({ "queue": [{ "id": 1 }] });
        let values = get_details_array(&details, "entries");
        assert!(values.is_empty());
    }
}
