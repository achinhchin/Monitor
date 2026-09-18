package main

import (
	"bufio"
	"context"
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

//go:embed web
var webFS embed.FS

func main() {
	mode := flag.String("mode", "", "server mode: http or https (prompted when omitted)")
	addr := flag.String("addr", ":3000", "listen address")
	cert := flag.String("cert", "./certs/cert.pem", "TLS certificate (https mode)")
	key := flag.String("key", "./certs/key.pem", "TLS private key (https mode)")
	data := flag.String("data", "./data/state.json", "file used to persist notes and environment")
	flag.Parse()

	m := strings.ToLower(strings.TrimSpace(*mode))
	if m == "" {
		m = chooseMode(*cert, *key)
	}
	if m != "http" && m != "https" {
		log.Fatalf("unknown mode %q (use http or https)", m)
	}
	if m == "https" {
		for _, f := range []string{*cert, *key} {
			if _, err := os.Stat(f); err != nil {
				log.Fatalf("https mode needs %s: %v", f, err)
			}
		}
	}

	hub := NewHub(*data)
	go hub.Run()

	sub, _ := fs.Sub(webFS, "web")
	static := http.FileServer(http.FS(sub))

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", hub.ServeWS)
	mux.HandleFunc("/control", redirect("/control/"))
	mux.HandleFunc("/monitor", redirect("/monitor/"))
	mux.Handle("/", noCache(static))

	srv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	scheme := m
	printURLs(scheme, *addr)

	go func() {
		var err error
		if m == "https" {
			err = srv.ListenAndServeTLS(*cert, *key)
		} else {
			err = srv.ListenAndServe()
		}
		if err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	log.Println("shutting down…")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	hub.Shutdown()
	_ = srv.Shutdown(ctx)
}

// chooseMode asks the operator for http/https when running in a terminal.
// Without a terminal (service, pipe) it picks https when certs exist, else http.
func chooseMode(cert, key string) string {
	certsExist := fileExists(cert) && fileExists(key)
	fi, err := os.Stdin.Stat()
	interactive := err == nil && fi.Mode()&os.ModeCharDevice != 0
	if !interactive {
		if certsExist {
			return "https"
		}
		return "http"
	}

	def := "1"
	if certsExist {
		def = "2"
	}
	fmt.Println()
	fmt.Println("  ◐  Monitor server")
	fmt.Println("  ─────────────────────────────────────────────")
	fmt.Println("   1) HTTP   – quick local testing")
	status := "found"
	if !certsExist {
		status = "missing!"
	}
	fmt.Printf("   2) HTTPS  – uses %s + %s (%s)\n", cert, key, status)
	fmt.Printf("  Choose [%s]: ", def)

	line, _ := bufio.NewReader(os.Stdin).ReadString('\n')
	line = strings.TrimSpace(strings.ToLower(line))
	if line == "" {
		line = def
	}
	switch line {
	case "2", "https", "s":
		return "https"
	default:
		return "http"
	}
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func redirect(to string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, to, http.StatusMovedPermanently)
	}
}

func noCache(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/shared/") {
			w.Header().Set("Cache-Control", "no-cache")
		}
		h.ServeHTTP(w, r)
	})
}

func printURLs(scheme, addr string) {
	_, port, err := net.SplitHostPort(addr)
	if err != nil {
		port = "3000"
	}
	hosts := []string{"localhost"}
	if ifaces, err := net.InterfaceAddrs(); err == nil {
		for _, a := range ifaces {
			if ipn, ok := a.(*net.IPNet); ok && !ipn.IP.IsLoopback() && ipn.IP.To4() != nil {
				hosts = append(hosts, ipn.IP.String())
			}
		}
	}
	fmt.Println()
	fmt.Printf("  serving %s on %s\n", strings.ToUpper(scheme), addr)
	for _, h := range hosts {
		fmt.Printf("   control → %s://%s:%s/control/\n", scheme, h, port)
		fmt.Printf("   monitor → %s://%s:%s/monitor/\n", scheme, h, port)
	}
	fmt.Println()
}
