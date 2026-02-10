# XLSX -> Markdown Conversion Spec (v1)

## Supported Inputs
- File type: `.xlsx` only.
- Multi-sheet workbooks are supported.
- Hidden sheets are skipped by default (configurable).

## Sheet Handling Rules
- Each sheet is converted independently and returned in workbook order.
- Each sheet is rendered as a Markdown section header plus a table.
- Empty sheets render a short “no data” note instead of a table.

## Cell Handling Rules
- Text and numeric values are output as plain text.
- Newlines are replaced with `<br>` inside Markdown cells.
- Pipes (`|`) are escaped with `\|`.
- Trailing empty columns are trimmed per row, and table width is the max non-empty column count across rows.
- Rows are padded with empty strings to match the table width.

## Header / Table Structure
- First row is treated as the header row.
- A standard Markdown separator row (`| --- |`) is added after the header.
- If a sheet has only one row, it still becomes the header with an empty body.

## Known Limitations (v1)
- Charts, images, pivot tables, and macros are not rendered.
- Merged cells are flattened to the top-left value, and a warning is added.
- Formulas are output as their stored/calculated value (if available); a warning is added if formulas are detected.
- Rich text and cell styling are not preserved.

## Limits & Safety
- Max upload size: 10 MB.
- Max sheets: 50.
- Max cells per sheet: 200,000.
- Requests time out if conversion exceeds 10 seconds.

## Environment Variables
- `ADDR`: HTTP bind address (default `:8080`).
- `MAX_UPLOAD_MB`: Max upload size in MB (default `10`).
- `MAX_SHEETS`: Max sheets per workbook (default `50`).
- `MAX_CELLS_PER_SHEET`: Max cells per sheet (default `200000`).
- `CONVERSION_TIMEOUT_SECONDS`: Conversion timeout (default `10`).
- `INCLUDE_HIDDEN_SHEETS`: Include hidden sheets (default `false`).
- `DATABASE_URL`: Optional PostgreSQL connection string; enables persistence if set.
- `DB_MAX_OPEN_CONNS`: Max open DB connections (default `5`).
- `DB_MAX_IDLE_CONNS`: Max idle DB connections (default `2`).
- `DB_CONN_MAX_LIFETIME_SECONDS`: Max DB connection lifetime (default `30`).
- `DB_CONN_MAX_IDLE_SECONDS`: Max DB idle time (default `5`).
- `ENABLE_DEBUG_VARS`: Expose `/debug/vars` (default `false`).

## Error & Warning Policy
- If a sheet fails to convert, other sheets still return (partial success).
- Errors are per-sheet when possible, with a top-level failure only for invalid files.
- Warnings include merged cells, formulas, and skipped hidden sheets.

## Docker (local)
- Build image: `docker build -t excellent-md .`
- Run with Postgres: `docker compose up --build`
- App URL: `http://localhost:8080`
