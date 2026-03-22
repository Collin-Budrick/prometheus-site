use std::collections::{HashMap, HashSet};
use std::time::Duration;

use anyhow::Context;
use base64::Engine as _;
use tokio::io::AsyncWriteExt;
use wtransport::endpoint::IncomingSession;
use wtransport::{Connection, Endpoint, Identity, ServerConfig};

use crate::config::AppConfig;
use crate::fragments::{build_fragment_bundle, build_fragment_frame, FragmentPlanResponse};
use crate::shared::AppState;

const HEARTBEAT_MS: u64 = 5_000;

#[derive(Debug)]
struct TransportRequest {
    path: String,
    lang: String,
    protocol: u8,
    known: HashMap<String, u64>,
    ids: Vec<String>,
    live: bool,
}

pub async fn run_webtransport_server(config: AppConfig, state: AppState) -> anyhow::Result<()> {
    let identity = Identity::load_pemfiles(
        &config.webtransport_cert_path,
        &config.webtransport_key_path,
    )
    .await
    .context("failed to load WebTransport TLS identity")?;

    let server_config = ServerConfig::builder()
        .with_bind_default(config.webtransport_addr.port())
        .with_identity(identity)
        .build();

    let server =
        Endpoint::server(server_config).context("failed to start WebTransport endpoint")?;
    tracing::info!(
        "webtransport listening on udp:{}",
        config.webtransport_addr.port()
    );

    loop {
        let incoming = server.accept().await;
        let state = state.clone();
        let config = config.clone();
        tokio::spawn(async move {
            if let Err(error) = handle_session(incoming, state, config).await {
                tracing::warn!("webtransport session failed: {error:#}");
            }
        });
    }
}

async fn handle_session(
    incoming: IncomingSession,
    state: AppState,
    config: AppConfig,
) -> anyhow::Result<()> {
    let session_request = incoming.await?;

    if !is_origin_allowed(session_request.origin(), &config) {
        session_request.forbidden().await;
        return Ok(());
    }

    let request = match parse_transport_request(session_request.path()) {
        Some(request) => request,
        None => {
            tracing::debug!(
                "ignoring unsupported webtransport path: {}",
                session_request.path()
            );
            session_request.not_found().await;
            return Ok(());
        }
    };

    let connection = session_request.accept().await?;
    serve_transport(connection, state, config, request).await
}

async fn serve_transport(
    connection: Connection,
    state: AppState,
    config: AppConfig,
    request: TransportRequest,
) -> anyhow::Result<()> {
    let plan = state
        .fragments
        .get_fragment_plan(&request.path, &request.lang)
        .await;
    let groups = build_stream_groups(&plan, &request.ids);
    let (mut send, _recv) = connection.open_bi().await?.await?;

    for group in groups {
        let payload = build_fragment_bundle(
            &state,
            &group,
            &request.lang,
            request.protocol,
            &request.known,
            &plan,
            false,
        )
        .await;

        if payload.is_empty() {
            continue;
        }

        if config.enable_webtransport_datagrams
            && payload.len() <= config.webtransport_max_datagram_size
        {
            if connection.send_datagram(payload.clone()).is_ok() {
                continue;
            }
        }

        send.write_all(&payload).await?;
    }

    if request.live && request.protocol == 2 {
        let heartbeat = build_fragment_frame("", &[]);
        let use_datagrams = config.enable_webtransport_datagrams
            && heartbeat.len() <= config.webtransport_max_datagram_size;
        let mut interval = tokio::time::interval(Duration::from_millis(HEARTBEAT_MS));
        loop {
            interval.tick().await;
            if use_datagrams {
                if connection.send_datagram(heartbeat.clone()).is_err() {
                    break;
                }
            } else if send.write_all(&heartbeat).await.is_err() {
                break;
            }
        }
    }

    let _ = send.shutdown().await;
    Ok(())
}

fn is_origin_allowed(origin: Option<&str>, config: &AppConfig) -> bool {
    if config.webtransport_allow_any_origin || config.webtransport_allowed_origins.is_empty() {
        return true;
    }

    let Some(origin) = origin else {
        return false;
    };
    config.webtransport_allowed_origins.contains(origin)
}

fn parse_transport_request(raw_path: &str) -> Option<TransportRequest> {
    let parsed = url::Url::parse(&format!("https://transport.local{raw_path}")).ok()?;
    let route = parsed.path();
    if route != "/fragments/transport" && route != "/api/fragments/transport" {
        return None;
    }

    let query = parsed.query_pairs().into_owned().collect::<HashMap<_, _>>();
    Some(TransportRequest {
        path: normalize_plan_path(query.get("path").map(String::as_str).unwrap_or("/")),
        lang: normalize_lang(query.get("lang").map(String::as_str).unwrap_or("en")),
        protocol: parse_protocol(query.get("protocol").map(String::as_str)),
        known: decode_known_versions(query.get("known").map(String::as_str)),
        ids: parse_ids(query.get("ids").map(String::as_str)),
        live: query
            .get("live")
            .map(|value| parse_truthy(Some(value)))
            .unwrap_or(true),
    })
}

fn build_stream_groups(plan: &FragmentPlanResponse, explicit_ids: &[String]) -> Vec<Vec<String>> {
    if !explicit_ids.is_empty() {
        return vec![resolve_requested_plan_fragment_ids(plan, explicit_ids)];
    }

    plan.fetch_groups.clone().unwrap_or_else(|| {
        vec![plan
            .fragments
            .iter()
            .map(|entry| entry.id.clone())
            .collect()]
    })
}

fn resolve_requested_plan_fragment_ids(
    plan: &FragmentPlanResponse,
    explicit_ids: &[String],
) -> Vec<String> {
    let entry_map = plan
        .fragments
        .iter()
        .map(|entry| (entry.id.clone(), entry.clone()))
        .collect::<HashMap<_, _>>();

    let mut required = HashSet::new();
    let mut stack = explicit_ids.to_vec();
    while let Some(id) = stack.pop() {
        if !required.insert(id.clone()) {
            continue;
        }
        if let Some(entry) = entry_map.get(&id) {
            if let Some(deps) = &entry.depends_on {
                stack.extend(deps.clone());
            }
        }
    }

    plan.fragments
        .iter()
        .map(|entry| entry.id.clone())
        .filter(|id| required.contains(id))
        .collect()
}

fn parse_protocol(value: Option<&str>) -> u8 {
    match value.unwrap_or("1").trim() {
        "2" => 2,
        _ => 1,
    }
}

fn normalize_plan_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed == "/" {
        return "/".to_string();
    }

    let stripped = trimmed.trim_end_matches('/');
    if stripped.is_empty() {
        "/".to_string()
    } else {
        stripped.to_string()
    }
}

fn normalize_lang(lang: &str) -> String {
    match lang.trim().to_ascii_lowercase().as_str() {
        "ja" => "ja".to_string(),
        "ko" => "ko".to_string(),
        _ => "en".to_string(),
    }
}

fn parse_truthy(value: Option<&str>) -> bool {
    matches!(
        value
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "1" | "true" | "yes" | "on"
    )
}

fn parse_ids(value: Option<&str>) -> Vec<String> {
    value
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn decode_known_versions(value: Option<&str>) -> HashMap<String, u64> {
    let Some(value) = value.filter(|value| !value.trim().is_empty()) else {
        return HashMap::new();
    };

    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(value.as_bytes())
        .ok()
        .and_then(|bytes| serde_json::from_slice::<HashMap<String, u64>>(&bytes).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::parse_transport_request;

    #[test]
    fn parses_transport_query_contract() {
        let request = parse_transport_request(
            "/fragments/transport?path=%2Fstore&lang=ja&protocol=2&ids=alpha,beta&live=0",
        )
        .expect("request should parse");

        assert_eq!(request.path, "/store");
        assert_eq!(request.lang, "ja");
        assert_eq!(request.protocol, 2);
        assert_eq!(request.ids, vec!["alpha".to_string(), "beta".to_string()]);
        assert!(!request.live);
    }

    #[test]
    fn rejects_non_transport_routes() {
        assert!(parse_transport_request("/nope").is_none());
    }
}
