package main

import (
  "context"
  "errors"
  "fmt"
  "io"
  "log"
  "net"
  "net/http"
  "net/url"
  "os"
  "strings"
  "time"

  "github.com/quic-go/quic-go"
  "github.com/quic-go/quic-go/http3"
  "github.com/quic-go/webtransport-go"
)

type config struct {
  addr            string
  apiBase         string
  certPath        string
  keyPath         string
  upstreamTimeout time.Duration
  allowedOrigins  map[string]struct{}
  allowAnyOrigin  bool
}

func loadConfig() config {
  addr := getEnv("WEBTRANSPORT_LISTEN_ADDR", ":4444")
  apiBase := strings.TrimRight(getEnv("WEBTRANSPORT_API_BASE", "http://api:4000"), "/")
  certPath := getEnv("WEBTRANSPORT_CERT_PATH", "/etc/caddy/certs/prometheus.dev+prometheus.prod.pem")
  keyPath := getEnv("WEBTRANSPORT_KEY_PATH", "/etc/caddy/certs/prometheus.dev+prometheus.prod.key")
  timeout := parseDuration(getEnv("WEBTRANSPORT_UPSTREAM_TIMEOUT", "0s"))
  allowedOrigins := parseAllowedOrigins(getEnv("WEBTRANSPORT_ALLOWED_ORIGINS", ""))
  allowAnyOrigin := isTruthyFlag(getEnv("WEBTRANSPORT_ALLOW_ANY_ORIGIN", ""))

  return config{
    addr:            addr,
    apiBase:         apiBase,
    certPath:        certPath,
    keyPath:         keyPath,
    upstreamTimeout: timeout,
    allowedOrigins:  allowedOrigins,
    allowAnyOrigin:  allowAnyOrigin,
  }
}

func getEnv(key, fallback string) string {
  if value := os.Getenv(key); strings.TrimSpace(value) != "" {
    return value
  }
  return fallback
}

func parseDuration(raw string) time.Duration {
  value := strings.TrimSpace(raw)
  if value == "" {
    return 0
  }
  parsed, err := time.ParseDuration(value)
  if err != nil {
    return 0
  }
  return parsed
}

func isTruthyFlag(value string) bool {
  normalized := strings.TrimSpace(strings.ToLower(value))
  return normalized == "1" || normalized == "true" || normalized == "yes"
}

func buildStreamURL(apiBase, path string) string {
  if path == "" {
    path = "/"
  }
  values := url.Values{}
  values.Set("path", path)
  return fmt.Sprintf("%s/fragments/stream?%s", apiBase, values.Encode())
}

func normalizeOriginHost(raw string) string {
  value := strings.TrimSpace(raw)
  if value == "" {
    return ""
  }
  if strings.Contains(value, "://") {
    parsed, err := url.Parse(value)
    if err != nil {
      return ""
    }
    return normalizeHost(parsed.Host)
  }
  return normalizeHost(value)
}

func parseAllowedOrigins(raw string) map[string]struct{} {
  allowed := map[string]struct{}{}
  for _, entry := range strings.Split(raw, ",") {
    host := normalizeOriginHost(entry)
    if host == "" {
      continue
    }
    allowed[strings.ToLower(host)] = struct{}{}
  }
  return allowed
}

func resolveOriginHost(r *http.Request) string {
  origin := strings.TrimSpace(r.Header.Get("Origin"))
  if origin == "" {
    return ""
  }
  parsed, err := url.Parse(origin)
  if err != nil {
    return ""
  }
  return strings.TrimSpace(parsed.Hostname())
}

func normalizeHost(raw string) string {
  value := strings.TrimSpace(raw)
  if value == "" {
    return ""
  }
  if strings.Contains(value, ",") {
    parts := strings.Split(value, ",")
    value = strings.TrimSpace(parts[0])
  }
  if host, _, err := net.SplitHostPort(value); err == nil {
    return host
  }
  return value
}

func isOriginAllowed(r *http.Request, cfg config) bool {
  if cfg.allowAnyOrigin {
    return true
  }
  originHost := resolveOriginHost(r)
  if originHost == "" {
    return true
  }
  originKey := strings.ToLower(originHost)
  if len(cfg.allowedOrigins) > 0 {
    if _, ok := cfg.allowedOrigins[originKey]; ok {
      return true
    }
  }
  forwardedHost := normalizeHost(r.Header.Get("X-Forwarded-Host"))
  host := forwardedHost
  if host == "" {
    host = normalizeHost(r.Host)
  }
  if host == "" {
    log.Printf("webtransport origin rejected: origin=%q host=%q forwarded=%q", r.Header.Get("Origin"), r.Host, r.Header.Get("X-Forwarded-Host"))
    return false
  }
  allowed := strings.EqualFold(originHost, host)
  if !allowed {
    log.Printf("webtransport origin rejected: origin=%q host=%q forwarded=%q", r.Header.Get("Origin"), r.Host, r.Header.Get("X-Forwarded-Host"))
  }
  return allowed
}

func main() {
  cfg := loadConfig()

  mux := http.NewServeMux()
  server := webtransport.Server{
    CheckOrigin: func(r *http.Request) bool {
      return isOriginAllowed(r, cfg)
    },
    H3: http3.Server{
      Addr:       cfg.addr,
      Handler:    mux,
      QUICConfig: &quic.Config{EnableDatagrams: true},
    },
  }

  mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
    w.WriteHeader(http.StatusOK)
    _, _ = w.Write([]byte("ok"))
  })

  handler := func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodConnect {
      w.Header().Set("Allow", http.MethodConnect)
      http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
      return
    }

    session, err := server.Upgrade(w, r)
    if err != nil {
      log.Printf("webtransport upgrade failed: %v", err)
      return
    }
    log.Printf("webtransport session established: origin=%q host=%q path=%q", r.Header.Get("Origin"), r.Host, r.URL.Path)

    go handleSession(session, r, cfg)
  }

  mux.HandleFunc("/fragments/transport", handler)
  mux.HandleFunc("/api/fragments/transport", handler)

  log.Printf("webtransport listening on %s", cfg.addr)
  if err := server.ListenAndServeTLS(cfg.certPath, cfg.keyPath); err != nil && !errors.Is(err, http.ErrServerClosed) {
    log.Fatalf("webtransport server failed: %v", err)
  }
}

func handleSession(session *webtransport.Session, r *http.Request, cfg config) {
  path := r.URL.Query().Get("path")
  if path == "" {
    path = "/"
  }
  log.Printf("webtransport handling path=%q", path)

  ctx := context.Background()
  if cfg.upstreamTimeout > 0 {
    var cancel context.CancelFunc
    ctx, cancel = context.WithTimeout(ctx, cfg.upstreamTimeout)
    defer cancel()
  }

  stream, err := session.OpenStreamSync(ctx)
  if err != nil {
    log.Printf("webtransport open stream failed: %v", err)
    _ = session.CloseWithError(0, "stream open failed")
    return
  }
  defer func() {
    _ = stream.Close()
  }()

  req, err := http.NewRequestWithContext(ctx, http.MethodGet, buildStreamURL(cfg.apiBase, path), nil)
  if err != nil {
    log.Printf("webtransport build upstream request failed: %v", err)
    return
  }

  if cookie := r.Header.Get("Cookie"); cookie != "" {
    req.Header.Set("Cookie", cookie)
  }
  if auth := r.Header.Get("Authorization"); auth != "" {
    req.Header.Set("Authorization", auth)
  }

  client := &http.Client{}
  if cfg.upstreamTimeout > 0 {
    client.Timeout = cfg.upstreamTimeout
  }

  resp, err := client.Do(req)
  if err != nil {
    log.Printf("webtransport upstream request failed: %v", err)
    _ = session.CloseWithError(0, "upstream request failed")
    return
  }
  defer resp.Body.Close()

  log.Printf("webtransport upstream status %d", resp.StatusCode)
  if resp.StatusCode != http.StatusOK {
    log.Printf("webtransport upstream status %d", resp.StatusCode)
    _ = session.CloseWithError(0, fmt.Sprintf("upstream status %d", resp.StatusCode))
    return
  }

  bytesWritten, err := io.Copy(stream, resp.Body)
  if err != nil {
    log.Printf("webtransport stream copy failed after %d bytes: %v", bytesWritten, err)
    _ = session.CloseWithError(0, "stream copy failed")
    return
  }
  log.Printf("webtransport stream copy complete bytes=%d", bytesWritten)
}
