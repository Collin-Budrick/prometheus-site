use crate::config::AppConfig;
use anyhow::Context;
use redis::Client;
use std::sync::Arc;
use yrs_axum::signaling::SignalingService;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub http: reqwest::Client,
    pub redis: Client,
    pub fragments: Arc<crate::fragments::FragmentService>,
    pub home_collab: Arc<crate::home_collab::HomeCollabState>,
    pub store: Arc<crate::store::StoreState>,
    pub chat: Arc<crate::chat::ChatState>,
    pub yjs_signaling: SignalingService,
}

impl AppState {
    pub async fn new(config: AppConfig) -> anyhow::Result<Self> {
        let redis_url = format!("redis://{}:{}/", config.garnet_host, config.garnet_port);
        let redis = Client::open(redis_url).context("failed to create Redis client")?;
        let http = reqwest::Client::builder()
            .build()
            .context("failed to create HTTP client")?;
        let store = Arc::new(crate::store::StoreState::new());
        let fragments = Arc::new(crate::fragments::FragmentService::new(
            config.features.clone(),
        ));
        let home_collab = Arc::new(crate::home_collab::HomeCollabState::new());
        let chat = Arc::new(crate::chat::ChatState::new());
        let yjs_signaling = SignalingService::new();

        Ok(Self {
            config: Arc::new(config),
            http,
            redis,
            fragments,
            home_collab,
            store,
            chat,
            yjs_signaling,
        })
    }
}
