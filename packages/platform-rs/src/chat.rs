use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Json;
use axum::Router;
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::{broadcast, RwLock};

use crate::auth::resolve_auth_session;
use crate::shared::AppState;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: u64,
    pub from: String,
    #[serde(rename = "authorId")]
    pub author_id: String,
    pub text: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Clone)]
pub struct ChatState {
    messages: Arc<RwLock<Vec<ChatMessage>>>,
    tx: broadcast::Sender<ChatMessage>,
}

#[derive(Debug, Deserialize)]
struct IncomingChatMessage {
    #[serde(rename = "type")]
    kind: String,
    text: Option<String>,
}

impl ChatState {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(64);
        let messages = vec![
            ChatMessage {
                id: 1,
                from: "alice".to_string(),
                author_id: "alice".to_string(),
                text: "Hello from Alice".to_string(),
                created_at: "2024-01-01T00:00:00Z".to_string(),
            },
            ChatMessage {
                id: 2,
                from: "bob".to_string(),
                author_id: "bob".to_string(),
                text: "Reply from Bob".to_string(),
                created_at: "2024-01-02T00:00:00Z".to_string(),
            },
        ];
        Self {
            messages: Arc::new(RwLock::new(messages)),
            tx,
        }
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/chat/history", get(get_history))
        .route("/ws", get(open_socket))
}

async fn get_history(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if resolve_auth_session(&headers, &state).is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "unauthorized" })),
        )
            .into_response();
    }
    let history = state.chat.messages.read().await.clone();
    Json(json!({ "messages": history })).into_response()
}

async fn open_socket(
    State(state): State<AppState>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    let session = resolve_auth_session(&headers, &state);
    ws.on_upgrade(move |socket| handle_socket(socket, state, session))
}

async fn handle_socket(
    mut socket: WebSocket,
    state: AppState,
    session: Option<crate::auth::AuthSession>,
) {
    let Some(session) = session else {
        let _ = socket
            .send(Message::Text(
                json!({ "type": "error", "code": 4401, "message": "unauthorized" })
                    .to_string()
                    .into(),
            ))
            .await;
        let _ = socket.close().await;
        return;
    };

    let history = state.chat.messages.read().await.clone();
    if socket
        .send(Message::Text(
            json!({
                "type": "welcome",
                "user": {
                    "id": session.claims.sub,
                    "name": session.claims.name
                },
                "history": history
            })
            .to_string()
            .into(),
        ))
        .await
        .is_err()
    {
        return;
    }

    let mut rx = state.chat.tx.subscribe();
    loop {
        tokio::select! {
            maybe_message = socket.next() => {
                let Some(Ok(Message::Text(text))) = maybe_message else {
                    break;
                };
                let parsed = serde_json::from_str::<IncomingChatMessage>(&text);
                let Ok(payload) = parsed else {
                    let _ = socket.send(Message::Text(json!({ "type": "error", "message": "invalid payload" }).to_string().into())).await;
                    continue;
                };
                if payload.kind != "chat" {
                    let _ = socket.send(Message::Text(json!({ "type": "error", "message": "unsupported message type" }).to_string().into())).await;
                    continue;
                }
                let content = payload.text.unwrap_or_default().trim().to_string();
                if content.is_empty() || content.len() > 2048 {
                    let _ = socket.send(Message::Text(json!({ "type": "error", "message": "invalid message length" }).to_string().into())).await;
                    continue;
                }

                let mut messages = state.chat.messages.write().await;
                let next_id = messages.last().map(|message| message.id + 1).unwrap_or(1);
                let message = ChatMessage {
                    id: next_id,
                    from: session
                        .claims
                        .name
                        .clone()
                        .unwrap_or_else(|| session.claims.sub.clone()),
                    author_id: session.claims.sub.clone(),
                    text: content,
                    created_at: "2024-01-20T00:00:00Z".to_string(),
                };
                messages.push(message.clone());
                let _ = state.chat.tx.send(message);
            }
            inbound = rx.recv() => {
                let Ok(message) = inbound else {
                    continue;
                };
                if socket.send(Message::Text(json!({ "type": "chat", "message": message }).to_string().into())).await.is_err() {
                    break;
                }
            }
        }
    }
}
