package main

import (
	"encoding/binary"
	"crypto/tls"
	"net/http"
	"testing"

	"github.com/quic-go/quic-go/http3"
)

func TestNewWebTransportServerConfiguresHTTP3TLS(t *testing.T) {
	server := newWebTransportServer(
		config{
			addr: ":4444",
		},
		http.NewServeMux(),
	)

	if server.H3 == nil {
		t.Fatal("expected HTTP/3 server to be configured")
	}
	if server.H3.TLSConfig == nil {
		t.Fatal("expected TLS config to be configured")
	}
	if got, want := server.H3.TLSConfig.NextProtos, []string{http3.NextProtoH3}; len(got) != len(want) || got[0] != want[0] {
		t.Fatalf("expected NextProtos %v, got %v", want, got)
	}
	if len(server.H3.TLSConfig.Certificates) != 0 {
		t.Fatalf("expected certificates to be injected later, got %d", len(server.H3.TLSConfig.Certificates))
	}
	if server.H3.ConnContext == nil {
		t.Fatal("expected WebTransport HTTP/3 connection context hook to be configured")
	}
	if !server.H3.EnableDatagrams {
		t.Fatal("expected HTTP/3 datagrams to be enabled")
	}
	if server.H3.QUICConfig == nil {
		t.Fatal("expected QUIC config to be configured")
	}
	if server.H3.QUICConfig.KeepAlivePeriod <= 0 {
		t.Fatal("expected QUIC keepalive to be enabled")
	}
	if server.H3.QUICConfig.MaxIdleTimeout <= 0 {
		t.Fatal("expected QUIC max idle timeout to be configured")
	}

	cloned := server.H3.TLSConfig.Clone()
	cloned.Certificates = []tls.Certificate{{}}
	if len(server.H3.TLSConfig.Certificates) != 0 {
		t.Fatal("expected original TLS config to remain unchanged after clone mutation")
	}
}

func TestShouldSendFrameAsDatagramKeepsHeartbeatOnStream(t *testing.T) {
	heartbeat := make([]byte, 8)
	if shouldSendFrameAsDatagram(heartbeat, 1200) {
		t.Fatal("expected heartbeat frames to stay on the bidirectional stream")
	}

	frame := make([]byte, 8+2+4)
	binary.LittleEndian.PutUint32(frame[0:4], 2)
	binary.LittleEndian.PutUint32(frame[4:8], 4)
	copy(frame[8:10], []byte("id"))
	copy(frame[10:], []byte("test"))

	if !shouldSendFrameAsDatagram(frame, 1200) {
		t.Fatal("expected regular fragment frames under the datagram size limit to use datagrams")
	}
}
