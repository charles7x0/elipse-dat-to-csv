import ExcelJS from 'exceljs';
import type { Exporter } from '../types';
import type { ColumnHeader, DataRecord, ExportFormat } from '../types';

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

    const values: (Date | string | number | boolean | null)[] = [];

    for (const col of this.columns) {
      const value = record[col.name];

      if (value instanceof Date) {
        values.push(value);
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
