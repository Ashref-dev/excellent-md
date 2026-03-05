Excellent-MD

Multi-sheet XLSX to Markdown converter with a focused, clean UI. Upload an .xlsx workbook and get Markdown for every sheet, with preview, copy, and download actions.

Features
- Converts all sheets in a workbook, not just the first
- Markdown table output per sheet with combined export
- Drag and drop upload, progress feedback, and copy/download controls
- Handles large workbooks with limits and per-sheet warnings
- Stateless by default, with optional PostgreSQL persistence for conversion metadata

Requirements
- Go 1.25+
- Node is not required

Quick start
- Run: `go run ./cmd/server`
- Open: `http://localhost:8080`

Tests
- Run all tests: `go test ./...`

Docker
- Build image
  docker build -t excellent-md .
- Run app only (default)
  docker compose up --build
- Optional: run with Postgres metadata persistence
  1) Set `DATABASE_URL=postgres://excel:excel@db:5432/excellent_md?sslmode=disable`
  2) Run `docker compose --profile persistence up --build`

Configuration
- ADDR (default :8080)
- MAX_UPLOAD_MB (default 50)
- MAX_SHEETS (default 50)
- MAX_CELLS_PER_SHEET (default 200000)
- CONVERSION_TIMEOUT_SECONDS (default 10)
- INCLUDE_HIDDEN_SHEETS (default false)
- DATABASE_URL (optional, enables PostgreSQL persistence)
- DB_MAX_OPEN_CONNS (default 5)
- DB_MAX_IDLE_CONNS (default 2)
- DB_CONN_MAX_LIFETIME_SECONDS (default 30)
- DB_CONN_MAX_IDLE_SECONDS (default 5)
- ENABLE_DEBUG_VARS (default false)
