package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

const schema = `
CREATE TABLE IF NOT EXISTS conversions (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  filename TEXT NOT NULL,
  sheet_count INTEGER NOT NULL,
  processed INTEGER NOT NULL,
  skipped INTEGER NOT NULL,
  duration_ms BIGINT NOT NULL,
  error TEXT
);

CREATE TABLE IF NOT EXISTS conversion_sheets (
  id SERIAL PRIMARY KEY,
  conversion_id INTEGER NOT NULL REFERENCES conversions(id) ON DELETE CASCADE,
  sheet_name TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  col_count INTEGER NOT NULL,
  warnings JSONB,
  error TEXT
);
`

// PostgresConfig controls the DB connection pool.
type PostgresConfig struct {
	DatabaseURL     string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
}

// PostgresStore implements Store backed by PostgreSQL.
type PostgresStore struct {
	db *sql.DB
}

// NewPostgresStore opens a connection and ensures the schema exists.
func NewPostgresStore(ctx context.Context, cfg PostgresConfig) (*PostgresStore, error) {
	db, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if cfg.MaxOpenConns > 0 {
		db.SetMaxOpenConns(cfg.MaxOpenConns)
	}
	if cfg.MaxIdleConns > 0 {
		db.SetMaxIdleConns(cfg.MaxIdleConns)
	}
	if cfg.ConnMaxLifetime > 0 {
		db.SetConnMaxLifetime(cfg.ConnMaxLifetime)
	}
	if cfg.ConnMaxIdleTime > 0 {
		db.SetConnMaxIdleTime(cfg.ConnMaxIdleTime)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	migrateCtx, migrateCancel := context.WithTimeout(ctx, 5*time.Second)
	defer migrateCancel()
	if _, err := db.ExecContext(migrateCtx, schema); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("apply schema: %w", err)
	}

	return &PostgresStore{db: db}, nil
}

// RecordConversion inserts conversion metadata and sheet stats.
func (store *PostgresStore) RecordConversion(ctx context.Context, record ConversionRecord) error {
	if store == nil || store.db == nil {
		return nil
	}

	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	var conversionID int64
	query := `
		INSERT INTO conversions (filename, sheet_count, processed, skipped, duration_ms, error)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`
	if err := tx.QueryRowContext(ctx, query, record.Filename, record.SheetCount, record.Processed, record.Skipped, record.DurationMs, record.Error).Scan(&conversionID); err != nil {
		return fmt.Errorf("insert conversion: %w", err)
	}

	if len(record.Sheets) > 0 {
		sheetQuery := `
			INSERT INTO conversion_sheets (conversion_id, sheet_name, row_count, col_count, warnings, error)
			VALUES ($1, $2, $3, $4, $5, $6)
		`
		for _, sheet := range record.Sheets {
			warningsJSON, _ := json.Marshal(sheet.Warnings)
			if _, err := tx.ExecContext(ctx, sheetQuery, conversionID, sheet.Name, sheet.RowCount, sheet.ColCount, warningsJSON, sheet.Error); err != nil {
				return fmt.Errorf("insert sheet: %w", err)
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}

	return nil
}

// Close releases database resources.
func (store *PostgresStore) Close() error {
	if store == nil || store.db == nil {
		return nil
	}
	return store.db.Close()
}
