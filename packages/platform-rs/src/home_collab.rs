use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use futures::StreamExt;
use serde::Deserialize;
use serde_json::json;
use tokio::sync::{broadcast, RwLock};

use crate::shared::AppState;

#[derive(Clone)]
pub struct HomeCollabState {
    text: Arc<RwLock<String>>,
    tx: broadcast::Sender<String>,
}

#[derive(Debug, Default, Deserialize)]
struct ListenerQuery {
    mode: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IncomingCollabMessage {
    #[serde(rename = "type")]
    kind: String,
    text: Option<String>,
}

impl HomeCollabState {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(64);
        Self {
            text: Arc::new(RwLock::new(
                "Write something. Everyone here sees it live.".to_string(),
            )),
            tx,
        }
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/home/collab/dock/ws", get(editor_socket))
        .route("/home/collab/listener/dock/ws", get(listener_socket))
}

async fn editor_socket(
    State(state): State<AppState>,
    Query(query): Query<ListenerQuery>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    if query.mode.as_deref() == Some("listener") {
        return ws
            .on_upgrade(move |socket| handle_socket(socket, state, true))
            .into_response();
    }
    ws.on_upgrade(move |socket| handle_socket(socket, state, false))
}

async fn listener_socket(State(state): State<AppState>, ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state, true))
}

async fn handle_socket(mut socket: WebSocket, state: AppState, listener_mode: bool) {
    let mut rx = state.home_collab.tx.subscribe();
    let initial = state.home_collab.text.read().await.clone();
    let initial_message = if listener_mode {
        json!({
            "type": "home-collab:text-init",
            "text": initial,
        })
    } else {
        json!({
            "type": "home-collab:init",
            "snapshot": initial,
            "text": initial,
        })
    };

    if socket
        .send(Message::Text(initial_message.to_string().into()))
        .await
        .is_err()
    {
        return;
    }

    loop {
        tokio::select! {
            maybe_message = socket.next(), if !listener_mode => {
                let Some(Ok(Message::Text(text))) = maybe_message else {
                    break;
                };
                let Ok(payload) = serde_json::from_str::<IncomingCollabMessage>(&text) else {
                    continue;
                };
                if payload.kind != "home-collab:update" {
                    continue;
                }
                let next_text = payload.text.unwrap_or_default();
                {
                    let mut shared = state.home_collab.text.write().await;
                    *shared = next_text.clone();
                }
                let _ = state.home_collab.tx.send(next_text.clone());
                if socket.send(Message::Text(json!({ "type": "home-collab:ack", "text": next_text }).to_string().into())).await.is_err() {
                    break;
                }
            }
            inbound = rx.recv() => {
                let Ok(text) = inbound else {
                    continue;
                };
                let message = if listener_mode {
                    json!({ "type": "home-collab:text", "text": text })
                } else {
                    json!({ "type": "home-collab:update", "text": text })
                };
                if socket.send(Message::Text(message.to_string().into())).await.is_err() {
                    break;
                }
            }
        }
    }
}
