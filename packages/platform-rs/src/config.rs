use anyhow::{anyhow, Context};
use serde::Serialize;
use std::collections::HashSet;
use std::env;
use std::net::{SocketAddr, ToSocketAddrs};
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub environment: String,
    pub http_host: String,
    pub http_port: u16,
    pub webtransport_addr: SocketAddr,
    pub webtransport_cert_path: PathBuf,
    pub webtransport_key_path: PathBuf,
    pub webtransport_allowed_origins: HashSet<String>,
    pub webtransport_allow_any_origin: bool,
    pub enable_webtransport_fragments: bool,
    pub enable_webtransport_datagrams: bool,
    pub webtransport_max_datagram_size: usize,
    pub spacetime_uri: String,
    pub spacetime_module: String,
    pub garnet_host: String,
    pub garnet_port: u16,
    pub auth: Option<AuthConfig>,
    pub features: FeatureFlags,
}

#[derive(Clone, Debug)]
pub struct AuthConfig {
    pub cookie_secret: String,
    pub jwt_issuer: String,
    pub jwt_audience: String,
    pub jwks_uri: String,
    pub post_logout_redirect_uri: Option<String>,
    pub bootstrap_private_key: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct FeatureFlags {
    pub auth: bool,
    pub store: bool,
    pub messaging: bool,
    pub realtime: bool,
}

impl AppConfig {
    pub fn load() -> anyhow::Result<Self> {
        let environment = read_string("NODE_ENV", "development");
        let http_host = read_string("API_HOST", "0.0.0.0");
        let http_port = read_port("API_PORT", 4000)?;

        let wt_addr_raw = read_string("WEBTRANSPORT_LISTEN_ADDR", ":4444");
        let webtransport_addr = parse_socket_addr(&wt_addr_raw)
            .with_context(|| format!("invalid WEBTRANSPORT_LISTEN_ADDR: {wt_addr_raw}"))?;

        let webtransport_cert_path = PathBuf::from(read_string(
            "WEBTRANSPORT_CERT_PATH",
            "/etc/caddy/certs/prometheus.dev+prometheus.prod+db.prometheus.dev+db.prometheus.prod.pem",
        ));
        let webtransport_key_path = PathBuf::from(read_string(
            "WEBTRANSPORT_KEY_PATH",
            "/etc/caddy/certs/prometheus.dev+prometheus.prod+db.prometheus.dev+db.prometheus.prod.key",
        ));

        let webtransport_allowed_origins = read_list("WEBTRANSPORT_ALLOWED_ORIGINS")
            .into_iter()
            .collect::<HashSet<_>>();
        let webtransport_allow_any_origin = read_bool("WEBTRANSPORT_ALLOW_ANY_ORIGIN", false);
        let enable_webtransport_fragments =
            read_bool("ENABLE_WEBTRANSPORT_FRAGMENTS", environment != "production");
        let enable_webtransport_datagrams = read_bool("WEBTRANSPORT_ENABLE_DATAGRAMS", true);
        let webtransport_max_datagram_size = env::var("WEBTRANSPORT_MAX_DATAGRAM_SIZE")
            .ok()
            .and_then(|value| value.trim().parse::<usize>().ok())
            .filter(|value| *value > 0)
            .unwrap_or(1200);

        let spacetime_uri =
            normalize_url(&read_string("SPACETIMEDB_URI", "http://127.0.0.1:3000"))?;
        let spacetime_module = read_string("SPACETIMEDB_MODULE", "prometheus-site-local");
        let garnet_host = read_string("GARNET_HOST", read_string("VALKEY_HOST", "localhost"));
        let garnet_port = read_port_with_aliases(&["GARNET_PORT", "VALKEY_PORT"], 6379)?;

        let features = resolve_feature_flags();
        let auth = if features.auth {
            Some(AuthConfig {
                cookie_secret: read_string(
                    "BETTER_AUTH_COOKIE_SECRET",
                    "dev-cookie-secret-please-change-32",
                ),
                jwt_issuer: read_string_with_aliases(
                    &["AUTH_JWT_ISSUER", "OIDC_AUTHORITY", "SPACETIMEAUTH_AUTHORITY"],
                    "urn:prometheus:better-auth",
                ),
                jwt_audience: read_string_with_aliases(
                    &["AUTH_JWT_AUDIENCE", "OIDC_CLIENT_ID", "SPACETIMEAUTH_CLIENT_ID"],
                    "prometheus-site",
                ),
                jwks_uri: normalize_url(&read_string_with_aliases(
                    &["AUTH_JWKS_URI", "OIDC_JWKS_URI", "SPACETIMEAUTH_JWKS_URI"],
                    "http://127.0.0.1:3211/api/auth/jwks",
                ))?,
                post_logout_redirect_uri: read_optional_string(&[
                    "AUTH_POST_LOGOUT_REDIRECT_URI",
                    "OIDC_POST_LOGOUT_REDIRECT_URI",
                    "SPACETIMEAUTH_POST_LOGOUT_REDIRECT_URI",
                ]),
                bootstrap_private_key: read_optional_string(&["AUTH_BOOTSTRAP_PRIVATE_KEY"]),
            })
        } else {
            None
        };

        Ok(Self {
            environment,
            http_host,
            http_port,
            webtransport_addr,
            webtransport_cert_path,
            webtransport_key_path,
            webtransport_allowed_origins,
            webtransport_allow_any_origin,
            enable_webtransport_fragments,
            enable_webtransport_datagrams,
            webtransport_max_datagram_size,
            spacetime_uri,
            spacetime_module,
            garnet_host,
            garnet_port,
            auth,
            features,
        })
    }
}

fn resolve_feature_flags() -> FeatureFlags {
    let preset = read_string("PROMETHEUS_TEMPLATE_PRESET", "full").to_lowercase();
    let mut enabled = HashSet::new();
    match preset.as_str() {
        "core" => {
            enabled.insert("auth");
        }
        _ => {
            enabled.insert("auth");
            enabled.insert("store");
            enabled.insert("messaging");
            enabled.insert("realtime");
        }
    }

    for value in read_list("PROMETHEUS_TEMPLATE_FEATURES") {
        enabled.insert(Box::leak(value.into_boxed_str()));
    }

    for value in read_list("PROMETHEUS_TEMPLATE_DISABLE_FEATURES") {
        enabled.remove(value.as_str());
    }

    FeatureFlags {
        auth: enabled.contains("auth"),
        store: enabled.contains("store"),
        messaging: enabled.contains("messaging"),
        realtime: enabled.contains("realtime"),
    }
}

fn parse_socket_addr(value: &str) -> anyhow::Result<SocketAddr> {
    if value.starts_with(':') {
        let port = value
            .trim_start_matches(':')
            .parse::<u16>()
            .with_context(|| format!("invalid port in {value}"))?;
        return Ok(SocketAddr::from(([0, 0, 0, 0], port)));
    }

    value
        .to_socket_addrs()
        .context("failed to resolve socket address")?
        .next()
        .ok_or_else(|| anyhow!("no socket addresses resolved"))
}

fn normalize_url(value: &str) -> anyhow::Result<String> {
    let parsed = url::Url::parse(value).with_context(|| format!("invalid URL: {value}"))?;
    Ok(parsed.to_string())
}

fn read_string(key: &str, default: impl Into<String>) -> String {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| default.into())
}

fn read_string_with_aliases(keys: &[&str], default: impl Into<String>) -> String {
    for key in keys {
        if let Ok(value) = env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    default.into()
}

fn read_optional_string(keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Ok(value) = env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }

    None
}

fn read_bool(key: &str, default: bool) -> bool {
    env::var(key)
        .ok()
        .map(|value| {
            let normalized = value.trim().to_ascii_lowercase();
            matches!(normalized.as_str(), "1" | "true" | "yes" | "on")
        })
        .unwrap_or(default)
}

fn read_port(key: &str, default: u16) -> anyhow::Result<u16> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(|value| {
            value
                .parse::<u16>()
                .with_context(|| format!("{key} must be a valid port"))
        })
        .unwrap_or(Ok(default))
}

fn read_port_with_aliases(keys: &[&str], default: u16) -> anyhow::Result<u16> {
    for key in keys {
        if let Ok(value) = env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed
                    .parse::<u16>()
                    .with_context(|| format!("{key} must be a valid port"));
            }
        }
    }
    Ok(default)
}

fn read_list(key: &str) -> Vec<String> {
    env::var(key)
        .ok()
        .map(|value| {
            value
                .split([',', '\n'])
                .map(|entry| entry.trim().to_string())
                .filter(|entry| !entry.is_empty())
                .collect()
        })
        .unwrap_or_default()
}
