package storage

import "context"

// Store records conversion activity for auditing or analytics.
type Store interface {
	RecordConversion(ctx context.Context, record ConversionRecord) error
	Close() error
}

// ConversionRecord captures a conversion result for persistence.
type ConversionRecord struct {
	Filename   string
	SheetCount int
	Processed  int
	Skipped    int
	DurationMs int64
	Error      string
	Sheets     []SheetRecord
}

// SheetRecord captures per-sheet stats.
type SheetRecord struct {
	Name     string
	RowCount int
	ColCount int
	Warnings []string
	Error    string
}
