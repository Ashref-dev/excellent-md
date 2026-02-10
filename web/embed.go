package web

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed index.html assets/*
var content embed.FS

// Handler returns a static file handler for the embedded frontend.
func Handler() http.Handler {
	sub, err := fs.Sub(content, ".")
	if err != nil {
		return http.NotFoundHandler()
	}
	fileServer := http.FileServer(http.FS(sub))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			r.URL.Path = "/index.html"
		}
		fileServer.ServeHTTP(w, r)
	})
}
