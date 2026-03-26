use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::extract::{Json, State};
use axum::http::header::{AUTHORIZATION, COOKIE, SET_COOKIE};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{
    decode, decode_header, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::shared::AppState;

pub const SESSION_COOKIE_NAME: &str = "session";
const SESSION_ISSUER: &str = "urn:prometheus:site-session";
const DEFAULT_SESSION_TTL_SECS: u64 = 60 * 60;
const DEFAULT_BOOTSTRAP_TTL_SECS: u64 = 60 * 60 * 24 * 30;
const ADMIN_ROLE: &str = "admin";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionClaims {
    pub sub: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub picture: Option<String>,
    pub preferred_username: Option<String>,
    #[serde(default)]
    pub roles: Vec<String>,
    pub login_method: Option<String>,
    pub provider_id: Option<String>,
    pub sid: Option<String>,
    pub id_token: Option<String>,
    pub iss: String,
    pub aud: String,
    pub exp: usize,
    pub iat: usize,
}

#[derive(Debug, Deserialize)]
struct SessionSyncBody {
    #[serde(rename = "idToken")]
    id_token: String,
}

#[derive(Debug, Deserialize)]
struct ProfileNameBody {
    name: String,
}

#[derive(Debug, Deserialize)]
struct DevSessionBody {
    #[serde(rename = "loginMethod")]
    login_method: Option<String>,
    #[serde(rename = "providerId")]
    provider_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DevLocalAccountBody {
    name: Option<String>,
    email: String,
    password: String,
}

#[derive(Clone, Debug)]
struct DevLocalAccount {
    user_id: String,
    email: String,
    name: String,
    preferred_username: String,
    password_hash: String,
}

#[derive(Debug, Default)]
pub struct DevAuthState {
    accounts: RwLock<HashMap<String, DevLocalAccount>>,
}

impl DevAuthState {
    pub fn new() -> Self {
        Self {
            accounts: RwLock::new(HashMap::new()),
        }
    }

    async fn register_local_account(
        &self,
        name: &str,
        email: &str,
        password: &str,
    ) -> Result<DevLocalAccount, (StatusCode, &'static str)> {
        let normalized_name = validate_profile_name(name)?;
        let normalized_email = normalize_local_account_email(email)
            .ok_or((StatusCode::BAD_REQUEST, "Enter a valid email address."))?;
        let normalized_password = validate_local_account_password(password)?;
        let mut accounts = self.accounts.write().await;

        if accounts.contains_key(&normalized_email) {
            return Err((
                StatusCode::CONFLICT,
                "An account with that email already exists.",
            ));
        }

        let account = DevLocalAccount {
            user_id: format!("dev-local-{}", Uuid::new_v4()),
            email: normalized_email.clone(),
            name: normalized_name.clone(),
            preferred_username: build_local_account_username(
                normalized_name.as_str(),
                normalized_email.as_str(),
            ),
            password_hash: hash_local_account_password(normalized_password.as_str()),
        };

        accounts.insert(normalized_email, account.clone());
        Ok(account)
    }

    async fn authenticate_local_account(
        &self,
        email: &str,
        password: &str,
    ) -> Result<DevLocalAccount, (StatusCode, &'static str)> {
        let normalized_email = normalize_local_account_email(email)
            .ok_or((StatusCode::BAD_REQUEST, "Enter a valid email address."))?;
        let normalized_password = validate_local_account_password(password)?;
        let accounts = self.accounts.read().await;
        let Some(account) = accounts.get(&normalized_email) else {
            return Err((StatusCode::UNAUTHORIZED, "Invalid email or password."));
        };

        if account.password_hash != hash_local_account_password(normalized_password.as_str()) {
            return Err((StatusCode::UNAUTHORIZED, "Invalid email or password."));
        }

        Ok(account.clone())
    }

    async fn rename_local_account(&self, user_id: &str, name: &str) -> bool {
        let Ok(normalized_name) = validate_profile_name(name) else {
            return false;
        };

        let mut accounts = self.accounts.write().await;
        for account in accounts.values_mut() {
            if account.user_id == user_id {
                account.name = normalized_name;
                return true;
            }
        }

        false
    }
}

#[derive(Debug, Serialize)]
struct SessionUserPayload {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    roles: Option<Vec<String>>,
    #[serde(rename = "loginMethod", skip_serializing_if = "Option::is_none")]
    login_method: Option<String>,
    #[serde(rename = "providerId", skip_serializing_if = "Option::is_none")]
    provider_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct SessionMetadataPayload {
    #[serde(rename = "userId")]
    user_id: String,
    #[serde(rename = "expiresAt", skip_serializing_if = "Option::is_none")]
    expires_at: Option<String>,
}

#[derive(Debug, Serialize)]
struct SessionEnvelope {
    user: Option<SessionUserPayload>,
    session: Option<SessionMetadataPayload>,
}

#[derive(Clone, Debug)]
pub struct AuthSession {
    pub claims: SessionClaims,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/dev/register", post(register_dev_local_account))
        .route("/dev/login", post(login_dev_local_account))
        .route("/dev/session", post(issue_dev_session))
        .route("/session/sync", post(sync_session))
        .route("/session", get(get_session))
        .route("/logout", post(logout))
        .route("/sign-out", post(logout))
        .route("/profile/name", post(update_profile_name))
        .route("/bootstrap", post(issue_bootstrap_token))
}

pub fn resolve_auth_session(headers: &HeaderMap, state: &AppState) -> Option<AuthSession> {
    read_site_session_claims(headers, state)
        .or_else(|| read_bearer_claims(headers, state))
        .map(|claims| AuthSession { claims })
}

pub fn is_admin(session: &AuthSession) -> bool {
    session
        .claims
        .roles
        .iter()
        .any(|role| role.eq_ignore_ascii_case(ADMIN_ROLE))
}

pub fn build_session_payload(claims: &SessionClaims) -> Value {
    serde_json::to_value(SessionEnvelope {
        user: Some(build_session_user(claims)),
        session: Some(SessionMetadataPayload {
            user_id: claims.sub.clone(),
            expires_at: iso_from_epoch(claims.exp),
        }),
    })
    .unwrap_or_else(|_| json!({ "user": null, "session": null }))
}

pub fn build_anonymous_payload() -> Value {
    serde_json::to_value(SessionEnvelope {
        user: None,
        session: None,
    })
    .unwrap_or_else(|_| json!({ "user": null, "session": null }))
}

fn build_session_user(claims: &SessionClaims) -> SessionUserPayload {
    let name = resolve_display_name(claims);
    SessionUserPayload {
        id: claims.sub.clone(),
        name,
        email: claims.email.clone(),
        image: claims.picture.clone(),
        roles: (!claims.roles.is_empty()).then_some(claims.roles.clone()),
        login_method: claims.login_method.clone(),
        provider_id: claims.provider_id.clone(),
    }
}

fn resolve_display_name(claims: &SessionClaims) -> Option<String> {
    normalize_optional_string(claims.name.as_deref())
        .or_else(|| normalize_optional_string(claims.preferred_username.as_deref()))
        .or_else(|| {
            claims.email.as_deref().and_then(|email| {
                let trimmed = email.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.split('@').next().unwrap_or(trimmed).to_string())
                }
            })
        })
        .or_else(|| {
            Some(format!(
                "User {}",
                claims.sub.chars().take(8).collect::<String>()
            ))
        })
}

fn normalize_optional_string(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn normalize_roles(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn now_epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_secs()
}

fn iso_from_epoch(epoch: usize) -> Option<String> {
    let millis = (epoch as u64).checked_mul(1000)?;
    let date = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(millis as i64)?;
    Some(date.to_rfc3339())
}

fn build_cookie_value(claims: &SessionClaims, state: &AppState) -> Result<String, StatusCode> {
    let secret = state
        .config
        .auth
        .as_ref()
        .map(|config| config.cookie_secret.as_bytes())
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    encode(
        &Header::new(Algorithm::HS256),
        claims,
        &EncodingKey::from_secret(secret),
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn request_is_secure(headers: &HeaderMap, state: &AppState) -> bool {
    if state.config.environment.eq_ignore_ascii_case("production") {
        return true;
    }

    headers
        .get("x-forwarded-proto")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.eq_ignore_ascii_case("https"))
        .unwrap_or(false)
}

fn build_session_cookie(
    claims: &SessionClaims,
    headers: &HeaderMap,
    state: &AppState,
) -> Result<String, StatusCode> {
    let token = build_cookie_value(claims, state)?;
    let max_age = claims.exp.saturating_sub(now_epoch_secs() as usize);
    let secure = if request_is_secure(headers, state) {
        "; Secure"
    } else {
        ""
    };
    Ok(format!(
        "{name}={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}{secure}",
        name = SESSION_COOKIE_NAME,
        value = token
    ))
}

fn clear_session_cookie(headers: &HeaderMap, state: &AppState) -> String {
    let secure = if request_is_secure(headers, state) {
        "; Secure"
    } else {
        ""
    };
    format!(
        "{name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{secure}",
        name = SESSION_COOKIE_NAME
    )
}

fn parse_cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    let cookie_header = headers.get(COOKIE)?.to_str().ok()?;
    cookie_header
        .split(';')
        .filter_map(|entry| {
            let mut parts = entry.trim().splitn(2, '=');
            let key = parts.next()?.trim();
            let value = parts.next()?.trim();
            Some((key, value))
        })
        .find_map(|(key, value)| (key == name).then(|| value.to_string()))
}

fn decode_session_token(token: &str, state: &AppState) -> Option<SessionClaims> {
    let auth = state.config.auth.as_ref()?;
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    validation.set_issuer(&[SESSION_ISSUER]);
    validation.set_audience(&[auth.spacetimeauth_client_id.clone()]);

    decode::<SessionClaims>(
        token,
        &DecodingKey::from_secret(auth.cookie_secret.as_bytes()),
        &validation,
    )
    .ok()
    .map(|data| data.claims)
}

pub fn read_site_session_claims(headers: &HeaderMap, state: &AppState) -> Option<SessionClaims> {
    let token = parse_cookie_value(headers, SESSION_COOKIE_NAME)?;
    decode_session_token(&token, state)
}

fn parse_jwt_payload(token: &str) -> Option<HashMap<String, Value>> {
    let payload = token.split('.').nth(1)?;
    let decoded = URL_SAFE_NO_PAD.decode(payload.as_bytes()).ok()?;
    serde_json::from_slice::<HashMap<String, Value>>(&decoded).ok()
}

fn claims_from_payload(
    payload: HashMap<String, Value>,
    state: &AppState,
    id_token: Option<String>,
) -> SessionClaims {
    let now = now_epoch_secs();
    let sub = payload
        .get("sub")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or("starter-user")
        .to_string();

    SessionClaims {
        sub,
        email: payload
            .get("email")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        name: payload
            .get("name")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        picture: payload
            .get("picture")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        preferred_username: payload
            .get("preferred_username")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        roles: normalize_roles(payload.get("roles")),
        login_method: payload
            .get("login_method")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        provider_id: payload
            .get("provider_id")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        sid: payload
            .get("sid")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        id_token,
        iss: SESSION_ISSUER.to_string(),
        aud: state
            .config
            .auth
            .as_ref()
            .map(|config| config.spacetimeauth_client_id.clone())
            .unwrap_or_else(|| "prometheus-site-dev".to_string()),
        exp: payload
            .get("exp")
            .and_then(Value::as_u64)
            .unwrap_or(now + DEFAULT_SESSION_TTL_SECS) as usize,
        iat: payload.get("iat").and_then(Value::as_u64).unwrap_or(now) as usize,
    }
}

fn claims_from_unverified_token(token: String, state: &AppState) -> SessionClaims {
    claims_from_payload(
        parse_jwt_payload(&token).unwrap_or_default(),
        state,
        Some(token),
    )
}

fn normalize_dev_identity_segment(value: &str) -> String {
    let mut normalized = String::new();
    let mut previous_dash = false;
    for character in value.chars() {
        let next = if character.is_ascii_alphanumeric() {
            character.to_ascii_lowercase()
        } else {
            '-'
        };
        if next == '-' {
            if previous_dash {
                continue;
            }
            previous_dash = true;
        } else {
            previous_dash = false;
        }
        normalized.push(next);
    }

    normalized.trim_matches('-').to_string()
}

fn normalize_local_account_email(value: &str) -> Option<String> {
    let normalized = value.trim().to_ascii_lowercase();
    let mut parts = normalized.split('@');
    let local = parts.next()?.trim();
    let domain = parts.next()?.trim();
    if local.is_empty() || domain.is_empty() || parts.next().is_some() {
        return None;
    }
    Some(normalized)
}

fn validate_local_account_password(value: &str) -> Result<String, (StatusCode, &'static str)> {
    let normalized = value.trim().to_string();
    if normalized.len() < 8 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Password must be at least 8 characters.",
        ));
    }
    if normalized.len() > 128 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Password must be 128 characters or less.",
        ));
    }
    Ok(normalized)
}

fn validate_profile_name(value: &str) -> Result<String, (StatusCode, &'static str)> {
    let trimmed = value.trim();
    if trimmed.len() < 2 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Name must be at least 2 characters.",
        ));
    }
    if trimmed.len() > 64 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Name must be 64 characters or less.",
        ));
    }
    Ok(trimmed.to_string())
}

fn build_local_account_username(name: &str, email: &str) -> String {
    let local_part = email.split('@').next().unwrap_or(email);
    let normalized_name = normalize_dev_identity_segment(name);
    let normalized_email = normalize_dev_identity_segment(local_part);
    let candidate = if normalized_name.is_empty() {
        normalized_email
    } else {
        normalized_name
    };
    if candidate.is_empty() {
        "local-user".to_string()
    } else {
        candidate
    }
}

fn hash_local_account_password(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    URL_SAFE_NO_PAD.encode(hasher.finalize())
}

fn build_dev_session_claims(body: &DevSessionBody, state: &AppState) -> SessionClaims {
    let now = now_epoch_secs();
    let login_method = normalize_optional_string(body.login_method.as_deref())
        .unwrap_or_else(|| "magic-link".to_string());
    let provider_id = normalize_optional_string(body.provider_id.as_deref());
    let identity_source = provider_id
        .as_deref()
        .unwrap_or(login_method.as_str());
    let slug = normalize_dev_identity_segment(identity_source);
    let normalized_slug = if slug.is_empty() {
        "local".to_string()
    } else {
        slug
    };
    let provider_label = match provider_id.as_deref() {
        Some("google") => "Google",
        Some("github") => "GitHub",
        _ => "Magic Link",
    };

    SessionClaims {
        sub: format!("dev-{}", normalized_slug),
        email: Some(format!("{}@dev.prometheus.local", normalized_slug)),
        name: Some(format!("{provider_label} Demo User")),
        picture: None,
        preferred_username: Some(format!("{}-dev", normalized_slug)),
        roles: vec![],
        login_method: Some(login_method),
        provider_id,
        sid: None,
        id_token: None,
        iss: SESSION_ISSUER.to_string(),
        aud: state
            .config
            .auth
            .as_ref()
            .map(|config| config.spacetimeauth_client_id.clone())
            .unwrap_or_else(|| "prometheus-site-dev".to_string()),
        exp: (now + DEFAULT_SESSION_TTL_SECS) as usize,
        iat: now as usize,
    }
}

fn build_local_account_claims(account: &DevLocalAccount, state: &AppState) -> SessionClaims {
    let now = now_epoch_secs();

    SessionClaims {
        sub: account.user_id.clone(),
        email: Some(account.email.clone()),
        name: Some(account.name.clone()),
        picture: None,
        preferred_username: Some(account.preferred_username.clone()),
        roles: vec![],
        login_method: Some("password".to_string()),
        provider_id: Some("local".to_string()),
        sid: None,
        id_token: None,
        iss: SESSION_ISSUER.to_string(),
        aud: state
            .config
            .auth
            .as_ref()
            .map(|config| config.spacetimeauth_client_id.clone())
            .unwrap_or_else(|| "prometheus-site-dev".to_string()),
        exp: (now + DEFAULT_SESSION_TTL_SECS) as usize,
        iat: now as usize,
    }
}

fn build_session_response(claims: &SessionClaims, headers: &HeaderMap, state: &AppState) -> Response {
    let cookie = match build_session_cookie(claims, headers, state) {
        Ok(cookie) => cookie,
        Err(status) => {
            return (
                status,
                Json(json!({ "error": "session signing unavailable" })),
            )
                .into_response()
        }
    };

    let mut response = Json(build_session_payload(claims)).into_response();
    if let Ok(value) = cookie.parse() {
        response.headers_mut().append(SET_COOKIE, value);
    }
    response
}

pub fn read_bearer_claims(headers: &HeaderMap, state: &AppState) -> Option<SessionClaims> {
    let header = headers.get(AUTHORIZATION)?.to_str().ok()?.trim();
    let token = header.strip_prefix("Bearer ")?.trim();
    if token.is_empty() {
        return None;
    }
    Some(claims_from_unverified_token(token.to_string(), state))
}

async fn verify_id_token(id_token: &str, state: &AppState) -> Result<SessionClaims, String> {
    let auth = state
        .config
        .auth
        .as_ref()
        .ok_or_else(|| "Unable to verify ID token.".to_string())?;
    let header = decode_header(id_token).map_err(|_| "Unable to verify ID token.".to_string())?;

    let jwks = state
        .http
        .get(&auth.spacetimeauth_jwks_uri)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<JwkSet>()
        .await
        .map_err(|error| error.to_string())?;

    let jwk = header
        .kid
        .as_deref()
        .and_then(|kid| jwks.find(kid))
        .or_else(|| jwks.keys.iter().find(|candidate| candidate.is_supported()))
        .ok_or_else(|| "Unable to verify ID token.".to_string())?;

    let decoding_key =
        DecodingKey::from_jwk(jwk).map_err(|_| "Unable to verify ID token.".to_string())?;
    let mut validation = Validation::new(header.alg);
    validation.validate_exp = true;
    validation.set_issuer(&[auth.spacetimeauth_authority.clone()]);
    validation.set_audience(&[auth.spacetimeauth_client_id.clone()]);

    let payload = decode::<HashMap<String, Value>>(id_token, &decoding_key, &validation)
        .map_err(|error| {
            if error.to_string().is_empty() {
                "Unable to verify ID token.".to_string()
            } else {
                error.to_string()
            }
        })?
        .claims;

    Ok(claims_from_payload(
        payload,
        state,
        Some(id_token.to_string()),
    ))
}

async fn call_spacetime_reducer(
    state: &AppState,
    reducer: &str,
    args: &[Value],
    id_token: &str,
) -> Result<(), String> {
    let base = state.config.spacetime_uri.trim_end_matches('/');
    let response = state
        .http
        .post(format!(
            "{base}/v1/database/{}/call/{reducer}",
            state.config.spacetime_module
        ))
        .header("accept", "application/json")
        .header("authorization", format!("Bearer {id_token}"))
        .header("content-type", "application/json")
        .json(args)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if response.status().is_success() {
        return Ok(());
    }

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    let parsed = serde_json::from_str::<HashMap<String, Value>>(&body).ok();
    let message = parsed
        .as_ref()
        .and_then(|payload| payload.get("error").or_else(|| payload.get("message")))
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("SpaceTimeDB reducer {reducer} failed ({status})"));
    Err(message)
}

fn build_bootstrap_token(session: &AuthSession, private_key: &str) -> Result<String, StatusCode> {
    #[derive(Serialize)]
    struct BootstrapClaims<'a> {
        sub: &'a str,
        email: Option<&'a str>,
        name: Option<&'a str>,
        iat: usize,
        exp: usize,
        iss: &'a str,
    }

    let now = now_epoch_secs() as usize;
    let resolved_name = resolve_display_name(&session.claims);
    let claims = BootstrapClaims {
        sub: &session.claims.sub,
        email: session.claims.email.as_deref(),
        name: resolved_name.as_deref(),
        iat: now,
        exp: now + DEFAULT_BOOTSTRAP_TTL_SECS as usize,
        iss: SESSION_ISSUER,
    };

    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(private_key.as_bytes()),
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn sync_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SessionSyncBody>,
) -> Response {
    if body.id_token.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "ID token is required." })),
        )
            .into_response();
    }

    let claims = match verify_id_token(&body.id_token, &state).await {
        Ok(claims) => claims,
        Err(error) => {
            return (StatusCode::UNAUTHORIZED, Json(json!({ "error": error }))).into_response()
        }
    };

    build_session_response(&claims, &headers, &state)
}

async fn register_dev_local_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<DevLocalAccountBody>,
) -> Response {
    if state.config.environment.eq_ignore_ascii_case("production") {
        return StatusCode::NOT_FOUND.into_response();
    }

    let account = match state
        .dev_auth
        .register_local_account(
            body.name.as_deref().unwrap_or_default(),
            body.email.as_str(),
            body.password.as_str(),
        )
        .await
    {
        Ok(account) => account,
        Err((status, message)) => {
            return (status, Json(json!({ "error": message }))).into_response()
        }
    };

    let claims = build_local_account_claims(&account, &state);
    build_session_response(&claims, &headers, &state)
}

async fn login_dev_local_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<DevLocalAccountBody>,
) -> Response {
    if state.config.environment.eq_ignore_ascii_case("production") {
        return StatusCode::NOT_FOUND.into_response();
    }

    let account = match state
        .dev_auth
        .authenticate_local_account(body.email.as_str(), body.password.as_str())
        .await
    {
        Ok(account) => account,
        Err((status, message)) => {
            return (status, Json(json!({ "error": message }))).into_response()
        }
    };

    let claims = build_local_account_claims(&account, &state);
    build_session_response(&claims, &headers, &state)
}

async fn issue_dev_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<DevSessionBody>,
) -> Response {
    if state.config.environment.eq_ignore_ascii_case("production") {
        return StatusCode::NOT_FOUND.into_response();
    }

    let claims = build_dev_session_claims(&body, &state);
    build_session_response(&claims, &headers, &state)
}

async fn get_session(State(state): State<AppState>, headers: HeaderMap) -> Response {
    match read_site_session_claims(&headers, &state) {
        Some(claims) => Json(build_session_payload(&claims)).into_response(),
        None => Json(build_anonymous_payload()).into_response(),
    }
}

async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let mut response = Json(json!({ "ok": true })).into_response();
    if let Ok(value) = clear_session_cookie(&headers, &state).parse() {
        response.headers_mut().append(SET_COOKIE, value);
    }
    response
}

async fn update_profile_name(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ProfileNameBody>,
) -> Response {
    let Some(mut claims) = resolve_auth_session(&headers, &state).map(|session| session.claims)
    else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Authentication required" })),
        )
            .into_response();
    };

    let trimmed = match validate_profile_name(body.name.as_str()) {
        Ok(name) => name,
        Err((status, message)) => {
            return (status, Json(json!({ "error": message }))).into_response()
        }
    };

    if let Some(id_token) = claims.id_token.clone() {
        if let Err(error) = call_spacetime_reducer(
            &state,
            "set_profile_name",
            &[Value::String(trimmed.clone())],
            &id_token,
        )
        .await
        {
            return (StatusCode::BAD_GATEWAY, Json(json!({ "error": error }))).into_response();
        }
    }

    if claims.provider_id.as_deref() == Some("local") {
        let _ = state
            .dev_auth
            .rename_local_account(claims.sub.as_str(), trimmed.as_str())
            .await;
    }

    claims.name = Some(trimmed);
    let mut response = build_session_response(&claims, &headers, &state);
    *response.body_mut() = Json(json!({ "user": build_session_user(&claims) })).into_response().into_body();
    response
}

async fn issue_bootstrap_token(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(session) = resolve_auth_session(&headers, &state) else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Authentication required" })),
        )
            .into_response();
    };

    let Some(private_key) = state
        .config
        .auth
        .as_ref()
        .and_then(|config| config.bootstrap_private_key.clone())
    else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "Bootstrap signing unavailable" })),
        )
            .into_response();
    };

    let token = match build_bootstrap_token(&session, &private_key) {
        Ok(token) => token,
        Err(status) => {
            return (
                status,
                Json(json!({ "error": "failed to sign bootstrap token" })),
            )
                .into_response()
        }
    };

    let issued_at = now_epoch_secs();
    let expires_at = issued_at + DEFAULT_BOOTSTRAP_TTL_SECS;
    Json(json!({
        "token": token,
        "user": build_session_user(&session.claims),
        "issuedAt": issued_at,
        "expiresAt": expires_at,
    }))
    .into_response()
}
