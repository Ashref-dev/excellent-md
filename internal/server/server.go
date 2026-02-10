package server

import (
	"context"
	"encoding/json"
	"errors"
	"expvar"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"excellent-md/internal/config"
	"excellent-md/internal/convert"
	"excellent-md/internal/storage"
	"excellent-md/web"
)

var (
	requestsTotal    = expvar.NewInt("requests_total")
	conversionsTotal = expvar.NewInt("conversions_total")
	conversionErrors = expvar.NewInt("conversion_errors_total")
	sheetErrorsTotal = expvar.NewInt("sheet_errors_total")
)

type apiError struct {
	OK    bool   `json:"ok"`
	Error string `json:"error"`
}

type apiResponse struct {
	OK bool `json:"ok"`
	convert.Result
}

// App holds the HTTP handler and optional resources.
type App struct {
	Handler http.Handler
	store   storage.Store
}

// Close releases any held resources.
func (app *App) Close() error {
	if app == nil || app.store == nil {
		return nil
	}
	return app.store.Close()
}

// New returns the HTTP app and optionally connects to storage.
func New(cfg config.Config) (*App, error) {
	store, err := setupStore(cfg)
	if err != nil {
		return nil, err
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/convert", convertHandler(cfg, store))
	mux.HandleFunc("/health", healthHandler)
	if cfg.EnableDebugVars {
		mux.Handle("/debug/vars", expvar.Handler())
	}

	staticHandler := web.Handler()
	mux.Handle("/", staticHandler)

	handler := loggingMiddleware(securityHeadersMiddleware(mux))

	return &App{Handler: handler, store: store}, nil
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

func convertHandler(cfg config.Config, store storage.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		requestsTotal.Add(1)
		start := time.Now()
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, cfg.MaxUploadBytes)
		if err := r.ParseMultipartForm(cfg.MaxUploadBytes); err != nil {
			conversionErrors.Add(1)
			writeError(w, http.StatusBadRequest, "Unable to read upload. Make sure the file is under the size limit.")
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			conversionErrors.Add(1)
			writeError(w, http.StatusBadRequest, "Missing file upload.")
			return
		}
		defer file.Close()

		if !strings.EqualFold(filepath.Ext(header.Filename), ".xlsx") {
			conversionErrors.Add(1)
			writeError(w, http.StatusBadRequest, "Only .xlsx files are supported.")
			return
		}

		payload, err := readUpload(file, cfg.MaxUploadBytes)
		if err != nil {
			conversionErrors.Add(1)
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), cfg.ConversionTimeout)
		defer cancel()

		result, err := convert.Convert(ctx, payload, convert.Options{
			IncludeHiddenSheets: cfg.IncludeHiddenSheets,
			MaxSheets:           cfg.MaxSheets,
			MaxCellsPerSheet:    cfg.MaxCellsPerSheet,
		})
		durationMs := time.Since(start).Milliseconds()
		record := buildRecord(header.Filename, result, durationMs, err)
		if store != nil {
			storeCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			if recordErr := store.RecordConversion(storeCtx, record); recordErr != nil {
				fmt.Printf("storage error: %v\n", recordErr)
			}
			cancel()
		}
		if err != nil {
			conversionErrors.Add(1)
			status := http.StatusBadRequest
			if errors.Is(err, convert.ErrConversionTimeout) {
				status = http.StatusRequestTimeout
			}
			writeError(w, status, err.Error())
			return
		}

		conversionsTotal.Add(1)
		for _, sheet := range result.Sheets {
			if sheet.Error != "" {
				sheetErrorsTotal.Add(1)
			}
		}

		writeJSON(w, http.StatusOK, apiResponse{OK: true, Result: result})
	}
}

func readUpload(file multipart.File, limit int64) ([]byte, error) {
	payload, err := io.ReadAll(file)
	if err != nil {
		return nil, fmt.Errorf("failed to read upload")
	}
	if int64(len(payload)) > limit {
		return nil, fmt.Errorf("file exceeds maximum size")
	}
	return payload, nil
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, apiError{OK: false, Error: message})
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")
	_ = encoder.Encode(payload)
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		wrapped := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(wrapped, r)
		duration := time.Since(start)
		fmt.Printf("%s %s %d %s\n", r.Method, r.URL.Path, wrapped.status, duration)
	})
}

func securityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' https://cdn.jsdelivr.net; connect-src 'self'")
		next.ServeHTTP(w, r)
	})
}

func setupStore(cfg config.Config) (storage.Store, error) {
	if cfg.DatabaseURL == "" {
		return nil, nil
	}
	store, err := storage.NewPostgresStore(context.Background(), storage.PostgresConfig{
		DatabaseURL:     cfg.DatabaseURL,
		MaxOpenConns:    cfg.DBMaxOpenConns,
		MaxIdleConns:    cfg.DBMaxIdleConns,
		ConnMaxLifetime: cfg.DBConnMaxLifetime,
		ConnMaxIdleTime: cfg.DBConnMaxIdleTime,
	})
	if err != nil {
		return nil, err
	}
	return store, nil
}

func buildRecord(filename string, result convert.Result, durationMs int64, err error) storage.ConversionRecord {
	record := storage.ConversionRecord{
		Filename:   filename,
		SheetCount: result.Meta.SheetCount,
		Processed:  result.Meta.Processed,
		Skipped:    result.Meta.SkippedCount,
		DurationMs: durationMs,
		Sheets:     []storage.SheetRecord{},
	}
	if err != nil {
		record.Error = err.Error()
	}
	for _, sheet := range result.Sheets {
		record.Sheets = append(record.Sheets, storage.SheetRecord{
			Name:     sheet.Name,
			RowCount: sheet.RowCount,
			ColCount: sheet.ColCount,
			Warnings: sheet.Warnings,
			Error:    sheet.Error,
		})
	}
	return record
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}
