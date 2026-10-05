import ExcelJS from 'exceljs';
import type { Exporter } from '../types';
import type { ColumnHeader, DataRecord, ExportFormat } from '../types';
import { ColumnType } from '../types';

/**
 * Formats a Date as a readable, unambiguous `YYYY-MM-DD HH:mm:ss` string using
 * UTC components (the same instant the CSV/JSON exporters emit via toISOString).
 *
 * We write DateTime values as strings rather than native Excel dates on purpose:
 * the exceljs 4.x streaming writer stamps every Date cell with its default
 * `mm-dd-yy` number format and ignores any column- or cell-level numFmt we set,
 * so native dates render with a locale-ambiguous date and no time-of-day at all.
 * A pre-formatted string displays correctly everywhere and matches CSV/JSON.
 */
function formatDateTime(d: Date): string {
  const pad = (n: number, len = 2): string => String(n).padStart(len, '0');
  return (
    `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

/**
 * Excel exporter — writes .xlsx files using exceljs streaming workbook writer.
 * Implements the streaming Exporter interface (initialize → writeRecord → finalize).
 * Memory-efficient: uses streaming writer so rows are flushed incrementally.
 */
export class ExcelExporter implements Exporter {
  readonly format: ExportFormat = 'Excel';

  private workbook: ExcelJS.stream.xlsx.WorkbookWriter | null = null;
  private worksheet: ExcelJS.Worksheet | null = null;
  private columns: ColumnHeader[] = [];

  async initialize(outputPath: string, columns: ColumnHeader[]): Promise<void> {
    this.columns = columns;

    this.workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: outputPath,
    });

    this.worksheet = this.workbook.addWorksheet('Data');

    // Write header row
    const headerRow = this.worksheet.addRow(columns.map((col) => col.name));
    headerRow.commit();
  }

  async writeRecord(record: DataRecord): Promise<void> {
    if (!this.worksheet) {
      throw new Error('ExcelExporter not initialized. Call initialize() first.');
    }

    const values: (string | number | boolean | null)[] = [];

    for (const col of this.columns) {
      const value = record[col.name];

      if (value instanceof Date) {
        // Emit a readable timestamp string (see formatDateTime for why not a Date).
        values.push(formatDateTime(value));
      } else if (value === undefined) {
        values.push(null);
      } else {
        values.push(value);
      }
    }

    const row = this.worksheet.addRow(values);
    row.commit();
  }

  async finalize(): Promise<void> {
    if (!this.workbook) {
      return;
    }

    this.worksheet?.commit();
    await this.workbook.commit();

    this.workbook = null;
    this.worksheet = null;
  }
}
