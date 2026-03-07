# syntax=docker/dockerfile:1.5
FROM caddy:2.11.2-builder-alpine AS builder
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    xcaddy build --with github.com/ueffel/caddy-brotli

FROM caddy:2.11.2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
