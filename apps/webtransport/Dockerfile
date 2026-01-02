FROM golang:1.25.5-alpine AS build
WORKDIR /app
COPY apps/webtransport/go.mod apps/webtransport/go.sum ./
RUN go mod download
COPY apps/webtransport ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/webtransport ./

FROM gcr.io/distroless/base-debian12
COPY --from=build /out/webtransport /usr/bin/webtransport
EXPOSE 4444/udp
ENTRYPOINT ["/usr/bin/webtransport"]
