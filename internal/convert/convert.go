package convert

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

var (
	ErrTooManySheets     = errors.New("workbook has too many sheets")
	ErrSheetTooLarge     = errors.New("sheet exceeds cell limit")
	ErrConversionTimeout = errors.New("conversion timed out")
)

// Convert reads an XLSX byte slice and returns Markdown for each sheet.
func Convert(ctx context.Context, input []byte, opts Options) (Result, error) {
	result := Result{
		Sheets:  []SheetResult{},
		Skipped: []SkippedSheet{},
		Meta: Meta{
			GeneratedAt: time.Now().UTC(),
		},
	}

	if err := checkCtx(ctx); err != nil {
		return result, err
	}

	file, err := excelize.OpenReader(bytes.NewReader(input))
	if err != nil {
		return result, fmt.Errorf("invalid xlsx file: %w", err)
	}
	defer file.Close()

	sheets := file.GetSheetList()
	result.Meta.SheetCount = len(sheets)

	if opts.MaxSheets > 0 && len(sheets) > opts.MaxSheets {
		return result, ErrTooManySheets
	}

	for _, sheetName := range sheets {
		if err := checkCtx(ctx); err != nil {
			return result, err
		}

		hidden, hiddenErr := isHiddenSheet(file, sheetName)
		if hiddenErr == nil && hidden && !opts.IncludeHiddenSheets {
			result.Skipped = append(result.Skipped, SkippedSheet{
				Name:   sheetName,
				Reason: "hidden sheet",
			})
			continue
		}

		sheetResult := SheetResult{Name: sheetName}
		rows, warnings, rowCount, colCount, err := extractSheet(ctx, file, sheetName, opts)
		sheetResult.RowCount = rowCount
		sheetResult.ColCount = colCount
		if hiddenErr != nil {
			warnings = append(warnings, "Sheet visibility could not be determined; processed as visible.")
		}

		if err != nil {
			sheetResult.Error = err.Error()
			result.Sheets = append(result.Sheets, sheetResult)
			continue
		}

		markdown, _, _ := SheetToMarkdown(rows)
		sheetResult.Markdown = markdown
		sheetResult.Warnings = warnings
		result.Sheets = append(result.Sheets, sheetResult)
	}

	result.Meta.Processed = len(result.Sheets)
	result.Meta.SkippedCount = len(result.Skipped)
	result.CombinedMarkdown = CombineMarkdown(result.Sheets)

	return result, nil
}

func extractSheet(ctx context.Context, file *excelize.File, sheetName string, opts Options) ([][]string, []string, int, int, error) {
	warnings := []string{}

	merges, err := file.GetMergeCells(sheetName)
	if err == nil && len(merges) > 0 {
		warnings = append(warnings, "Merged cells were flattened to their top-left value.")
	}

	rows, err := file.Rows(sheetName)
	if err != nil {
		return nil, warnings, 0, 0, fmt.Errorf("unable to read sheet: %w", err)
	}
	defer rows.Close()

	data := [][]string{}
	maxCols := 0
	rowIndex := 0
	cellCount := 0
	formulaFound := false

	for rows.Next() {
		if err := checkCtx(ctx); err != nil {
			return nil, warnings, rowIndex, maxCols, err
		}
		rowIndex++
		cols, err := rows.Columns()
		if err != nil {
			return nil, warnings, rowIndex, maxCols, fmt.Errorf("failed to read row: %w", err)
		}
		trimmed := trimTrailingEmpty(cols)
		cellCount += len(trimmed)
		if opts.MaxCellsPerSheet > 0 && cellCount > opts.MaxCellsPerSheet {
			return nil, warnings, rowIndex, maxCols, ErrSheetTooLarge
		}
		if len(trimmed) > maxCols {
			maxCols = len(trimmed)
		}
		data = append(data, trimmed)

		if !formulaFound {
			for i := range trimmed {
				cellName, nameErr := excelize.ColumnNumberToName(i + 1)
				if nameErr != nil {
					continue
				}
				cellRef := fmt.Sprintf("%s%d", cellName, rowIndex)
				formula, formulaErr := file.GetCellFormula(sheetName, cellRef)
				if formulaErr == nil && formula != "" {
					formulaFound = true
					break
				}
			}
		}
	}

	if err := rows.Error(); err != nil {
		return nil, warnings, rowIndex, maxCols, fmt.Errorf("failed to iterate rows: %w", err)
	}

	if formulaFound {
		warnings = append(warnings, "Formulas were detected; output uses stored values.")
	}

	return data, warnings, rowIndex, maxCols, nil
}

func isHiddenSheet(file *excelize.File, sheetName string) (bool, error) {
	method := reflect.ValueOf(file).MethodByName("GetSheetVisible")
	if !method.IsValid() {
		return false, nil
	}
	results := method.Call([]reflect.Value{reflect.ValueOf(sheetName)})
	if len(results) != 2 {
		return false, nil
	}
	if errValue := results[1]; !errValue.IsNil() {
		if err, ok := errValue.Interface().(error); ok {
			return false, err
		}
		return false, nil
	}

	switch results[0].Kind() {
	case reflect.Bool:
		visible := results[0].Bool()
		return !visible, nil
	case reflect.String:
		state := strings.ToLower(results[0].String())
		return state != "visible", nil
	default:
		return false, nil
	}
}

func CombineMarkdown(sheets []SheetResult) string {
	blocks := []string{}
	for _, sheet := range sheets {
		if sheet.Name == "" {
			continue
		}
		blocks = append(blocks, "## "+sheet.Name)
		if sheet.Error != "" {
			blocks = append(blocks, "> Error: "+sheet.Error)
			blocks = append(blocks, "")
			continue
		}
		if len(sheet.Warnings) > 0 {
			for _, warning := range sheet.Warnings {
				blocks = append(blocks, "> Warning: "+warning)
			}
		}
		blocks = append(blocks, sheet.Markdown)
		blocks = append(blocks, "")
	}
	return strings.Join(blocks, "\n")
}

func checkCtx(ctx context.Context) error {
	select {
	case <-ctx.Done():
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return ErrConversionTimeout
		}
		return ctx.Err()
	default:
		return nil
	}
}
