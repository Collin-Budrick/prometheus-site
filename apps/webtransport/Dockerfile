# syntax=docker/dockerfile:1.5
FROM golang:1.25.6-alpine AS build
WORKDIR /app
COPY apps/webtransport/go.mod apps/webtransport/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download
COPY apps/webtransport ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -o /out/webtransport ./

FROM gcr.io/distroless/base-debian12
COPY --from=build /out/webtransport /usr/bin/webtransport
EXPOSE 4444/udp
ENTRYPOINT ["/usr/bin/webtransport"]
