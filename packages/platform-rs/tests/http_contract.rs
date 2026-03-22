use std::net::SocketAddr;
use std::path::PathBuf;

use axum::body::Body;
use http::{Request, StatusCode};
use http_body_util::BodyExt;
use prometheus_platform_rs::app;
use prometheus_platform_rs::config::{AppConfig, AuthConfig, FeatureFlags};
use prometheus_platform_rs::shared::AppState;
use serde_json::Value;
use tower::util::ServiceExt;

fn test_config() -> AppConfig {
    AppConfig {
        environment: "test".to_string(),
        http_host: "127.0.0.1".to_string(),
        http_port: 0,
        webtransport_addr: SocketAddr::from(([127, 0, 0, 1], 4444)),
        webtransport_cert_path: PathBuf::from("test-cert.pem"),
        webtransport_key_path: PathBuf::from("test-key.pem"),
        webtransport_allowed_origins: Default::default(),
        webtransport_allow_any_origin: true,
        enable_webtransport_fragments: true,
        enable_webtransport_datagrams: true,
        webtransport_max_datagram_size: 1200,
        spacetime_uri: "http://127.0.0.1:3000".to_string(),
        spacetime_module: "prometheus-site-local".to_string(),
        garnet_host: "127.0.0.1".to_string(),
        garnet_port: 6379,
        auth: Some(AuthConfig {
            cookie_secret: "test-cookie-secret-test-cookie-secret".to_string(),
            spacetimeauth_authority: "https://auth.spacetimedb.com/oidc".to_string(),
            spacetimeauth_client_id: "prometheus-site-dev".to_string(),
            spacetimeauth_jwks_uri: "https://auth.spacetimedb.com/oidc/jwks".to_string(),
            spacetimeauth_post_logout_redirect_uri: None,
            bootstrap_private_key: Some("bootstrap-dev-secret".to_string()),
        }),
        features: FeatureFlags {
            auth: true,
            store: true,
            messaging: true,
            realtime: true,
        },
    }
}

async fn response_json(response: axum::response::Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

#[tokio::test]
async fn auth_session_returns_anonymous_payload_without_cookie() {
    let state = AppState::new(test_config()).await.unwrap();
    let router = app::build_router(state);

    let response = router
        .oneshot(
            Request::builder()
                .uri("/auth/session")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response_json(response).await,
        serde_json::json!({
            "user": Value::Null,
            "session": Value::Null
        })
    );
}

#[tokio::test]
async fn store_routes_are_nested_under_store_prefix() {
    let state = AppState::new(test_config()).await.unwrap();
    let router = app::build_router(state);

    let prefixed = router
        .clone()
        .oneshot(
            Request::builder()
                .uri("/store/items")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(prefixed.status(), StatusCode::OK);
    let payload = response_json(prefixed).await;
    assert!(payload.get("items").and_then(Value::as_array).is_some());
    assert!(payload.get("cursor").is_some());

    let unprefixed = router
        .oneshot(
            Request::builder()
                .uri("/items")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unprefixed.status(), StatusCode::METHOD_NOT_ALLOWED);
}

#[tokio::test]
async fn fragments_plan_uses_etag_for_conditional_requests() {
    let state = AppState::new(test_config()).await.unwrap();
    let router = app::build_router(state);

    let first = router
        .clone()
        .oneshot(
            Request::builder()
                .uri("/fragments/plan?path=%2F&lang=en&protocol=2")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(first.status(), StatusCode::OK);
    let etag = first
        .headers()
        .get("etag")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();

    let second = router
        .oneshot(
            Request::builder()
                .uri("/fragments/plan?path=%2F&lang=en&protocol=2")
                .header("if-none-match", etag)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(second.status(), StatusCode::NOT_MODIFIED);
}

#[tokio::test]
async fn health_reports_degraded_when_dependencies_are_unreachable() {
    let mut config = test_config();
    config.spacetime_uri = "http://127.0.0.1:1".to_string();
    config.garnet_port = 1;
    let state = AppState::new(config).await.unwrap();
    let router = app::build_router(state);

    let response = router
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    let payload = response_json(response).await;
    assert_eq!(
        payload.get("status").and_then(Value::as_str),
        Some("degraded")
    );
    assert_eq!(
        payload
            .get("dependencies")
            .and_then(|value| value.get("spacetime"))
            .and_then(|value| value.get("status"))
            .and_then(Value::as_str),
        Some("error")
    );
    assert_eq!(
        payload
            .get("dependencies")
            .and_then(|value| value.get("garnet"))
            .and_then(|value| value.get("status"))
            .and_then(Value::as_str),
        Some("error")
    );
}
