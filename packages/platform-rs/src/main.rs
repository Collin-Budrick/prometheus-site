use anyhow::Context;
use prometheus_platform_rs::app;
use prometheus_platform_rs::config::AppConfig;
use prometheus_platform_rs::shared::AppState;
use prometheus_platform_rs::transport;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_tracing();

    let config = AppConfig::load().context("failed to load Rust platform config")?;
    let state = AppState::new(config.clone()).await?;

    let http = tokio::spawn(app::run_http_server(config.clone(), state.clone()));
    let wt = tokio::spawn(transport::run_webtransport_server(config, state));

    tokio::select! {
        result = http => {
            result.context("HTTP task join failed")??;
        }
        result = wt => {
            result.context("WebTransport task join failed")??;
        }
        _ = tokio::signal::ctrl_c() => {
            tracing::info!("ctrl-c received, shutting down Rust platform");
        }
    }

    Ok(())
}

fn init_tracing() {
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_target(true)
        .with_level(true)
        .compact()
        .init();
}
