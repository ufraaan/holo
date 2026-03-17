package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/getsentry/sentry-go"
	sentryhttp "github.com/getsentry/sentry-go/http"
	"github.com/ufraaan/holo/internal/server"
)

func main() {
	if err := sentry.Init(sentry.ClientOptions{
		Dsn: os.Getenv("SENTRY_DSN"),
	}); err != nil {
		log.Printf(`{"level":"error","msg":"sentry_init_failed","error":%q}`, err)
	}
	defer sentry.Flush(2 * time.Second)

	addr := getEnv("HOLO_ADDR", ":8080")

	hub := server.NewHub(10 * time.Minute)
	go hub.Run()

	sentryHandler := sentryhttp.New(sentryhttp.Options{
		Repanic: true,
	})

	mux := http.NewServeMux()
	mux.Handle("/ws", sentryHandler.Handle(server.NewWSHandler(hub)))
	mux.HandleFunc("/health", sentryHandler.HandleFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))

	srv := &http.Server{
		Addr:         addr,
		Handler:      withCORS(mux),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	log.Print(`{"level":"info","msg":"holo_listening","addr":"` + addr + `"}`)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf(`{"level":"error","msg":"server_error","error":%q}`, err)
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
