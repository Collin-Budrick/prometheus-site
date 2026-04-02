use async_compression::tokio::bufread::GzipDecoder;
use async_compression::tokio::bufread::ZstdDecoder;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::io::Cursor;

use axum::body::Body;
use http::header::SET_COOKIE;
use http::{Request, StatusCode};
use http_body_util::BodyExt;
use prometheus_platform_rs::app;
use prometheus_platform_rs::config::{AppConfig, AuthConfig, FeatureFlags};
use prometheus_platform_rs::shared::AppState;
use serde_json::Value;
use tokio::io::{AsyncReadExt, BufReader};
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
            jwt_issuer: "urn:prometheus:better-auth".to_string(),
            jwt_audience: "prometheus-site".to_string(),
            jwks_uri: "http://127.0.0.1:3211/api/auth/jwks".to_string(),
            post_logout_redirect_uri: None,
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

async fn response_bytes(response: axum::response::Response) -> Vec<u8> {
    response.into_body().collect().await.unwrap().to_bytes().to_vec()
}

async fn gunzip_body(bytes: Vec<u8>) -> Vec<u8> {
    let reader = BufReader::new(Cursor::new(bytes));
    let mut decoder = GzipDecoder::new(reader);
    let mut output = Vec::new();
    decoder.read_to_end(&mut output).await.unwrap();
    output
}

async fn zstd_body(bytes: Vec<u8>) -> Vec<u8> {
    let reader = BufReader::new(Cursor::new(bytes));
    let mut decoder = ZstdDecoder::new(reader);
    let mut output = Vec::new();
    decoder.read_to_end(&mut output).await.unwrap();
    output
}

fn response_cookie(response: &axum::response::Response) -> String {
    response
        .headers()
        .get(SET_COOKIE)
        .unwrap()
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_string()
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
async fn dev_session_sets_a_site_cookie_outside_production() {
    let state = AppState::new(test_config()).await.unwrap();
    let router = app::build_router(state);

    let response = router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/auth/dev/session")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "loginMethod": "github",
                        "providerId": "github"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let set_cookie = response
        .headers()
        .get(SET_COOKIE)
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    let payload = response_json(response).await;
    assert_eq!(
        payload
            .get("user")
            .and_then(|value| value.get("id"))
            .and_then(Value::as_str),
        Some("dev-github")
    );
    assert_eq!(
        payload
            .get("user")
            .and_then(|value| value.get("loginMethod"))
            .and_then(Value::as_str),
        Some("github")
    );

    let request_cookie = set_cookie.split(';').next().unwrap().to_string();
    let restored = router
        .oneshot(
            Request::builder()
                .uri("/auth/session")
                .header("cookie", request_cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(restored.status(), StatusCode::OK);
    assert_eq!(
        response_json(restored)
            .await
            .get("session")
            .and_then(|value| value.get("userId"))
            .and_then(Value::as_str),
        Some("dev-github")
    );
}

#[tokio::test]
async fn dev_session_is_not_available_in_production() {
    let mut config = test_config();
    config.environment = "production".to_string();
    let state = AppState::new(config).await.unwrap();
    let router = app::build_router(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/auth/dev/session")
                .header("content-type", "application/json")
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn dev_local_account_can_register_logout_and_login_again() {
    let state = AppState::new(test_config()).await.unwrap();
    let router = app::build_router(state);
    let email = "dev-local@example.com";
    let password = "password-123";
    let name = "Local Dev User";

    let register = router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/auth/dev/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "name": name,
                        "email": email,
                        "password": password
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(register.status(), StatusCode::OK);
    let register_cookie = response_cookie(&register);
    let register_payload = response_json(register).await;
    let registered_user = register_payload.get("user").cloned().unwrap_or(Value::Null);
    let registered_id = registered_user
        .get("id")
        .and_then(Value::as_str)
        .unwrap()
        .to_string();
    assert!(registered_id.starts_with("dev-local-"));
    assert_eq!(
        registered_user.get("name").and_then(Value::as_str),
        Some(name)
    );
    assert_eq!(
        registered_user.get("email").and_then(Value::as_str),
        Some(email)
    );
    assert_eq!(
        registered_user
            .get("providerId")
            .and_then(Value::as_str),
        Some("local")
    );

    let logout = router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/auth/logout")
                .header("cookie", register_cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(logout.status(), StatusCode::OK);

    let login = router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/auth/dev/login")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "email": email,
                        "password": password
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(login.status(), StatusCode::OK);
    let login_payload = response_json(login).await;
    assert_eq!(
        login_payload
            .get("user")
            .and_then(|value| value.get("id"))
            .and_then(Value::as_str),
        Some(registered_id.as_str())
    );
    assert_eq!(
        login_payload
            .get("user")
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str),
        Some(name)
    );
}

#[tokio::test]
async fn dev_local_profile_name_updates_persist_across_login() {
    let state = AppState::new(test_config()).await.unwrap();
    let router = app::build_router(state);
    let email = "rename-dev@example.com";
    let password = "password-123";

    let register = router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/auth/dev/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "name": "Initial Dev Name",
                        "email": email,
                        "password": password
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(register.status(), StatusCode::OK);
    let register_cookie = response_cookie(&register);

    let rename = router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/auth/profile/name")
                .header("content-type", "application/json")
                .header("cookie", register_cookie)
                .body(Body::from(
                    serde_json::json!({
                        "name": "Renamed Dev User"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(rename.status(), StatusCode::OK);

    let login = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/auth/dev/login")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "email": email,
                        "password": password
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(login.status(), StatusCode::OK);
    assert_eq!(
        response_json(login)
            .await
            .get("user")
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str),
        Some("Renamed Dev User")
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
async fn fragments_batch_supports_opt_in_gzip_compression() {
    let state = AppState::new(test_config()).await.unwrap();
    let router = app::build_router(state);
    let uri = "/fragments/batch?protocol=2";
    let body = serde_json::json!([
        {
            "id": "fragment://page/store/stream@v5",
            "lang": "en"
        }
    ])
    .to_string();

    let compressed = router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(uri)
                .header("content-type", "application/json")
                .header("x-fragment-accept-encoding", "gzip")
                .body(Body::from(body.clone()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(compressed.status(), StatusCode::OK);
    assert_eq!(
        compressed
            .headers()
            .get("x-fragment-content-encoding")
            .and_then(|value| value.to_str().ok()),
        Some("gzip")
    );
    assert_eq!(
        compressed
            .headers()
            .get("vary")
            .and_then(|value| value.to_str().ok()),
        Some("x-fragment-accept-encoding")
    );
    let compressed_bytes = response_bytes(compressed).await;

    let plain = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(uri)
                .header("content-type", "application/json")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(plain.status(), StatusCode::OK);
    let plain_bytes = response_bytes(plain).await;

    assert_eq!(gunzip_body(compressed_bytes).await, plain_bytes);
}

#[tokio::test]
async fn fragments_batch_supports_opt_in_zstd_compression() {
    let state = AppState::new(test_config()).await.unwrap();
    let router = app::build_router(state);
    let uri = "/fragments/batch?protocol=2";
    let body = serde_json::json!([
        {
            "id": "fragment://page/store/stream@v5",
            "lang": "en"
        }
    ])
    .to_string();

    let compressed = router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(uri)
                .header("content-type", "application/json")
                .header("x-fragment-accept-encoding", "zstd")
                .body(Body::from(body.clone()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(compressed.status(), StatusCode::OK);
    assert_eq!(
        compressed
            .headers()
            .get("x-fragment-content-encoding")
            .and_then(|value| value.to_str().ok()),
        Some("zstd")
    );
    let compressed_bytes = response_bytes(compressed).await;

    let plain = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(uri)
                .header("content-type", "application/json")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(plain.status(), StatusCode::OK);
    let plain_bytes = response_bytes(plain).await;

    assert_eq!(zstd_body(compressed_bytes).await, plain_bytes);
}

#[tokio::test]
async fn fragments_bootstrap_supports_opt_in_gzip_compression() {
    let state = AppState::new(test_config()).await.unwrap();
    let router = app::build_router(state);
    let uri = "/fragments/bootstrap?path=%2Fstore&lang=en&protocol=2";

    let compressed = router
        .clone()
        .oneshot(
            Request::builder()
                .uri(uri)
                .header("x-fragment-accept-encoding", "gzip")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(compressed.status(), StatusCode::OK);
    assert_eq!(
        compressed
            .headers()
            .get("x-fragment-content-encoding")
            .and_then(|value| value.to_str().ok()),
        Some("gzip")
    );
    let compressed_bytes = response_bytes(compressed).await;

    let plain = router
        .oneshot(
            Request::builder()
                .uri(uri)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(plain.status(), StatusCode::OK);
    let plain_bytes = response_bytes(plain).await;

    assert_eq!(gunzip_body(compressed_bytes).await, plain_bytes);
}

#[tokio::test]
async fn fragments_bootstrap_supports_opt_in_zstd_compression() {
    let state = AppState::new(test_config()).await.unwrap();
    let router = app::build_router(state);
    let uri = "/fragments/bootstrap?path=%2Fstore&lang=en&protocol=2";

    let compressed = router
        .clone()
        .oneshot(
            Request::builder()
                .uri(uri)
                .header("x-fragment-accept-encoding", "zstd")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(compressed.status(), StatusCode::OK);
    assert_eq!(
        compressed
            .headers()
            .get("x-fragment-content-encoding")
            .and_then(|value| value.to_str().ok()),
        Some("zstd")
    );
    let compressed_bytes = response_bytes(compressed).await;

    let plain = router
        .oneshot(
            Request::builder()
                .uri(uri)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(plain.status(), StatusCode::OK);
    let plain_bytes = response_bytes(plain).await;

    assert_eq!(zstd_body(compressed_bytes).await, plain_bytes);
}

#[tokio::test]
async fn fragments_stream_supports_opt_in_gzip_compression_without_touching_transport_proxy() {
    let state = AppState::new(test_config()).await.unwrap();
    let router = app::build_router(state);
    let stream_uri = "/fragments/stream?path=%2Fstore&lang=en&protocol=2";

    let compressed = router
        .clone()
        .oneshot(
            Request::builder()
                .uri(stream_uri)
                .header("x-fragment-accept-encoding", "gzip")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(compressed.status(), StatusCode::OK);
    assert_eq!(
        compressed
            .headers()
            .get("x-fragment-content-encoding")
            .and_then(|value| value.to_str().ok()),
        Some("gzip")
    );

    let transport = router
        .oneshot(
            Request::builder()
                .uri("/fragments/transport?path=%2Fstore&lang=en&protocol=2")
                .header("x-fragment-accept-encoding", "gzip")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(transport.status(), StatusCode::OK);
    assert!(transport.headers().get("x-fragment-content-encoding").is_none());
}

#[tokio::test]
async fn fragments_stream_supports_opt_in_zstd_compression_without_touching_transport_proxy() {
    let state = AppState::new(test_config()).await.unwrap();
    let router = app::build_router(state);
    let stream_uri = "/fragments/stream?path=%2Fstore&lang=en&protocol=2&live=0";

    let compressed = router
        .clone()
        .oneshot(
            Request::builder()
                .uri(stream_uri)
                .header("x-fragment-accept-encoding", "zstd")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(compressed.status(), StatusCode::OK);
    assert_eq!(
        compressed
            .headers()
            .get("x-fragment-content-encoding")
            .and_then(|value| value.to_str().ok()),
        Some("zstd")
    );
    let compressed_bytes = response_bytes(compressed).await;

    let plain = router
        .clone()
        .oneshot(
            Request::builder()
                .uri(stream_uri)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(plain.status(), StatusCode::OK);
    let plain_bytes = response_bytes(plain).await;
    assert_eq!(zstd_body(compressed_bytes).await, plain_bytes);

    let transport = router
        .oneshot(
            Request::builder()
                .uri("/fragments/transport?path=%2Fstore&lang=en&protocol=2&live=0")
                .header("x-fragment-accept-encoding", "zstd")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(transport.status(), StatusCode::OK);
    assert!(transport.headers().get("x-fragment-content-encoding").is_none());
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
