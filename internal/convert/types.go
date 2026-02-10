package convert

import "time"

// Options controls conversion behavior and limits.
type Options struct {
	IncludeHiddenSheets bool
	MaxSheets           int
	MaxCellsPerSheet    int
}

// Result is the top-level conversion response.
type Result struct {
	Sheets           []SheetResult  `json:"sheets"`
	Skipped          []SkippedSheet `json:"skipped,omitempty"`
	CombinedMarkdown string         `json:"combined_markdown"`
	Meta             Meta           `json:"meta"`
}

// Meta provides metadata about the conversion.
type Meta struct {
	SheetCount   int       `json:"sheet_count"`
	Processed    int       `json:"processed"`
	SkippedCount int       `json:"skipped_count"`
	GeneratedAt  time.Time `json:"generated_at"`
}

// SheetResult is the per-sheet output or error.
type SheetResult struct {
	Name     string   `json:"name"`
	Markdown string   `json:"markdown,omitempty"`
	Warnings []string `json:"warnings,omitempty"`
	Error    string   `json:"error,omitempty"`
	RowCount int      `json:"row_count"`
	ColCount int      `json:"col_count"`
}

// SkippedSheet captures sheets that were intentionally skipped.
type SkippedSheet struct {
	Name   string `json:"name"`
	Reason string `json:"reason"`
}
