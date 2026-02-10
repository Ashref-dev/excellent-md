package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"excellent-md/internal/config"
	"excellent-md/internal/server"
)

func main() {
	cfg := config.Load()

	app, err := server.New(cfg)
	if err != nil {
		fmt.Printf("server setup error: %v\n", err)
		os.Exit(1)
	}
	defer func() {
		_ = app.Close()
	}()

	httpServer := &http.Server{
		Addr:              cfg.Addr,
		Handler:           app.Handler,
		ReadTimeout:       15 * time.Second,
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-shutdown
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(ctx)
	}()

	fmt.Printf("Excellent-MD server listening on %s\n", cfg.Addr)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		fmt.Printf("server error: %v\n", err)
		os.Exit(1)
	}
}
