use axum::extract::ws::WebSocketUpgrade;
use axum::extract::State;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use yrs_axum::signaling::signaling_conn;

use crate::shared::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/yjs", get(signaling_socket))
        .route("/yjs/", get(signaling_socket))
        .route("/yjs/{*path}", get(signaling_socket))
}

async fn signaling_socket(
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    let signaling = state.yjs_signaling.clone();
    ws.on_upgrade(move |socket| async move {
        if let Err(error) = signaling_conn(socket, signaling).await {
            tracing::warn!("yjs signaling connection failed: {error}");
        }
    })
}

#[cfg(test)]
mod tests {
    use crate::app;
    use crate::config::{AppConfig, FeatureFlags};
    use crate::shared::AppState;
    use futures::{SinkExt, StreamExt};
    use std::collections::HashSet;
    use std::net::SocketAddr;
    use std::path::PathBuf;
    use tokio::net::TcpListener;
    use tokio::time::{sleep, timeout, Duration};
    use tokio_tungstenite::{connect_async, tungstenite::Message};

    fn test_config() -> AppConfig {
        AppConfig {
            environment: "test".to_string(),
            http_host: "127.0.0.1".to_string(),
            http_port: 0,
            webtransport_addr: SocketAddr::from(([127, 0, 0, 1], 4444)),
            webtransport_cert_path: PathBuf::from("test-cert.pem"),
            webtransport_key_path: PathBuf::from("test-key.pem"),
            webtransport_allowed_origins: HashSet::new(),
            webtransport_allow_any_origin: true,
            enable_webtransport_fragments: false,
            enable_webtransport_datagrams: false,
            webtransport_max_datagram_size: 1200,
            spacetime_uri: "http://127.0.0.1:3000/".to_string(),
            spacetime_module: "test-module".to_string(),
            garnet_host: "127.0.0.1".to_string(),
            garnet_port: 6379,
            auth: None,
            features: FeatureFlags {
                auth: false,
                store: false,
                messaging: false,
                realtime: true,
            },
        }
    }

    #[tokio::test]
    async fn api_router_relays_yjs_signaling_messages() {
        let state = AppState::new(test_config()).await.unwrap();
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let addr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, app::build_router(state))
                .await
                .unwrap();
        });

        let (mut first, _) = connect_async(format!("ws://{addr}/yjs")).await.unwrap();
        let (mut second, _) = connect_async(format!("ws://{addr}/yjs/embedded"))
            .await
            .unwrap();

        first
            .send(Message::Text(
                r#"{"type":"subscribe","topics":["room-a"]}"#.into(),
            ))
            .await
            .unwrap();
        second
            .send(Message::Text(
                r#"{"type":"subscribe","topics":["room-a"]}"#.into(),
            ))
            .await
            .unwrap();

        sleep(Duration::from_millis(50)).await;

        let publish = r#"{"type":"publish","topic":"room-a","payload":"hello"}"#;
        first.send(Message::Text(publish.into())).await.unwrap();

        let relayed = timeout(Duration::from_secs(2), async {
            loop {
                match second.next().await {
                    Some(Ok(Message::Text(text))) if text.contains(r#""payload":"hello""#) => {
                        break text;
                    }
                    Some(Ok(_)) => continue,
                    Some(Err(error)) => panic!("unexpected websocket error: {error}"),
                    None => panic!("websocket closed before receiving a relayed signal"),
                }
            }
        })
        .await
        .expect("timed out waiting for relayed signal");

        assert_eq!(relayed.as_str(), publish);

        let _ = first.send(Message::Close(None)).await;
        let _ = second.send(Message::Close(None)).await;
        server.abort();
    }
}
