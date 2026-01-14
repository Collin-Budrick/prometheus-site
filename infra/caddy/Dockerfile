# syntax=docker/dockerfile:1.5
FROM caddy:2.11.0-beta.1-builder-alpine AS builder
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    xcaddy build --with github.com/ueffel/caddy-brotli

FROM caddy:2.11.0-beta.1-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
