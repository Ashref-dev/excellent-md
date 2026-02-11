Excellent-MD

Multi-sheet XLSX to Markdown converter with a focused, clean UI. Upload an .xlsx workbook and get Markdown for every sheet, with preview, copy, and download actions.

Features
- Converts all sheets in a workbook, not just the first
- Markdown table output per sheet with combined export
- Drag and drop upload, progress feedback, and copy/download controls
- Handles large workbooks with limits and per-sheet warnings
- Optional PostgreSQL persistence for conversion metadata

Requirements
- Go 1.25+
- Node is not required

Run locally (self-host)
1) Install dependencies
   go mod tidy
2) Start the server
   go run ./cmd/server
3) Open http://localhost:8080

Docker
- Build image
  docker build -t excellent-md .
- Run with Postgres
  docker compose up --build

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
