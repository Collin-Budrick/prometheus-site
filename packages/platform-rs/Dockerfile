# syntax=docker/dockerfile:1.5
FROM rust:1.88-bookworm AS builder
WORKDIR /app

COPY packages/platform-rs ./packages/platform-rs
COPY apps/site/src/lang ./apps/site/src/lang
COPY apps/site/public/fragments ./apps/site/public/fragments

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/packages/platform-rs/target \
    cargo build --manifest-path packages/platform-rs/Cargo.toml --locked --release \
    && cp /app/packages/platform-rs/target/release/prometheus-platform-rs /tmp/prometheus-platform-rs

FROM debian:bookworm-slim AS runner
WORKDIR /app/packages/platform-rs

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=4000

COPY --from=builder /tmp/prometheus-platform-rs ./prometheus-platform-rs
COPY --from=builder /app/apps/site/src/lang /app/apps/site/src/lang
COPY --from=builder /app/apps/site/public/fragments /app/apps/site/public/fragments

EXPOSE 4000
EXPOSE 4444/udp

CMD ["./prometheus-platform-rs"]
