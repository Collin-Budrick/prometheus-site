use std::time::Duration;

use axum::extract::{DefaultBodyLimit, State};
use axum::http::{HeaderValue, Method, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, options};
use axum::Json;
use axum::Router;
use once_cell::sync::Lazy;
use serde::Deserialize;
use serde_json::json;
use tokio::net::TcpListener;

use crate::auth;
use crate::chat;
use crate::config::AppConfig;
use crate::fragments;
use crate::home_collab;
use crate::shared::AppState;
use crate::store;

#[derive(Debug, Deserialize)]
struct EchoBody {
    prompt: String,
}

static STARTED_AT: Lazy<std::time::Instant> = Lazy::new(std::time::Instant::now);

pub async fn run_http_server(config: AppConfig, state: AppState) -> anyhow::Result<()> {
    let listener = TcpListener::bind((config.http_host.as_str(), config.http_port)).await?;
    let router = build_router(state);

    tracing::info!(
        "rust api listening on http://{}:{}",
        config.http_host,
        config.http_port
    );
    axum::serve(listener, router).await?;
    Ok(())
}

pub fn build_router(state: AppState) -> Router {
    let features = state.config.features.clone();
    let mut router = Router::new()
        .route("/health", get(health))
        .route("/ai/echo", axum::routing::post(ai_echo))
        .route("/{*path}", options(preflight))
        .merge(fragments::router());

    if features.auth {
        router = router.nest("/auth", auth::router());
    }
    if features.store {
        router = router.nest("/store", store::router());
    }
    if features.messaging {
        router = router.merge(chat::router());
    }
    if features.realtime {
        router = router.merge(home_collab::router());
    }

    router
        .layer(DefaultBodyLimit::max(1024 * 1024))
        .with_state(state)
}

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    let mut healthy = true;
    let mut spacetime = json!({ "status": "ok" });
    let mut garnet = json!({ "status": "ok" });

    if let Err(error) = check_spacetime_health(&state).await {
        healthy = false;
        spacetime = json!({
            "status": "error",
            "error": error,
        });
    }

    if let Err(error) = check_garnet_health(&state).await {
        healthy = false;
        garnet = json!({
            "status": "error",
            "error": error,
        });
    }

    let status = if healthy {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (
        status,
        Json(json!({
            "status": if healthy { "ok" } else { "degraded" },
            "uptime": STARTED_AT.elapsed().as_secs_f64(),
            "dependencies": {
                "spacetime": spacetime,
                "garnet": garnet,
            }
        })),
    )
}

async fn ai_echo(Json(body): Json<EchoBody>) -> impl IntoResponse {
    let prompt = body.prompt.trim();
    if prompt.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "prompt is required" })),
        )
            .into_response();
    }
    if prompt.len() > 4096 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "prompt is too long" })),
        )
            .into_response();
    }
    Json(json!({
        "echo": format!("You said: {prompt}")
    }))
    .into_response()
}

async fn preflight() -> impl IntoResponse {
    let mut response = StatusCode::NO_CONTENT.into_response();
    let headers = response.headers_mut();
    headers.insert("access-control-allow-origin", HeaderValue::from_static("*"));
    headers.insert(
        "access-control-allow-methods",
        HeaderValue::from_str(&format!(
            "{}, {}, {}",
            Method::GET,
            Method::POST,
            Method::DELETE
        ))
        .unwrap(),
    );
    headers.insert(
        "access-control-allow-headers",
        HeaderValue::from_static("content-type, authorization, cookie"),
    );
    response
}

async fn check_spacetime_health(state: &AppState) -> Result<(), String> {
    let timeout = Duration::from_secs(3);
    let base = state.config.spacetime_uri.trim_end_matches('/');

    let ping_response = state
        .http
        .post(format!("{base}/v1/identity"))
        .header("accept", "application/json")
        .timeout(timeout)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !ping_response.status().is_success() {
        return Err(format!(
            "SpaceTimeDB ping failed ({})",
            ping_response.status()
        ));
    }

    let module_response = state
        .http
        .get(format!(
            "{base}/v1/database/{}",
            state.config.spacetime_module
        ))
        .header("accept", "application/json")
        .timeout(timeout)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !module_response.status().is_success() {
        return Err(format!(
            "SpaceTimeDB module check failed ({})",
            module_response.status()
        ));
    }

    Ok(())
}

async fn check_garnet_health(state: &AppState) -> Result<(), String> {
    let mut connection = state
        .redis
        .get_multiplexed_async_connection()
        .await
        .map_err(|error| error.to_string())?;
    let pong: String = redis::cmd("PING")
        .query_async(&mut connection)
        .await
        .map_err(|error| error.to_string())?;
    if pong.eq_ignore_ascii_case("pong") {
        Ok(())
    } else {
        Err(format!("Unexpected Garnet ping response: {pong}"))
    }
}
