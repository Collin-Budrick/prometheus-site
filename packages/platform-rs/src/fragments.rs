use std::collections::{HashMap, HashSet};
use std::convert::Infallible;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::body::Body;
use axum::extract::{Path as AxumPath, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Json;
use axum::Router;
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine as _;
use bytes::Bytes;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::sync::{mpsc, RwLock};
use tokio_stream::wrappers::ReceiverStream;

use crate::config::FeatureFlags;
use crate::shared::AppState;

const FRAGMENT_MAGIC: u32 = 0x4652_4147;
const FRAGMENT_VERSION_V2: u8 = 2;
const FRAGMENT_VERSION_V3: u8 = 3;
const FRAGMENT_HEADER_SIZE_V2: usize = 28;
const FRAGMENT_HEADER_SIZE_V3: usize = 28;
const FRAGMENT_SECTION_CSS: u8 = 1 << 0;
const FRAGMENT_SECTION_HTML: u8 = 1 << 1;
const TREE_MAGIC: u32 = 0x5452_4545;
const TREE_NODE_SIZE: usize = 24;
const ATTR_SIZE: usize = 8;
const UINT32_MAX: u32 = u32::MAX;
const HEARTBEAT_MS: u64 = 5_000;

const HOME_MANIFEST_ID: &str = "fragment://page/home/manifest@v1";
const HOME_PLANNER_ID: &str = "fragment://page/home/planner@v1";
const HOME_LEDGER_ID: &str = "fragment://page/home/ledger@v1";
const HOME_ISLAND_ID: &str = "fragment://page/home/island@v1";
const HOME_REACT_ID: &str = "fragment://page/home/react@v1";
const HOME_DOCK_ID: &str = "fragment://page/home/dock@v2";
const STORE_STREAM_ID: &str = "fragment://page/store/stream@v5";
const STORE_CART_ID: &str = "fragment://page/store/cart@v1";
const STORE_CREATE_ID: &str = "fragment://page/store/create@v1";
const CHAT_CONTACTS_ID: &str = "fragment://page/chat/contacts@v1";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RenderNode {
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attrs: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<RenderNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "op")]
pub enum HeadOp {
    #[serde(rename = "title")]
    Title { value: String },
    #[serde(rename = "meta")]
    Meta {
        #[serde(skip_serializing_if = "Option::is_none")]
        name: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        property: Option<String>,
        content: String,
    },
    #[serde(rename = "link")]
    Link { rel: String, href: String },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FragmentMeta {
    #[serde(rename = "cacheKey")]
    pub cache_key: String,
    pub ttl: u32,
    #[serde(rename = "staleTtl")]
    pub stale_ttl: u32,
    pub tags: Vec<String>,
    pub runtime: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FragmentCacheStatus {
    pub status: String,
    #[serde(rename = "updatedAt", skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FragmentPlanEntryLayoutBucket {
    #[serde(rename = "maxWidth")]
    pub max_width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FragmentPlanEntryLayoutProfile {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub desktop: Option<Vec<FragmentPlanEntryLayoutBucket>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mobile: Option<Vec<FragmentPlanEntryLayoutBucket>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FragmentPlanEntryLayoutHint {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub desktop: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mobile: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FragmentPlanEntryLayout {
    pub column: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
    #[serde(rename = "minHeight", skip_serializing_if = "Option::is_none")]
    pub min_height: Option<u32>,
    #[serde(rename = "heightHint", skip_serializing_if = "Option::is_none")]
    pub height_hint: Option<FragmentPlanEntryLayoutHint>,
    #[serde(rename = "heightProfile", skip_serializing_if = "Option::is_none")]
    pub height_profile: Option<FragmentPlanEntryLayoutProfile>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FragmentPlanEntry {
    pub id: String,
    pub critical: bool,
    pub layout: FragmentPlanEntryLayout,
    #[serde(rename = "renderHtml", skip_serializing_if = "Option::is_none")]
    pub render_html: Option<bool>,
    #[serde(rename = "dependsOn", skip_serializing_if = "Option::is_none")]
    pub depends_on: Option<Vec<String>>,
    #[serde(rename = "bootMode", skip_serializing_if = "Option::is_none")]
    pub boot_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache: Option<FragmentCacheStatus>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FragmentPlanResponse {
    pub path: String,
    pub fragments: Vec<FragmentPlanEntry>,
    #[serde(rename = "fetchGroups", skip_serializing_if = "Option::is_none")]
    pub fetch_groups: Option<Vec<Vec<String>>>,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
    #[serde(rename = "initialFragments", skip_serializing_if = "Option::is_none")]
    pub initial_fragments: Option<HashMap<String, String>>,
    #[serde(rename = "initialHtml", skip_serializing_if = "Option::is_none")]
    pub initial_html: Option<HashMap<String, String>>,
}

#[derive(Clone)]
pub struct FragmentEntry {
    pub id: String,
    pub tree: RenderNode,
    pub head: Vec<HeadOp>,
    pub css: String,
    pub html: String,
    pub meta: FragmentMeta,
    pub updated_at: u64,
}

#[derive(Clone)]
pub struct FragmentService {
    features: FeatureFlags,
    translations: Arc<HashMap<String, HashMap<String, String>>>,
    css_files: Arc<HashMap<String, String>>,
    fragment_cache: Arc<RwLock<HashMap<String, FragmentEntry>>>,
    plan_cache: Arc<RwLock<HashMap<String, FragmentPlanResponse>>>,
    plan_versions: Arc<RwLock<HashMap<String, u64>>>,
}

#[derive(Debug, Deserialize)]
struct BatchRequest {
    id: String,
    lang: Option<String>,
    refresh: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct FragmentQuery {
    id: Option<String>,
    lang: Option<String>,
    protocol: Option<String>,
    refresh: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FragmentPlanQuery {
    path: Option<String>,
    lang: Option<String>,
    protocol: Option<String>,
    #[serde(rename = "includeInitial")]
    include_initial: Option<String>,
    refresh: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FragmentBundleQuery {
    path: Option<String>,
    lang: Option<String>,
    protocol: Option<String>,
    known: Option<String>,
    ids: Option<String>,
    live: Option<String>,
}

#[derive(Default)]
struct BootTargets {
    ids: Vec<String>,
    html_ids: Vec<String>,
}

impl FragmentService {
    pub fn new(features: FeatureFlags) -> Self {
        Self {
            features,
            translations: Arc::new(load_translations()),
            css_files: Arc::new(load_fragment_css_files()),
            fragment_cache: Arc::new(RwLock::new(HashMap::new())),
            plan_cache: Arc::new(RwLock::new(HashMap::new())),
            plan_versions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn clear_plan_memo(&self, path: &str, lang: &str) {
        let key = format!("{}::{}", normalize_plan_path(path), normalize_lang(lang));
        self.plan_cache.write().await.remove(&key);
        let mut versions = self.plan_versions.write().await;
        let next = versions.get(&key).copied().unwrap_or(0) + 1;
        versions.insert(key, next);
    }

    pub async fn plan_version(&self, path: &str, lang: &str) -> u64 {
        let key = format!("{}::{}", normalize_plan_path(path), normalize_lang(lang));
        self.plan_versions
            .read()
            .await
            .get(&key)
            .copied()
            .unwrap_or(0)
    }

    pub async fn get_fragment_entry(
        &self,
        id: &str,
        lang: &str,
        refresh: bool,
    ) -> Option<FragmentEntry> {
        let normalized_lang = normalize_lang(lang);
        let cache_key = format!("{id}::{normalized_lang}");
        if !refresh {
            if let Some(entry) = self.fragment_cache.read().await.get(&cache_key).cloned() {
                return Some(entry);
            }
        }

        let entry = self.render_fragment(id, &normalized_lang)?;
        self.fragment_cache
            .write()
            .await
            .insert(cache_key, entry.clone());
        Some(entry)
    }

    pub fn get_fragment_html(&self, entry: &FragmentEntry) -> String {
        entry.html.clone()
    }

    pub async fn get_fragment_plan(&self, path: &str, lang: &str) -> FragmentPlanResponse {
        let normalized_path = normalize_plan_path(path);
        let normalized_lang = normalize_lang(lang);
        let cache_key = format!("{normalized_path}::{normalized_lang}");
        if let Some(plan) = self.plan_cache.read().await.get(&cache_key).cloned() {
            return plan;
        }

        let created_at = current_millis();
        let mut fragments = match normalized_path.as_str() {
            "/" => self.home_plan_entries(),
            "/store" if self.features.store => store_plan_entries(),
            "/chat" if self.features.messaging => chat_plan_entries(),
            _ => Vec::new(),
        };

        for entry in &mut fragments {
            let render_html = entry.render_html.unwrap_or(true);
            entry.render_html = Some(render_html);
            entry.boot_mode = Some(resolve_boot_mode(entry.critical, render_html));
            let cached = self
                .get_fragment_entry(&entry.id, &normalized_lang, false)
                .await
                .map(|fragment| FragmentCacheStatus {
                    status: "hit".to_string(),
                    updated_at: Some(fragment.updated_at),
                });
            entry.cache = cached;
        }

        let fetch_groups = if normalized_path == "/" {
            Some(home_fetch_groups(&fragments))
        } else if fragments.is_empty() {
            Some(Vec::new())
        } else {
            Some(vec![fragments
                .iter()
                .map(|entry| entry.id.clone())
                .collect()])
        };

        let plan = FragmentPlanResponse {
            path: normalized_path,
            fragments,
            fetch_groups,
            created_at,
            initial_fragments: None,
            initial_html: None,
        };
        self.plan_cache
            .write()
            .await
            .insert(cache_key, plan.clone());
        plan
    }

    fn translate(&self, lang: &str, key: &str, params: &[(&str, String)]) -> String {
        let fallback = self.translations.get("en");
        let base = self
            .translations
            .get(lang)
            .and_then(|entries| entries.get(key))
            .or_else(|| fallback.and_then(|entries| entries.get(key)))
            .cloned()
            .unwrap_or_else(|| key.to_string());
        params.iter().fold(base, |acc, (name, value)| {
            acc.replace(&format!("{{{{{name}}}}}"), value)
        })
    }

    fn home_plan_entries(&self) -> Vec<FragmentPlanEntry> {
        let mut entries = vec![
            home_entry(HOME_MANIFEST_ID, true, "span 12", Some("small"), 489, None),
            home_entry(HOME_PLANNER_ID, false, "span 5", Some("big"), 640, None),
        ];

        let showcase = self.features.store || self.features.messaging || self.features.realtime;
        if showcase {
            entries.push(home_entry(
                HOME_LEDGER_ID,
                false,
                "span 7",
                Some("tall"),
                904,
                Some(vec![HOME_PLANNER_ID.to_string()]),
            ));
            entries.push(home_entry(HOME_ISLAND_ID, false, "span 5", None, 489, None));
            entries.push(home_entry(
                HOME_REACT_ID,
                false,
                "span 12",
                Some("small"),
                489,
                Some(vec![HOME_PLANNER_ID.to_string()]),
            ));
        }
        if self.features.realtime {
            entries.push(home_entry(
                HOME_DOCK_ID,
                false,
                "span 12",
                Some("small"),
                420,
                None,
            ));
        }
        entries
    }

    fn render_fragment(&self, id: &str, lang: &str) -> Option<FragmentEntry> {
        let (tree, tags) = match id {
            HOME_MANIFEST_ID => (self.render_home_manifest(lang), vec!["home", "manifest"]),
            HOME_PLANNER_ID => (self.render_home_planner(lang), vec!["home", "planner"]),
            HOME_LEDGER_ID => (self.render_home_ledger(lang), vec!["home", "wasm"]),
            HOME_ISLAND_ID => (self.render_home_island(lang), vec!["home", "island"]),
            HOME_REACT_ID => (self.render_home_react(lang), vec!["home", "react"]),
            HOME_DOCK_ID => (self.render_home_dock(lang), vec!["home", "dock"]),
            STORE_STREAM_ID => (self.render_store_stream(lang), vec!["store", "stream"]),
            STORE_CART_ID => (self.render_store_cart(lang), vec!["store", "cart"]),
            STORE_CREATE_ID => (self.render_store_create(lang), vec!["store", "create"]),
            CHAT_CONTACTS_ID => (self.render_chat_contacts(lang), vec!["chat", "contacts"]),
            _ => return None,
        };

        let css = self.css_files.get(id).cloned().unwrap_or_default();
        let html = render_to_html(&tree);
        let updated_at = current_millis();
        Some(FragmentEntry {
            id: id.to_string(),
            tree,
            head: Vec::new(),
            css,
            html,
            updated_at,
            meta: FragmentMeta {
                cache_key: id.to_string(),
                ttl: 30,
                stale_ttl: 120,
                tags: tags.into_iter().map(ToString::to_string).collect(),
                runtime: "edge".to_string(),
            },
        })
    }

    fn render_home_manifest(&self, lang: &str) -> RenderNode {
        el(
            "section",
            None,
            vec![
                el("div", class_attr("meta-line"), vec![text(self.translate(lang, "fragment manifesto", &[]))]),
                el(
                    "h2",
                    None,
                    vec![text(self.translate(lang, "The render tree is the artifact.", &[]))],
                ),
                el(
                    "p",
                    class_attr("home-manifest-copy"),
                    vec![
                        el(
                            "span",
                            class_attr("home-manifest-copy-lead-inline"),
                            vec![text(self.translate(lang, "HTML remains the fallback surface.", &[]))],
                        ),
                        text(self.translate(
                            lang,
                            "Deterministic binary fragments handle replay, caching, and instant patching.",
                            &[],
                        )),
                    ],
                ),
                el(
                    "ul",
                    class_attr("home-manifest-pills"),
                    vec![
                        pill(self.translate(lang, "Resumable by default", &[])),
                        pill(self.translate(lang, "Fragment caching with async revalidation", &[])),
                        pill(self.translate(lang, "Deterministic binary DOM replay", &[])),
                    ],
                ),
            ],
        )
    }

    fn render_home_planner(&self, lang: &str) -> RenderNode {
        render_home_demo_section(
            "fragment planner",
            "Planner executes before rendering.",
            "Dependency resolution, cache hit checks, and runtime selection happen up front.",
            Some("Rendering only occurs on cache miss; revalidation runs asynchronously."),
            widget_marker(
                HOME_PLANNER_ID,
                "planner-demo",
                "visible",
                None,
                demo_shell(
                    "planner",
                    &self.translate(lang, "Planner", &[]),
                    &self.translate(lang, "Resolve the dependency graph.", &[]),
                    &self.translate(lang, "Dependencies / Cache / Runtime", &[]),
                ),
            ),
            Some(el(
                "ul",
                class_attr("home-fragment-metrics"),
                vec![
                    metric(self.translate(lang, "Dependencies resolved", &[])),
                    metric(self.translate(lang, "Parallel cache hits", &[])),
                    metric(self.translate(lang, "Edge or Node runtime", &[])),
                    metric(self.translate(lang, "Async revalidation", &[])),
                ],
            )),
        )
    }

    fn render_home_ledger(&self, lang: &str) -> RenderNode {
        render_home_demo_section(
            "wasm renderer",
            "Hot-path fragments rendered by WASM.",
            "Critical transforms run inside WebAssembly for deterministic, edge-safe execution.",
            Some("Numeric outputs feed fragment composition without touching HTML."),
            widget_marker(
                HOME_LEDGER_ID,
                "wasm-renderer-demo",
                "visible",
                None,
                demo_shell(
                    "wasm-renderer",
                    &self.translate(lang, "Wasm renderer", &[]),
                    &self.translate(lang, "Binary bytes stay deterministic.", &[]),
                    &self.translate(lang, "Edge-safe / Deterministic / HTML untouched", &[]),
                ),
            ),
            Some(el(
                "ul",
                class_attr("home-fragment-metrics"),
                vec![
                    metric(self.translate(
                        lang,
                        "Burst throughput {{count}} op/s",
                        &[("count", "100".to_string())],
                    )),
                    metric(self.translate(
                        lang,
                        "Hot-path score {{count}} pts",
                        &[("count", "384".to_string())],
                    )),
                    metric(self.translate(
                        lang,
                        "Cache TTL {{count}}s",
                        &[("count", "30".to_string())],
                    )),
                    metric(self.translate(
                        lang,
                        "Stale TTL {{count}}s",
                        &[("count", "120".to_string())],
                    )),
                ],
            )),
        )
    }

    fn render_home_island(&self, lang: &str) -> RenderNode {
        render_home_demo_section(
            "preact island",
            "Isolated client islands stay sandboxed.",
            "Preact loads only inside the island boundary.",
            Some("No shared state, no routing ownership, no global hydration."),
            widget_marker(
                HOME_ISLAND_ID,
                "preact-island",
                "visible",
                Some(serde_json::json!({ "label": self.translate(lang, "Isolated island", &[]) })),
                demo_shell(
                    "preact-island",
                    &self.translate(lang, "Isolated island", &[]),
                    &self.translate(lang, "Counting down.", &[]),
                    &self.translate(lang, "Countdown / 1:00 / Ready", &[]),
                ),
            ),
            None,
        )
    }

    fn render_home_react(&self, lang: &str) -> RenderNode {
        render_home_demo_section(
            "react authoring",
            "React stays server-only.",
            "React fragments compile into binary trees without client hydration.",
            Some("The DOM remains owned by Qwik."),
            widget_marker(
                HOME_REACT_ID,
                "react-binary-demo",
                "visible",
                None,
                demo_shell(
                    "react-binary",
                    &self.translate(lang, "React to binary", &[]),
                    &self.translate(lang, "React nodes collapse into binary frames.", &[]),
                    &self.translate(lang, "React / Hydration skipped / Binary stream", &[]),
                ),
            ),
            Some(el(
                "div",
                class_attr("badge"),
                vec![text(self.translate(lang, "RSC-ready", &[]))],
            )),
        )
    }

    fn render_home_dock(&self, lang: &str) -> RenderNode {
        render_home_demo_section(
            "live collaborative text",
            "Shared text for everyone on the page.",
            "Anyone on the page can edit the same text box.",
            Some("Loro syncs updates through Garnet in real time."),
            widget_marker(
                HOME_DOCK_ID,
                "home-collab",
                "critical",
                Some(serde_json::json!({
                    "root": "dock",
                    "placeholder": self.translate(lang, "Write something. Everyone here sees it live.", &[]),
                    "ariaLabel": self.translate(lang, "Shared collaborative text box", &[])
                })),
                el(
                    "div",
                    map_attrs(vec![
                        ("class", "home-collab-root mt-6"),
                        ("data-home-collab-root", "dock"),
                        (
                            "data-collab-status-idle",
                            &self.translate(lang, "Focus to start live sync.", &[]),
                        ),
                        (
                            "data-collab-status-connecting",
                            &self.translate(lang, "Connecting live sync...", &[]),
                        ),
                        (
                            "data-collab-status-live",
                            &self.translate(lang, "Live for everyone on this page", &[]),
                        ),
                        (
                            "data-collab-status-reconnecting",
                            &self.translate(lang, "Reconnecting live sync...", &[]),
                        ),
                        (
                            "data-collab-status-error",
                            &self.translate(lang, "Realtime unavailable", &[]),
                        ),
                    ]),
                    vec![
                        el(
                            "textarea",
                            map_attrs(vec![
                                ("class", "home-collab-textarea"),
                                ("id", "home-collab-dock-input"),
                                ("name", "home-collab-dock-input"),
                                ("data-home-collab-input", "true"),
                                ("rows", "7"),
                                ("spellcheck", "false"),
                                (
                                    "placeholder",
                                    &self.translate(
                                        lang,
                                        "Write something. Everyone here sees it live.",
                                        &[],
                                    ),
                                ),
                                (
                                    "aria-label",
                                    &self.translate(lang, "Shared collaborative text box", &[]),
                                ),
                                ("readonly", "true"),
                                ("aria-busy", "false"),
                            ]),
                            vec![],
                        ),
                        el(
                            "div",
                            class_attr("home-collab-toolbar"),
                            vec![
                                el(
                                    "span",
                                    map_attrs(vec![
                                        ("class", "home-collab-status"),
                                        ("data-home-collab-status", "idle"),
                                        ("role", "status"),
                                        ("aria-live", "polite"),
                                    ]),
                                    vec![text(self.translate(
                                        lang,
                                        "Focus to start live sync.",
                                        &[],
                                    ))],
                                ),
                                el(
                                    "span",
                                    class_attr("home-collab-note"),
                                    vec![text("Loro + Garnet".to_string())],
                                ),
                            ],
                        ),
                    ],
                ),
            ),
            None,
        )
    }

    fn render_store_stream(&self, lang: &str) -> RenderNode {
        el(
            "section",
            class_attr("store-fragment"),
            vec![
                el(
                    "div",
                    class_attr("store-fragment-badges"),
                    vec![
                        badge(self.translate(lang, "SpaceTimeDB", &[]), "badge"),
                        badge(self.translate(lang, "Direct", &[]), "badge signal"),
                        badge(self.translate(lang, "Realtime", &[]), "badge accent"),
                    ],
                ),
                el(
                    "store-stream",
                    map_attrs(vec![
                        ("class", "store-stream"),
                        ("data-limit", "12"),
                        (
                            "data-placeholder",
                            &self.translate(lang, "Search the store...", &[]),
                        ),
                    ]),
                    vec![],
                ),
            ],
        )
    }

    fn render_store_create(&self, lang: &str) -> RenderNode {
        el(
            "store-create",
            map_attrs(vec![
                ("data-name-label", &self.translate(lang, "Item name", &[])),
                ("data-price-label", &self.translate(lang, "Price", &[])),
                (
                    "data-quantity-label",
                    &self.translate(lang, "Quantity", &[]),
                ),
                ("data-submit-label", &self.translate(lang, "Add item", &[])),
                ("data-name-placeholder", "Neural render pack"),
                ("data-price-placeholder", "19.00"),
                ("data-quantity-placeholder", "1"),
                (
                    "data-helper",
                    &self.translate(
                        lang,
                        "Validated on write and streamed over realtime updates.",
                        &[],
                    ),
                ),
            ]),
            vec![],
        )
    }

    fn render_store_cart(&self, lang: &str) -> RenderNode {
        el(
            "store-cart",
            map_attrs(vec![
                ("data-title", &self.translate(lang, "Cart", &[])),
                (
                    "data-helper",
                    &self.translate(lang, "Drag items here or select them.", &[]),
                ),
                ("data-empty", &self.translate(lang, "Cart is empty.", &[])),
                ("data-total", &self.translate(lang, "Total", &[])),
                ("data-drop", &self.translate(lang, "Drop to add", &[])),
                ("data-remove", &self.translate(lang, "Remove item", &[])),
            ]),
            vec![],
        )
    }

    fn render_chat_contacts(&self, lang: &str) -> RenderNode {
        el(
            "contact-invites",
            map_attrs(vec![
                ("class", "chat-invites"),
                ("data-title", &self.translate(lang, "Contact invites", &[])),
                (
                    "data-helper",
                    &self.translate(lang, "Search by user ID to connect.", &[]),
                ),
                (
                    "data-search-label",
                    &self.translate(lang, "Search by user ID", &[]),
                ),
                ("data-search-placeholder", "user-id"),
                ("data-search-action", &self.translate(lang, "Search", &[])),
                ("data-invite-action", &self.translate(lang, "Invite", &[])),
                ("data-accept-action", &self.translate(lang, "Accept", &[])),
                ("data-decline-action", &self.translate(lang, "Decline", &[])),
                ("data-remove-action", &self.translate(lang, "Remove", &[])),
                (
                    "data-incoming-label",
                    &self.translate(lang, "Incoming", &[]),
                ),
                (
                    "data-outgoing-label",
                    &self.translate(lang, "Outgoing", &[]),
                ),
                (
                    "data-contacts-label",
                    &self.translate(lang, "Contacts", &[]),
                ),
                (
                    "data-empty-label",
                    &self.translate(lang, "No invites yet.", &[]),
                ),
            ]),
            vec![],
        )
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/fragments/batch", post(batch))
        .route("/fragments/plan", get(plan))
        .route("/fragments/bootstrap", get(bootstrap))
        .route("/fragments/stream", get(stream_route))
        .route("/fragments/transport", get(transport_route))
        .route("/fragments", get(get_fragment_by_query))
        .route("/fragments/{id}", get(get_fragment_by_id))
}

async fn batch(
    State(state): State<AppState>,
    Query(query): Query<FragmentBundleQuery>,
    Json(body): Json<Vec<BatchRequest>>,
) -> Response {
    let protocol = parse_protocol(query.protocol.as_deref());
    let known = decode_known_versions(query.known.as_deref());
    if protocol == 2 {
        let mut frames = Vec::new();
        for request in body {
            let lang = normalize_lang(request.lang.as_deref().unwrap_or("en"));
            let refresh = request.refresh.unwrap_or(false);
            if let Some(entry) = state
                .fragments
                .get_fragment_entry(&request.id, &lang, refresh)
                .await
            {
                if known.get(&request.id).copied() == Some(entry.updated_at) && !refresh {
                    continue;
                }
                frames.push(build_fragment_frame(
                    &request.id,
                    &delivery_payload(&entry, protocol, true, true),
                ));
            }
        }
        binary_response(concat_bytes(&frames))
    } else {
        let mut payload = HashMap::<String, String>::new();
        for request in body {
            let lang = normalize_lang(request.lang.as_deref().unwrap_or("en"));
            let refresh = request.refresh.unwrap_or(false);
            if let Some(entry) = state
                .fragments
                .get_fragment_entry(&request.id, &lang, refresh)
                .await
            {
                payload.insert(
                    request.id,
                    STANDARD.encode(delivery_payload(&entry, 1, true, true)),
                );
            }
        }
        Json(payload).into_response()
    }
}

async fn plan(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<FragmentPlanQuery>,
) -> Response {
    let path = normalize_plan_path(query.path.as_deref().unwrap_or("/"));
    let lang = normalize_lang(query.lang.as_deref().unwrap_or("en"));
    let protocol = parse_protocol(query.protocol.as_deref());
    let include_initial = parse_truthy(query.include_initial.as_deref());
    let refresh =
        state.config.environment != "production" && parse_truthy(query.refresh.as_deref());

    if refresh {
        state.fragments.clear_plan_memo(&path, &lang).await;
    }

    let mut plan = state.fragments.get_fragment_plan(&path, &lang).await;
    let version = state.fragments.plan_version(&path, &lang).await;
    let etag = build_plan_etag(&plan, version);
    if !refresh && matches_if_none_match(&etag, headers.get("if-none-match")) {
        return Response::builder()
            .status(StatusCode::NOT_MODIFIED)
            .header("etag", etag)
            .body(Body::empty())
            .unwrap();
    }

    if include_initial {
        let targets = collect_boot_fragment_targets(&plan);
        let mut initial_fragments = HashMap::new();
        let mut initial_html = HashMap::new();
        for id in targets.ids {
            if let Some(entry) = state
                .fragments
                .get_fragment_entry(&id, &lang, refresh)
                .await
            {
                if protocol == 1 {
                    initial_fragments.insert(
                        id.clone(),
                        STANDARD.encode(delivery_payload(&entry, 1, true, true)),
                    );
                }
                if targets.html_ids.contains(&id) {
                    initial_html.insert(id, state.fragments.get_fragment_html(&entry));
                }
            }
        }
        if protocol == 1 && !initial_fragments.is_empty() {
            plan.initial_fragments = Some(initial_fragments);
        }
        if !initial_html.is_empty() {
            plan.initial_html = Some(initial_html);
        }
    }

    let bytes = serde_json::to_vec(&plan).unwrap_or_else(|_| b"{}".to_vec());
    Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/json")
        .header(
            "cache-control",
            "public, max-age=0, s-maxage=180, stale-while-revalidate=300",
        )
        .header("etag", etag)
        .body(Body::from(bytes))
        .unwrap()
}

async fn bootstrap(
    State(state): State<AppState>,
    Query(query): Query<FragmentBundleQuery>,
) -> Response {
    let path = normalize_plan_path(query.path.as_deref().unwrap_or("/"));
    let lang = normalize_lang(query.lang.as_deref().unwrap_or("en"));
    let protocol = parse_protocol(query.protocol.as_deref());
    let known = decode_known_versions(query.known.as_deref());
    let explicit_ids = parse_ids(query.ids.as_deref());
    let plan = state.fragments.get_fragment_plan(&path, &lang).await;
    let ids = if explicit_ids.is_empty() {
        collect_boot_fragment_targets(&plan).ids
    } else {
        explicit_ids
    };
    let payload = build_fragment_bundle(&state, &ids, &lang, protocol, &known, &plan, false).await;
    binary_response(payload)
}

async fn stream_route(
    State(state): State<AppState>,
    Query(query): Query<FragmentBundleQuery>,
) -> Response {
    let path = normalize_plan_path(query.path.as_deref().unwrap_or("/"));
    let lang = normalize_lang(query.lang.as_deref().unwrap_or("en"));
    let protocol = parse_protocol(query.protocol.as_deref());
    let live = query
        .live
        .as_deref()
        .map(|value| parse_truthy(Some(value)))
        .unwrap_or(true);
    let known = decode_known_versions(query.known.as_deref());
    let explicit_ids = parse_ids(query.ids.as_deref());
    stream_response(
        state,
        path,
        lang,
        protocol,
        live,
        known,
        explicit_ids,
        false,
    )
    .await
}

async fn transport_route(
    State(state): State<AppState>,
    Query(query): Query<FragmentBundleQuery>,
) -> Response {
    if !state.config.enable_webtransport_fragments {
        return (
            StatusCode::NOT_IMPLEMENTED,
            Json(serde_json::json!({
                "error": "WebTransport fragment streaming is disabled",
                "flag": "ENABLE_WEBTRANSPORT_FRAGMENTS"
            })),
        )
            .into_response();
    }

    let path = normalize_plan_path(query.path.as_deref().unwrap_or("/"));
    let lang = normalize_lang(query.lang.as_deref().unwrap_or("en"));
    let protocol = parse_protocol(query.protocol.as_deref());
    let live = query
        .live
        .as_deref()
        .map(|value| parse_truthy(Some(value)))
        .unwrap_or(true);
    let known = decode_known_versions(query.known.as_deref());
    let explicit_ids = parse_ids(query.ids.as_deref());
    let mut response =
        stream_response(state, path, lang, protocol, live, known, explicit_ids, true).await;
    response.headers_mut().insert(
        "x-fragment-transport",
        HeaderValue::from_static("webtransport-proxy"),
    );
    response
}

async fn get_fragment_by_query(
    State(state): State<AppState>,
    Query(query): Query<FragmentQuery>,
) -> Response {
    let Some(id) = query.id else {
        return (StatusCode::BAD_REQUEST, "Missing fragment id").into_response();
    };
    get_fragment_response(state, id, query.lang, query.protocol, query.refresh).await
}

async fn get_fragment_by_id(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Query(query): Query<FragmentQuery>,
) -> Response {
    get_fragment_response(state, id, query.lang, query.protocol, query.refresh).await
}

async fn get_fragment_response(
    state: AppState,
    id: String,
    lang: Option<String>,
    protocol: Option<String>,
    refresh: Option<String>,
) -> Response {
    let protocol = parse_protocol(protocol.as_deref());
    let lang = normalize_lang(lang.as_deref().unwrap_or("en"));
    let refresh = state.config.environment != "production" && parse_truthy(refresh.as_deref());
    let Some(entry) = state
        .fragments
        .get_fragment_entry(&id, &lang, refresh)
        .await
    else {
        return (StatusCode::NOT_FOUND, "Fragment not found").into_response();
    };
    binary_response(delivery_payload(&entry, protocol, true, true))
}

async fn stream_response(
    state: AppState,
    path: String,
    lang: String,
    protocol: u8,
    live: bool,
    known: HashMap<String, u64>,
    explicit_ids: Vec<String>,
    webtransport: bool,
) -> Response {
    let (tx, rx) = mpsc::channel::<Result<Bytes, Infallible>>(16);
    tokio::spawn(async move {
        let plan = state.fragments.get_fragment_plan(&path, &lang).await;
        let groups = build_stream_groups(&plan, &explicit_ids);
        for group in groups {
            let payload =
                build_fragment_bundle(&state, &group, &lang, protocol, &known, &plan, false).await;
            if !payload.is_empty() && tx.send(Ok(Bytes::from(payload))).await.is_err() {
                return;
            }
        }
        if protocol == 2 && live {
            let heartbeat = build_fragment_frame("", &[]);
            let mut interval = tokio::time::interval(Duration::from_millis(HEARTBEAT_MS));
            loop {
                interval.tick().await;
                if tx.send(Ok(Bytes::from(heartbeat.clone()))).await.is_err() {
                    break;
                }
            }
        }
    });

    let mut builder = Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/octet-stream")
        .header(
            "cache-control",
            "public, max-age=0, s-maxage=0, stale-while-revalidate=0",
        );
    if !webtransport {
        builder = builder.header("vary", "x-fragment-accept-encoding");
    }
    builder
        .body(Body::from_stream(ReceiverStream::new(rx)))
        .unwrap()
}

pub(crate) async fn build_fragment_bundle(
    state: &AppState,
    ids: &[String],
    lang: &str,
    protocol: u8,
    known: &HashMap<String, u64>,
    plan: &FragmentPlanResponse,
    refresh: bool,
) -> Vec<u8> {
    let requested = resolve_requested_plan_fragment_ids(plan, ids);
    let html_ids = collect_boot_fragment_targets(plan).html_ids;
    let mut frames = Vec::new();
    for id in requested {
        if let Some(entry) = state.fragments.get_fragment_entry(&id, lang, refresh).await {
            if known.get(&id).copied() == Some(entry.updated_at) && !refresh {
                continue;
            }
            let include_html = !html_ids.contains(&id);
            let payload = delivery_payload(&entry, protocol, !has_css_asset(&id), include_html);
            frames.push(build_fragment_frame(&id, &payload));
        }
    }
    concat_bytes(&frames)
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
    if explicit_ids.is_empty() {
        return plan
            .fragments
            .iter()
            .map(|entry| entry.id.clone())
            .collect();
    }
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

fn collect_boot_fragment_targets(plan: &FragmentPlanResponse) -> BootTargets {
    let entry_map = plan
        .fragments
        .iter()
        .map(|entry| (entry.id.clone(), entry.clone()))
        .collect::<HashMap<_, _>>();
    let html_ids = plan
        .fragments
        .iter()
        .filter(|entry| entry.boot_mode.as_deref() == Some("html"))
        .map(|entry| entry.id.clone())
        .collect::<Vec<_>>();
    let seeds = plan
        .fragments
        .iter()
        .filter(|entry| entry.boot_mode.as_deref() != Some("stream"))
        .map(|entry| entry.id.clone())
        .collect::<Vec<_>>();
    let mut required = HashSet::new();
    let mut stack = seeds;
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
    BootTargets {
        ids: plan
            .fragments
            .iter()
            .map(|entry| entry.id.clone())
            .filter(|id| required.contains(id))
            .collect(),
        html_ids,
    }
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
    let lower = lang.trim().to_ascii_lowercase();
    match lower.as_str() {
        "ja" | "ko" => lower,
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
    URL_SAFE_NO_PAD
        .decode(value.as_bytes())
        .ok()
        .and_then(|bytes| serde_json::from_slice::<HashMap<String, u64>>(&bytes).ok())
        .unwrap_or_default()
}

fn current_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_millis() as u64
}

fn build_plan_etag(plan: &FragmentPlanResponse, version: u64) -> String {
    let normalized = serde_json::to_vec(plan).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(version.to_le_bytes());
    hasher.update(&normalized);
    format!("\"{:x}\"", hasher.finalize())
}

fn matches_if_none_match(etag: &str, value: Option<&HeaderValue>) -> bool {
    let Some(value) = value.and_then(|header| header.to_str().ok()) else {
        return false;
    };
    value
        .split(',')
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
        .any(|candidate| {
            candidate == "*" || candidate == etag || candidate.strip_prefix("W/") == Some(etag)
        })
}

fn binary_response(bytes: Vec<u8>) -> Response {
    Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/octet-stream")
        .body(Body::from(bytes))
        .unwrap()
}

fn concat_bytes(chunks: &[Vec<u8>]) -> Vec<u8> {
    let total = chunks.iter().map(Vec::len).sum();
    let mut output = Vec::with_capacity(total);
    for chunk in chunks {
        output.extend_from_slice(chunk);
    }
    output
}

fn delivery_payload(
    entry: &FragmentEntry,
    protocol: u8,
    include_css: bool,
    include_html: bool,
) -> Vec<u8> {
    if protocol == 2 {
        encode_fragment_payload(entry, include_css, include_html)
    } else {
        encode_fragment_payload(entry, true, true)
    }
}

fn has_css_asset(id: &str) -> bool {
    matches!(
        id,
        STORE_STREAM_ID | STORE_CART_ID | STORE_CREATE_ID | CHAT_CONTACTS_ID
    )
}

fn encode_fragment_payload(
    entry: &FragmentEntry,
    include_css: bool,
    include_html: bool,
) -> Vec<u8> {
    let tree_bytes = encode_tree(&entry.tree);
    let head_bytes = serde_json::to_vec(&entry.head).unwrap_or_default();
    let css_bytes = if include_css {
        entry.css.as_bytes().to_vec()
    } else {
        Vec::new()
    };
    let meta_bytes = serde_json::to_vec(&entry.meta).unwrap_or_default();
    let html_bytes = if include_html {
        Some(entry.html.as_bytes().to_vec())
    } else {
        None
    };

    let use_v3 = !include_css || html_bytes.is_none();
    let header_size = if use_v3 {
        FRAGMENT_HEADER_SIZE_V3
    } else {
        FRAGMENT_HEADER_SIZE_V2
    };
    let total = header_size
        + tree_bytes.len()
        + head_bytes.len()
        + meta_bytes.len()
        + css_bytes.len()
        + html_bytes.as_ref().map_or(0, Vec::len);
    let mut out = vec![0_u8; total];
    out[0..4].copy_from_slice(&FRAGMENT_MAGIC.to_be_bytes());

    if use_v3 {
        out[4] = FRAGMENT_VERSION_V3;
        out[5] = (if include_css && !css_bytes.is_empty() {
            FRAGMENT_SECTION_CSS
        } else {
            0
        }) | (if include_html && html_bytes.as_ref().is_some_and(|bytes| !bytes.is_empty())
        {
            FRAGMENT_SECTION_HTML
        } else {
            0
        });
        out[8..12].copy_from_slice(&(tree_bytes.len() as u32).to_le_bytes());
        out[12..16].copy_from_slice(&(head_bytes.len() as u32).to_le_bytes());
        out[16..20].copy_from_slice(&(meta_bytes.len() as u32).to_le_bytes());
        out[20..24].copy_from_slice(&(css_bytes.len() as u32).to_le_bytes());
        out[24..28]
            .copy_from_slice(&(html_bytes.as_ref().map_or(0, Vec::len) as u32).to_le_bytes());
        let mut cursor = header_size;
        out[cursor..cursor + tree_bytes.len()].copy_from_slice(&tree_bytes);
        cursor += tree_bytes.len();
        out[cursor..cursor + head_bytes.len()].copy_from_slice(&head_bytes);
        cursor += head_bytes.len();
        out[cursor..cursor + meta_bytes.len()].copy_from_slice(&meta_bytes);
        cursor += meta_bytes.len();
        if !css_bytes.is_empty() {
            out[cursor..cursor + css_bytes.len()].copy_from_slice(&css_bytes);
            cursor += css_bytes.len();
        }
        if let Some(bytes) = &html_bytes {
            if !bytes.is_empty() {
                out[cursor..cursor + bytes.len()].copy_from_slice(bytes);
            }
        }
    } else {
        out[4] = FRAGMENT_VERSION_V2;
        out[8..12].copy_from_slice(&(tree_bytes.len() as u32).to_le_bytes());
        out[12..16].copy_from_slice(&(head_bytes.len() as u32).to_le_bytes());
        out[16..20].copy_from_slice(&(css_bytes.len() as u32).to_le_bytes());
        out[20..24].copy_from_slice(&(meta_bytes.len() as u32).to_le_bytes());
        out[24..28]
            .copy_from_slice(&(html_bytes.as_ref().map_or(0, Vec::len) as u32).to_le_bytes());
        let mut cursor = header_size;
        out[cursor..cursor + tree_bytes.len()].copy_from_slice(&tree_bytes);
        cursor += tree_bytes.len();
        out[cursor..cursor + head_bytes.len()].copy_from_slice(&head_bytes);
        cursor += head_bytes.len();
        out[cursor..cursor + css_bytes.len()].copy_from_slice(&css_bytes);
        cursor += css_bytes.len();
        out[cursor..cursor + meta_bytes.len()].copy_from_slice(&meta_bytes);
        cursor += meta_bytes.len();
        if let Some(bytes) = &html_bytes {
            out[cursor..cursor + bytes.len()].copy_from_slice(bytes);
        }
    }

    out
}

pub(crate) fn build_fragment_frame(id: &str, payload: &[u8]) -> Vec<u8> {
    let mut frame = Vec::with_capacity(8 + id.len() + payload.len());
    frame.extend_from_slice(&(id.len() as u32).to_le_bytes());
    frame.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    frame.extend_from_slice(id.as_bytes());
    frame.extend_from_slice(payload);
    frame
}

fn encode_tree(root: &RenderNode) -> Vec<u8> {
    #[derive(Clone)]
    struct NodeRecord {
        node_type: u8,
        tag_id: u32,
        text_id: u32,
        first_child: u32,
        next_sibling: u32,
        attr_start: u32,
        attr_count: u16,
    }

    fn string_id(strings: &mut Vec<String>, lookup: &mut HashMap<String, u32>, value: &str) -> u32 {
        if let Some(id) = lookup.get(value) {
            return *id;
        }
        let id = strings.len() as u32;
        strings.push(value.to_string());
        lookup.insert(value.to_string(), id);
        id
    }

    fn walk(
        node: &RenderNode,
        nodes: &mut Vec<NodeRecord>,
        attrs: &mut Vec<(u32, u32)>,
        strings: &mut Vec<String>,
        lookup: &mut HashMap<String, u32>,
    ) -> u32 {
        let index = nodes.len() as u32;
        nodes.push(NodeRecord {
            node_type: if node.node_type == "text" { 1 } else { 0 },
            tag_id: 0,
            text_id: 0,
            first_child: UINT32_MAX,
            next_sibling: UINT32_MAX,
            attr_start: attrs.len() as u32,
            attr_count: 0,
        });
        if node.node_type == "text" {
            nodes[index as usize].text_id =
                string_id(strings, lookup, node.text.as_deref().unwrap_or_default());
            return index;
        }
        nodes[index as usize].tag_id =
            string_id(strings, lookup, node.tag.as_deref().unwrap_or("div"));
        let attr_entries = node
            .attrs
            .clone()
            .unwrap_or_default()
            .into_iter()
            .collect::<Vec<_>>();
        nodes[index as usize].attr_count = attr_entries.len() as u16;
        for (name, value) in attr_entries {
            attrs.push((
                string_id(strings, lookup, &name),
                string_id(strings, lookup, &value),
            ));
        }
        let mut previous = UINT32_MAX;
        for child in node.children.clone().unwrap_or_default() {
            let child_index = walk(&child, nodes, attrs, strings, lookup);
            if nodes[index as usize].first_child == UINT32_MAX {
                nodes[index as usize].first_child = child_index;
            }
            if previous != UINT32_MAX {
                nodes[previous as usize].next_sibling = child_index;
            }
            previous = child_index;
        }
        index
    }

    let mut strings = Vec::new();
    let mut lookup = HashMap::new();
    let mut nodes = Vec::new();
    let mut attrs = Vec::new();
    walk(root, &mut nodes, &mut attrs, &mut strings, &mut lookup);
    let string_bytes = strings
        .iter()
        .map(|value| value.as_bytes().to_vec())
        .collect::<Vec<_>>();
    let strings_size = string_bytes
        .iter()
        .map(|bytes| 4 + bytes.len())
        .sum::<usize>();
    let total = 24 + (nodes.len() * TREE_NODE_SIZE) + (attrs.len() * ATTR_SIZE) + strings_size;
    let mut out = vec![0_u8; total];
    out[0..4].copy_from_slice(&TREE_MAGIC.to_be_bytes());
    out[4] = 1;
    out[8..12].copy_from_slice(&(nodes.len() as u32).to_le_bytes());
    out[12..16].copy_from_slice(&(attrs.len() as u32).to_le_bytes());
    out[16..20].copy_from_slice(&(strings.len() as u32).to_le_bytes());
    out[20..24].copy_from_slice(&(strings_size as u32).to_le_bytes());
    let mut cursor = 24;
    for node in nodes {
        out[cursor] = node.node_type;
        out[cursor + 2..cursor + 4].copy_from_slice(&node.attr_count.to_le_bytes());
        out[cursor + 4..cursor + 8].copy_from_slice(&node.tag_id.to_le_bytes());
        out[cursor + 8..cursor + 12].copy_from_slice(&node.text_id.to_le_bytes());
        out[cursor + 12..cursor + 16].copy_from_slice(&node.first_child.to_le_bytes());
        out[cursor + 16..cursor + 20].copy_from_slice(&node.next_sibling.to_le_bytes());
        out[cursor + 20..cursor + 24].copy_from_slice(&node.attr_start.to_le_bytes());
        cursor += TREE_NODE_SIZE;
    }
    for (name_id, value_id) in attrs {
        out[cursor..cursor + 4].copy_from_slice(&name_id.to_le_bytes());
        out[cursor + 4..cursor + 8].copy_from_slice(&value_id.to_le_bytes());
        cursor += ATTR_SIZE;
    }
    for bytes in string_bytes {
        out[cursor..cursor + 4].copy_from_slice(&(bytes.len() as u32).to_le_bytes());
        cursor += 4;
        out[cursor..cursor + bytes.len()].copy_from_slice(&bytes);
        cursor += bytes.len();
    }
    out
}

fn render_to_html(node: &RenderNode) -> String {
    if node.node_type == "text" {
        return escape_html(node.text.as_deref().unwrap_or_default());
    }
    let tag = node.tag.as_deref().unwrap_or("div");
    let attrs = node
        .attrs
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|(name, value)| {
            if value.is_empty() {
                format!(" {name}")
            } else {
                format!(" {name}=\"{}\"", escape_html(&value))
            }
        })
        .collect::<String>();
    let children = node
        .children
        .clone()
        .unwrap_or_default()
        .iter()
        .map(render_to_html)
        .collect::<String>();
    format!("<{tag}{attrs}>{children}</{tag}>")
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn load_translations() -> HashMap<String, HashMap<String, String>> {
    let mut translations = HashMap::new();
    for lang in ["en", "ja", "ko"] {
        if let Some(entries) = read_fragment_translations(lang) {
            translations.insert(lang.to_string(), entries);
        }
    }
    translations
}

fn read_fragment_translations(lang: &str) -> Option<HashMap<String, String>> {
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()?
        .parent()?
        .to_path_buf();
    let path = repo_root
        .join("apps")
        .join("site")
        .join("src")
        .join("lang")
        .join(format!("{lang}.json"));
    let raw = fs::read_to_string(path).ok()?;
    let parsed = serde_json::from_str::<serde_json::Value>(&raw).ok()?;
    let object = parsed.get("fragments")?.as_object()?;
    Some(
        object
            .iter()
            .filter_map(|(key, value)| value.as_str().map(|text| (key.clone(), text.to_string())))
            .collect(),
    )
}

fn load_fragment_css_files() -> HashMap<String, String> {
    let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|path| path.parent())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    let public_dir = repo_root
        .join("apps")
        .join("site")
        .join("public")
        .join("fragments");
    let chat_css =
        fs::read_to_string(public_dir.join("fragment-a1d4d8fc3b02.css")).unwrap_or_default();
    let store_css =
        fs::read_to_string(public_dir.join("fragment-bddbb00bca57.css")).unwrap_or_default();
    HashMap::from([
        (CHAT_CONTACTS_ID.to_string(), chat_css),
        (STORE_STREAM_ID.to_string(), store_css.clone()),
        (STORE_CART_ID.to_string(), store_css.clone()),
        (STORE_CREATE_ID.to_string(), store_css),
    ])
}

fn resolve_boot_mode(critical: bool, render_html: bool) -> String {
    if critical {
        if render_html {
            "html"
        } else {
            "binary"
        }
    } else {
        "stream"
    }
    .to_string()
}

fn home_fetch_groups(entries: &[FragmentPlanEntry]) -> Vec<Vec<String>> {
    let ids = entries
        .iter()
        .map(|entry| entry.id.as_str())
        .collect::<Vec<_>>();
    let mut groups = Vec::new();
    if ids.contains(&HOME_MANIFEST_ID) {
        groups.push(vec![HOME_MANIFEST_ID.to_string()]);
    }
    if ids.contains(&HOME_DOCK_ID) {
        groups.push(vec![HOME_DOCK_ID.to_string()]);
    }
    let secondary = entries
        .iter()
        .filter(|entry| entry.id != HOME_MANIFEST_ID && entry.id != HOME_DOCK_ID)
        .map(|entry| entry.id.clone())
        .collect::<Vec<_>>();
    if !secondary.is_empty() {
        groups.push(secondary);
    }
    groups
}

fn home_entry(
    id: &str,
    critical: bool,
    column: &str,
    size: Option<&str>,
    min_height: u32,
    depends_on: Option<Vec<String>>,
) -> FragmentPlanEntry {
    FragmentPlanEntry {
        id: id.to_string(),
        critical,
        layout: FragmentPlanEntryLayout {
            column: column.to_string(),
            size: size.map(ToString::to_string),
            min_height: Some(min_height),
            height_hint: Some(FragmentPlanEntryLayoutHint {
                desktop: Some(min_height),
                mobile: Some(min_height),
            }),
            height_profile: None,
        },
        render_html: Some(true),
        depends_on,
        boot_mode: None,
        cache: None,
    }
}

fn store_plan_entries() -> Vec<FragmentPlanEntry> {
    vec![
        home_entry(STORE_STREAM_ID, true, "span 12", Some("small"), 579, None)
            .with_render_html(false),
        home_entry(STORE_CART_ID, true, "span 6", Some("small"), 440, None)
            .with_render_html(false),
        home_entry(STORE_CREATE_ID, false, "span 6", Some("small"), 489, None)
            .with_render_html(false),
    ]
}

fn chat_plan_entries() -> Vec<FragmentPlanEntry> {
    vec![home_entry(
        CHAT_CONTACTS_ID,
        true,
        "span 12",
        Some("small"),
        489,
        None,
    )]
}

trait FragmentPlanEntryExt {
    fn with_render_html(self, render_html: bool) -> Self;
}

impl FragmentPlanEntryExt for FragmentPlanEntry {
    fn with_render_html(mut self, render_html: bool) -> Self {
        self.render_html = Some(render_html);
        self
    }
}

fn class_attr(value: &str) -> Option<HashMap<String, String>> {
    Some(HashMap::from([("class".to_string(), value.to_string())]))
}

fn map_attrs(values: Vec<(&str, &str)>) -> Option<HashMap<String, String>> {
    Some(
        values
            .into_iter()
            .map(|(name, value)| (name.to_string(), value.to_string()))
            .collect(),
    )
}

fn el(tag: &str, attrs: Option<HashMap<String, String>>, children: Vec<RenderNode>) -> RenderNode {
    RenderNode {
        node_type: "element".to_string(),
        tag: Some(tag.to_string()),
        attrs,
        children: Some(children),
        text: None,
    }
}

fn text(value: String) -> RenderNode {
    RenderNode {
        node_type: "text".to_string(),
        tag: None,
        attrs: None,
        children: None,
        text: Some(value),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{AppConfig, FeatureFlags};
    use crate::shared::AppState;
    use std::net::SocketAddr;
    use std::path::PathBuf;

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
            enable_webtransport_fragments: true,
            enable_webtransport_datagrams: true,
            webtransport_max_datagram_size: 1200,
            spacetime_uri: "http://127.0.0.1:3000".to_string(),
            spacetime_module: "prometheus-site-local".to_string(),
            garnet_host: "127.0.0.1".to_string(),
            garnet_port: 6379,
            auth: None,
            features: FeatureFlags {
                auth: true,
                store: true,
                messaging: true,
                realtime: true,
            },
        }
    }

    #[test]
    fn tree_encoding_preserves_magic_and_counts() {
        let tree = el(
            "section",
            class_attr("demo"),
            vec![el("h2", None, vec![text("Hello".to_string())])],
        );

        let bytes = encode_tree(&tree);

        assert_eq!(
            u32::from_be_bytes(bytes[0..4].try_into().unwrap()),
            TREE_MAGIC
        );
        assert_eq!(u32::from_le_bytes(bytes[8..12].try_into().unwrap()), 3);
        assert_eq!(u32::from_le_bytes(bytes[12..16].try_into().unwrap()), 1);
    }

    #[test]
    fn fragment_payload_switches_to_v3_when_css_is_omitted() {
        let entry = FragmentEntry {
            id: HOME_MANIFEST_ID.to_string(),
            tree: el("div", None, vec![text("payload".to_string())]),
            head: vec![],
            css: ".demo{}".to_string(),
            html: "<div>payload</div>".to_string(),
            meta: FragmentMeta {
                cache_key: "cache".to_string(),
                ttl: 180,
                stale_ttl: 300,
                tags: vec![],
                runtime: "rust".to_string(),
            },
            updated_at: 42,
        };

        let bytes = encode_fragment_payload(&entry, false, true);

        assert_eq!(bytes[4], FRAGMENT_VERSION_V3);
        assert_eq!(bytes[5] & FRAGMENT_SECTION_CSS, 0);
        assert_ne!(bytes[5] & FRAGMENT_SECTION_HTML, 0);
    }

    #[tokio::test]
    async fn bundle_skips_known_fragment_versions() {
        let state = AppState::new(test_config()).await.expect("state");
        let plan = state.fragments.get_fragment_plan("/", "en").await;
        let ids = vec![HOME_MANIFEST_ID.to_string()];
        let entry = state
            .fragments
            .get_fragment_entry(HOME_MANIFEST_ID, "en", false)
            .await
            .expect("entry");

        let known = HashMap::from([(HOME_MANIFEST_ID.to_string(), entry.updated_at)]);
        let payload = build_fragment_bundle(&state, &ids, "en", 2, &known, &plan, false).await;

        assert!(payload.is_empty());
    }

    #[test]
    fn store_plan_uses_half_width_secondary_cards() {
        let plan = store_plan_entries();
        let columns = plan
            .iter()
            .map(|entry| entry.layout.column.as_str())
            .collect::<Vec<_>>();

        assert_eq!(columns, vec!["span 12", "span 6", "span 6"]);
    }
}

fn pill(value: String) -> RenderNode {
    el("li", class_attr("home-manifest-pill"), vec![text(value)])
}

fn metric(value: String) -> RenderNode {
    el("li", class_attr("home-fragment-metric"), vec![text(value)])
}

fn badge(value: String, class_name: &str) -> RenderNode {
    el("span", class_attr(class_name), vec![text(value)])
}

fn demo_shell(kind: &str, title: &str, summary: &str, meta: &str) -> RenderNode {
    el(
        "div",
        map_attrs(vec![
            (
                "class",
                &format!("home-demo-compact home-demo-compact--{kind}"),
            ),
            ("data-home-preview", "compact"),
            ("data-home-demo-root", kind),
            ("data-demo-kind", kind),
        ]),
        vec![
            el(
                "div",
                class_attr("home-demo-compact-kicker"),
                vec![text(title.to_string())],
            ),
            el(
                "p",
                class_attr("home-demo-compact-copy"),
                vec![text(summary.to_string())],
            ),
            el(
                "p",
                class_attr("home-demo-compact-meta"),
                vec![text(meta.to_string())],
            ),
        ],
    )
}

fn widget_marker(
    id: &str,
    kind: &str,
    priority: &str,
    props: Option<serde_json::Value>,
    shell: RenderNode,
) -> RenderNode {
    let widget_id = format!("{id}::{kind}::shell");
    let mut children = vec![el(
        "div",
        map_attrs(vec![
            ("data-fragment-widget-shell", "true"),
            ("data-fragment-widget-mount", "true"),
        ]),
        vec![shell],
    )];
    if let Some(props) = props {
        children.push(el(
            "script",
            map_attrs(vec![
                ("type", "application/json"),
                ("data-fragment-widget-props", "true"),
            ]),
            vec![text(props.to_string())],
        ));
    }
    el(
        "div",
        map_attrs(vec![
            ("data-fragment-widget", kind),
            ("data-fragment-widget-id", &widget_id),
            ("data-fragment-widget-priority", priority),
            ("data-fragment-widget-hydrated", "false"),
        ]),
        children,
    )
}

fn render_home_demo_section(
    meta_line: &str,
    headline: &str,
    lead: &str,
    detail: Option<&str>,
    widget: RenderNode,
    tail: Option<RenderNode>,
) -> RenderNode {
    let mut copy_children = vec![el(
        "strong",
        class_attr("home-fragment-copy-lead"),
        vec![text(lead.to_string())],
    )];
    if let Some(detail) = detail {
        copy_children.push(text(detail.to_string()));
    }
    let mut children = vec![
        el(
            "div",
            class_attr("meta-line"),
            vec![text(meta_line.to_string())],
        ),
        el("h2", None, vec![text(headline.to_string())]),
        el("p", class_attr("home-fragment-copy"), copy_children),
        widget,
    ];
    if let Some(tail) = tail {
        children.push(tail);
    }
    el("section", None, children)
}
