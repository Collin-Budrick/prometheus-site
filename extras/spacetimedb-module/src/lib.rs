use serde::{Deserialize, Serialize};
use spacetimedb::{
    client_visibility_filter, reducer, table, AuthCtx, Filter, Identity, ReducerContext, Table,
    Timestamp,
};

const DEFAULT_JWT_ISSUER: &str = "urn:prometheus:better-auth";
const DEFAULT_JWT_AUDIENCE: &str = "prometheus-site";

#[client_visibility_filter]
const CONTACT_INVITE_FILTER: Filter = Filter::Sql(
    "SELECT * FROM contact_invite WHERE inviter_identity = :sender OR invitee_identity = :sender",
);

#[table(name = "config", accessor = config, public)]
pub struct Config {
    #[primary_key]
    owner_identity: Identity,
}

#[table(name = "user_profile", accessor = user_profile)]
pub struct UserProfile {
    #[primary_key]
    identity: Identity,
    subject: String,
    issuer: String,
    email: String,
    name: String,
    image: String,
    roles_json: String,
    login_method: String,
    provider_id: String,
    updated_at: Timestamp,
}

#[table(name = "directory_user", accessor = directory_user, public)]
pub struct DirectoryUser {
    #[primary_key]
    identity: Identity,
    name: String,
    image: String,
    updated_at: Timestamp,
}

#[table(name = "store_item", accessor = store_item, public)]
pub struct StoreItem {
    #[primary_key]
    #[auto_inc]
    id: u64,
    name: String,
    price: f64,
    quantity: i32,
    created_at: Timestamp,
    updated_at: Timestamp,
}

#[table(name = "contact_invite", accessor = contact_invite, public)]
pub struct ContactInvite {
    #[primary_key]
    #[auto_inc]
    id: u64,
    inviter_identity: Identity,
    invitee_identity: Identity,
    status: String,
    created_at: Timestamp,
    updated_at: Timestamp,
}

#[table(name = "chat_message", accessor = chat_message, public)]
pub struct ChatMessage {
    #[primary_key]
    #[auto_inc]
    id: u64,
    author_identity: Identity,
    author_name: String,
    body: String,
    created_at: Timestamp,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OidcClaims {
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub login_method: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub picture: Option<String>,
    #[serde(default)]
    pub preferred_username: Option<String>,
    #[serde(default)]
    pub provider_id: Option<String>,
    #[serde(default)]
    pub roles: Vec<String>,
}

fn resolve_jwt_issuer() -> &'static str {
    option_env!("AUTH_JWT_ISSUER")
        .or(option_env!("OIDC_AUTHORITY"))
        .or(option_env!("SPACETIMEAUTH_AUTHORITY"))
        .unwrap_or(DEFAULT_JWT_ISSUER)
}

fn resolve_jwt_audience() -> &'static str {
    option_env!("AUTH_JWT_AUDIENCE")
        .or(option_env!("OIDC_CLIENT_ID"))
        .or(option_env!("SPACETIMEAUTH_CLIENT_ID"))
        .unwrap_or(DEFAULT_JWT_AUDIENCE)
}

fn parse_claims(sender_auth: &AuthCtx) -> Result<OidcClaims, String> {
    let jwt = sender_auth
        .jwt()
        .ok_or("Authentication required".to_string())?;
    serde_json::from_slice(jwt.raw_payload().as_bytes())
        .map_err(|error| format!("Invalid JWT payload: {error}"))
}

fn has_allowed_issuer(sender_auth: &AuthCtx) -> bool {
    if sender_auth.is_internal() {
        return true;
    }

    let Some(jwt) = sender_auth.jwt() else {
        return false;
    };

    jwt.issuer() == resolve_jwt_issuer()
        && jwt.audience().iter().any(|aud| aud == resolve_jwt_audience())
}

fn ensure_allowed_issuer(sender_auth: &AuthCtx) -> Result<(), String> {
    if sender_auth.is_internal() {
        return Ok(());
    }

    let jwt = sender_auth
        .jwt()
        .ok_or("Authentication required".to_string())?;
    if jwt.issuer() != resolve_jwt_issuer() {
        return Err("Invalid issuer".to_string());
    }
    if !jwt.audience().iter().any(|aud| aud == resolve_jwt_audience()) {
        return Err("Invalid audience".to_string());
    }

    Ok(())
}

fn ensure_authenticated(sender_auth: &AuthCtx) -> Result<(), String> {
    ensure_allowed_issuer(sender_auth)?;
    if sender_auth.jwt().is_none() {
        return Err("Authentication required".to_string());
    }
    Ok(())
}

fn ensure_admin_access(ctx: &ReducerContext) -> Result<(), String> {
    let sender_auth = ctx.sender_auth();
    if sender_auth.is_internal() {
        return Ok(());
    }
    if ctx.db.config().owner_identity().find(ctx.sender()).is_some() {
        return Ok(());
    }
    let claims = parse_claims(&sender_auth)?;
    if claims.roles.iter().any(|role| role == "admin") {
        return Ok(());
    }
    Err("Admin role required".to_string())
}

fn display_name_from_claims(sender: Identity, claims: &OidcClaims) -> String {
    if let Some(name) = claims.name.clone().filter(|value| !value.trim().is_empty()) {
        return name;
    }
    if let Some(username) = claims
        .preferred_username
        .clone()
        .filter(|value| !value.trim().is_empty())
    {
        return username;
    }
    if let Some(email) = claims.email.clone().filter(|value| !value.trim().is_empty()) {
        let local = email.split('@').next().unwrap_or(email.as_str()).trim();
        if !local.is_empty() {
            return local.to_string();
        }
        return email;
    }
    sender.to_string()
}

fn sync_user_profile(ctx: &ReducerContext) -> Result<(), String> {
    let sender_auth = ctx.sender_auth();
    let jwt = match sender_auth.jwt() {
        Some(jwt) => jwt,
        None => return Ok(()),
    };

    if !has_allowed_issuer(&sender_auth) {
        return Ok(());
    }

    let claims = parse_claims(&sender_auth)?;
    let sender = ctx.sender();
    let email = claims
        .email
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("{}@spacetime.local", sender));
    let name = display_name_from_claims(sender, &claims);
    let image = claims.picture.clone().unwrap_or_default();
    let roles_json = serde_json::to_string(&claims.roles).unwrap_or_else(|_| "[]".to_string());
    let login_method = claims.login_method.clone().unwrap_or_default();
    let provider_id = claims.provider_id.clone().unwrap_or_default();

    ctx.db.user_profile().identity().delete(sender);
    ctx.db.directory_user().identity().delete(sender);
    ctx.db.user_profile().try_insert(UserProfile {
        identity: sender,
        subject: jwt.subject().to_string(),
        issuer: jwt.issuer().to_string(),
        email,
        name: name.clone(),
        image: image.clone(),
        roles_json,
        login_method,
        provider_id,
        updated_at: ctx.timestamp,
    })?;
    ctx.db.directory_user().try_insert(DirectoryUser {
        identity: sender,
        name,
        image,
        updated_at: ctx.timestamp,
    })?;

    Ok(())
}

fn clamp_name(name: String) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.len() < 2 {
        return Err("Name must be at least 2 characters".to_string());
    }
    if trimmed.len() > 64 {
        return Err("Name must be 64 characters or less".to_string());
    }
    Ok(trimmed.to_string())
}

#[reducer(init)]
pub fn init(ctx: &ReducerContext) -> Result<(), String> {
    ctx.db.config().try_insert(Config {
        owner_identity: ctx.sender(),
    })?;

    if ctx.db.store_item().count() == 0 {
        for index in 0..15 {
            let ordinal = index + 1;
            ctx.db.store_item().try_insert(StoreItem {
                id: 0,
                name: format!("Item {ordinal}"),
                price: f64::from(ordinal as u32 * 3),
                quantity: ordinal as i32,
                created_at: ctx.timestamp,
                updated_at: ctx.timestamp,
            })?;
        }
    }

    Ok(())
}

#[reducer(client_connected)]
pub fn on_connect(ctx: &ReducerContext) -> Result<(), String> {
    sync_user_profile(ctx)
}

#[reducer]
pub fn create_store_item(
    ctx: &ReducerContext,
    name: String,
    price: f64,
    quantity: i32,
) -> Result<(), String> {
    ensure_admin_access(ctx)?;
    let trimmed = name.trim();
    if trimmed.len() < 2 {
        return Err("Name must be at least 2 characters".to_string());
    }
    if !price.is_finite() || price < 0.0 || price > 100_000.0 {
        return Err("Price must be between 0 and 100000".to_string());
    }
    if quantity < -1 || quantity > 100_000 {
        return Err("Quantity must be between -1 and 100000".to_string());
    }

    ctx.db.store_item().try_insert(StoreItem {
        id: 0,
        name: trimmed.to_string(),
        price,
        quantity,
        created_at: ctx.timestamp,
        updated_at: ctx.timestamp,
    })?;

    Ok(())
}

#[reducer]
pub fn delete_store_item(ctx: &ReducerContext, id: u64) -> Result<(), String> {
    ensure_admin_access(ctx)?;
    let deleted = ctx.db.store_item().id().delete(id);
    if !deleted {
        return Err("Item not found".to_string());
    }
    Ok(())
}

#[reducer]
pub fn consume_store_item(ctx: &ReducerContext, id: u64) -> Result<(), String> {
    ensure_authenticated(&ctx.sender_auth())?;
    let item = ctx
        .db
        .store_item()
        .id()
        .find(id)
        .ok_or("Item not found".to_string())?;
    if item.quantity == 0 {
        return Err("Out of stock".to_string());
    }

    let next_quantity = if item.quantity < 0 {
        item.quantity
    } else {
        item.quantity - 1
    };

    ctx.db.store_item().id().delete(id);
    ctx.db.store_item().try_insert(StoreItem {
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: next_quantity,
        created_at: item.created_at,
        updated_at: ctx.timestamp,
    })?;

    Ok(())
}

#[reducer]
pub fn restore_store_item(ctx: &ReducerContext, id: u64, amount: i32) -> Result<(), String> {
    ensure_authenticated(&ctx.sender_auth())?;
    if amount <= 0 {
        return Err("Restore amount must be positive".to_string());
    }
    let item = ctx
        .db
        .store_item()
        .id()
        .find(id)
        .ok_or("Item not found".to_string())?;
    if item.quantity < 0 {
        return Ok(());
    }

    ctx.db.store_item().id().delete(id);
    ctx.db.store_item().try_insert(StoreItem {
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity + amount,
        created_at: item.created_at,
        updated_at: ctx.timestamp,
    })?;

    Ok(())
}

#[reducer]
pub fn set_profile_name(ctx: &ReducerContext, name: String) -> Result<(), String> {
    ensure_authenticated(&ctx.sender_auth())?;
    let existing = ctx
        .db
        .user_profile()
        .identity()
        .find(ctx.sender())
        .ok_or("Profile not found".to_string())?;
    let next_name = clamp_name(name)?;

    ctx.db.user_profile().identity().delete(ctx.sender());
    ctx.db.directory_user().identity().delete(ctx.sender());
    ctx.db.user_profile().try_insert(UserProfile {
        identity: existing.identity,
        subject: existing.subject,
        issuer: existing.issuer,
        email: existing.email,
        name: next_name.clone(),
        image: existing.image.clone(),
        roles_json: existing.roles_json,
        login_method: existing.login_method,
        provider_id: existing.provider_id,
        updated_at: ctx.timestamp,
    })?;
    ctx.db.directory_user().try_insert(DirectoryUser {
        identity: existing.identity,
        name: next_name,
        image: existing.image,
        updated_at: ctx.timestamp,
    })?;

    Ok(())
}

#[reducer]
pub fn send_contact_invite(ctx: &ReducerContext, invitee_identity: Identity) -> Result<(), String> {
    ensure_authenticated(&ctx.sender_auth())?;
    if invitee_identity == ctx.sender() {
        return Err("You cannot invite yourself".to_string());
    }

    let inviter_exists = ctx.db.user_profile().identity().find(ctx.sender()).is_some();
    let invitee_exists = ctx
        .db
        .user_profile()
        .identity()
        .find(invitee_identity)
        .is_some();
    if !inviter_exists || !invitee_exists {
        return Err("Invite unavailable".to_string());
    }

    let existing = ctx.db.contact_invite().iter().find(|invite| {
        (invite.inviter_identity == ctx.sender() && invite.invitee_identity == invitee_identity)
            || (invite.inviter_identity == invitee_identity
                && invite.invitee_identity == ctx.sender())
    });

    if let Some(invite) = existing {
        if invite.status == "accepted" {
            return Err("Contact already accepted".to_string());
        }
        ctx.db.contact_invite().id().delete(invite.id);
    }

    ctx.db.contact_invite().try_insert(ContactInvite {
        id: 0,
        inviter_identity: ctx.sender(),
        invitee_identity,
        status: "pending".to_string(),
        created_at: ctx.timestamp,
        updated_at: ctx.timestamp,
    })?;

    Ok(())
}

fn update_invite_status(
    ctx: &ReducerContext,
    id: u64,
    next_status: &str,
    must_be_invitee: bool,
) -> Result<(), String> {
    ensure_authenticated(&ctx.sender_auth())?;
    let invite = ctx
        .db
        .contact_invite()
        .id()
        .find(id)
        .ok_or("Invite not found".to_string())?;

    if must_be_invitee && invite.invitee_identity != ctx.sender() {
        return Err("Invite can only be updated by the recipient".to_string());
    }
    if !must_be_invitee
        && invite.inviter_identity != ctx.sender()
        && invite.invitee_identity != ctx.sender()
    {
        return Err("Invite not found".to_string());
    }
    if invite.status != "pending" && next_status != "removed" {
        return Err("Invite is no longer pending".to_string());
    }

    ctx.db.contact_invite().id().delete(id);
    if next_status == "removed" {
        return Ok(());
    }

    ctx.db.contact_invite().try_insert(ContactInvite {
        id: invite.id,
        inviter_identity: invite.inviter_identity,
        invitee_identity: invite.invitee_identity,
        status: next_status.to_string(),
        created_at: invite.created_at,
        updated_at: ctx.timestamp,
    })?;

    Ok(())
}

#[reducer]
pub fn accept_contact_invite(ctx: &ReducerContext, id: u64) -> Result<(), String> {
    update_invite_status(ctx, id, "accepted", true)
}

#[reducer]
pub fn decline_contact_invite(ctx: &ReducerContext, id: u64) -> Result<(), String> {
    update_invite_status(ctx, id, "declined", true)
}

#[reducer]
pub fn remove_contact_invite(ctx: &ReducerContext, id: u64) -> Result<(), String> {
    update_invite_status(ctx, id, "removed", false)
}

#[reducer]
pub fn send_chat_message(ctx: &ReducerContext, body: String) -> Result<(), String> {
    ensure_authenticated(&ctx.sender_auth())?;
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return Err("Message cannot be empty".to_string());
    }
    if trimmed.len() > 1000 {
        return Err("Message too long".to_string());
    }

    let author_name = ctx
        .db
        .user_profile()
        .identity()
        .find(ctx.sender())
        .map(|profile| profile.name)
        .filter(|value: &String| !value.trim().is_empty())
        .unwrap_or_else(|| ctx.sender().to_string());

    ctx.db.chat_message().try_insert(ChatMessage {
        id: 0,
        author_identity: ctx.sender(),
        author_name,
        body: trimmed.to_string(),
        created_at: ctx.timestamp,
    })?;

    Ok(())
}
