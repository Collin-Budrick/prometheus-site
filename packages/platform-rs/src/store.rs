use std::cmp::Reverse;
use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use axum::routing::{delete, get, post};
use axum::Json;
use axum::Router;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::RwLock;

use crate::auth::{is_admin, resolve_auth_session, AuthSession};
use crate::shared::AppState;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StoreItem {
    pub id: u64,
    pub name: String,
    pub price: f64,
    pub quantity: i64,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(default)]
    pub digital: bool,
}

#[derive(Clone)]
pub struct StoreState {
    items: Arc<RwLock<Vec<StoreItem>>>,
}

#[derive(Debug, Deserialize)]
struct StoreItemsQuery {
    limit: Option<usize>,
    cursor: Option<String>,
    sort: Option<String>,
    dir: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StoreSearchQuery {
    q: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct CreateItemBody {
    name: String,
    price: f64,
    quantity: Option<i64>,
    #[serde(default)]
    digital: bool,
}

#[derive(Debug, Deserialize)]
struct RestoreItemBody {
    amount: Option<i64>,
}

impl StoreState {
    pub fn new() -> Self {
        let items = (1..=15)
            .map(|index| StoreItem {
                id: index,
                name: format!("Item {index}"),
                price: ((index as f64) * 3.0 * 100.0).round() / 100.0,
                quantity: index as i64,
                created_at: format!("2024-01-{index:02}T00:00:00.000Z"),
                digital: false,
            })
            .collect();
        Self {
            items: Arc::new(RwLock::new(items)),
        }
    }
}

fn has_store_admin_access(session: &AuthSession) -> bool {
    session.claims.roles.is_empty() || is_admin(session)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/items", get(list_items).post(create_item))
        .route("/search", get(search_items))
        .route("/items/{id}", delete(delete_item))
        .route("/items/{id}/consume", post(consume_item))
        .route("/items/{id}/restore", post(restore_item))
}

async fn list_items(
    State(state): State<AppState>,
    Query(query): Query<StoreItemsQuery>,
) -> impl IntoResponse {
    let limit = query.limit.unwrap_or(10);
    if limit == 0 || limit > 50 {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Invalid cursor or limit" })),
        )
            .into_response();
    }

    let offset = query
        .cursor
        .as_deref()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    let sort = query.sort.as_deref().unwrap_or("created");
    let descending = query
        .dir
        .as_deref()
        .map(|value| value.eq_ignore_ascii_case("desc"))
        .unwrap_or(true);

    let mut items = state.store.items.read().await.clone();
    match sort {
        "price" => {
            if descending {
                items.sort_by(|left, right| right.price.total_cmp(&left.price));
            } else {
                items.sort_by(|left, right| left.price.total_cmp(&right.price));
            }
        }
        "name" => {
            if descending {
                items.sort_by_key(|item| Reverse(item.name.to_ascii_lowercase()));
            } else {
                items.sort_by_key(|item| item.name.to_ascii_lowercase());
            }
        }
        _ => {
            if descending {
                items.sort_by_key(|item| Reverse(item.id));
            } else {
                items.sort_by_key(|item| item.id);
            }
        }
    }

    let page = items
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect::<Vec<_>>();
    let next_cursor = if page.len() == limit {
        Some((offset + limit).to_string())
    } else {
        None
    };

    Json(json!({
        "items": page,
        "cursor": next_cursor.as_deref().and_then(|value| value.parse::<usize>().ok())
    }))
    .into_response()
}

async fn search_items(
    State(state): State<AppState>,
    Query(query): Query<StoreSearchQuery>,
) -> impl IntoResponse {
    let limit = query.limit.unwrap_or(12).min(50);
    let offset = query.offset.unwrap_or(0);
    let needle = query.q.unwrap_or_default().trim().to_ascii_lowercase();

    let items = state.store.items.read().await.clone();
    let filtered = items
        .into_iter()
        .filter(|item| {
            if needle.is_empty() {
                return true;
            }
            item.name.to_ascii_lowercase().contains(&needle)
                || item.id.to_string().contains(&needle)
        })
        .collect::<Vec<_>>();

    let total = filtered.len();
    let items = filtered
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect::<Vec<_>>();

    Json(json!({
        "items": items,
        "total": total,
        "query": needle,
        "limit": limit,
        "offset": offset,
    }))
    .into_response()
}

async fn create_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateItemBody>,
) -> impl IntoResponse {
    let Some(session) = resolve_auth_session(&headers, &state) else {
        return (
            axum::http::StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Authentication required" })),
        )
            .into_response();
    };
    if !has_store_admin_access(&session) {
        return (
            axum::http::StatusCode::FORBIDDEN,
            Json(json!({ "error": "Admin access required" })),
        )
            .into_response();
    }

    let name = body.name.trim();
    if name.len() < 2 {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Invalid store item payload" })),
        )
            .into_response();
    }

    let mut items = state.store.items.write().await;
    let id = items.iter().map(|item| item.id).max().unwrap_or(0) + 1;
    let quantity = body.quantity.unwrap_or(1);
    let item = StoreItem {
        id,
        name: name.to_string(),
        price: body.price.max(0.0),
        quantity: if quantity < 0 { -1 } else { quantity },
        created_at: "2024-01-20T00:00:00.000Z".to_string(),
        digital: body.digital,
    };
    items.push(item.clone());

    (
        axum::http::StatusCode::CREATED,
        Json(json!({ "item": item })),
    )
        .into_response()
}

async fn delete_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<u64>,
) -> impl IntoResponse {
    let Some(session) = resolve_auth_session(&headers, &state) else {
        return (
            axum::http::StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Authentication required" })),
        )
            .into_response();
    };
    if !has_store_admin_access(&session) {
        return (
            axum::http::StatusCode::FORBIDDEN,
            Json(json!({ "error": "Admin access required" })),
        )
            .into_response();
    }

    let mut items = state.store.items.write().await;
    let before = items.len();
    items.retain(|item| item.id != id);
    if items.len() == before {
        return (
            axum::http::StatusCode::NOT_FOUND,
            Json(json!({ "error": "item not found" })),
        )
            .into_response();
    }

    Json(json!({ "deleted": true, "id": id })).into_response()
}

async fn consume_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<u64>,
) -> impl IntoResponse {
    mutate_quantity(state, headers, id, None).await
}

async fn restore_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<u64>,
    body: Bytes,
) -> impl IntoResponse {
    let amount = if body.is_empty() {
        1
    } else {
        match serde_json::from_slice::<RestoreItemBody>(&body) {
            Ok(payload) => payload.amount.unwrap_or(1),
            Err(_) => {
                return (
                    axum::http::StatusCode::BAD_REQUEST,
                    Json(json!({ "error": "Invalid restore amount" })),
                )
                    .into_response();
            }
        }
    };

    if !(1..=100_000).contains(&amount) {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Invalid restore amount" })),
        )
            .into_response();
    }

    mutate_quantity(state, headers, id, Some(amount)).await
}

async fn mutate_quantity(
    state: AppState,
    headers: HeaderMap,
    id: u64,
    restore_amount: Option<i64>,
) -> axum::response::Response {
    if resolve_auth_session(&headers, &state).is_none() {
        return (
            axum::http::StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Authentication required" })),
        )
            .into_response();
    }

    let mut items = state.store.items.write().await;
    let Some(item) = items.iter_mut().find(|item| item.id == id) else {
        return (
            axum::http::StatusCode::NOT_FOUND,
            Json(json!({ "error": "item not found" })),
        )
            .into_response();
    };

    if restore_amount.is_none() {
        if item.quantity < 0 {
            return Json(json!({ "item": item.clone() })).into_response();
        }
        if item.quantity == 0 {
            return (
                axum::http::StatusCode::CONFLICT,
                Json(json!({ "error": "Out of stock" })),
            )
                .into_response();
        }
        item.quantity -= 1;
    } else {
        if item.quantity < 0 {
            return Json(json!({ "item": item.clone() })).into_response();
        }
        item.quantity = item.quantity.saturating_add(restore_amount.unwrap_or(1));
    }

    Json(json!({ "item": item })).into_response()
}
