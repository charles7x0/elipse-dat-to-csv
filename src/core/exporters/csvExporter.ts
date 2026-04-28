import { createWriteStream, type WriteStream } from 'fs';
import { format, type CsvFormatterStream } from '@fast-csv/format';
import type { Exporter } from '../types';
import type { ColumnHeader, DataRecord, ExportFormat } from '../types';

/**
 * CSV exporter — writes RFC 4180 compliant CSV output using fast-csv.
 * Implements the streaming Exporter interface (initialize → writeRecord → finalize).
 */
export class CsvExporter implements Exporter {
  readonly format: ExportFormat = 'csv';

  private csvStream: CsvFormatterStream<any, any> | null = null;
  private writeStream: WriteStream | null = null;
  private columns: ColumnHeader[] = [];

  async initialize(outputPath: string, columns: ColumnHeader[]): Promise<void> {
    this.columns = columns;

    const headers = columns.map((col) => col.name);

    this.csvStream = format({ headers, writeHeaders: true });
    this.writeStream = createWriteStream(outputPath, { encoding: 'utf8' });

    this.csvStream.pipe(this.writeStream);
  }

  async writeRecord(record: DataRecord): Promise<void> {
    if (!this.csvStream) {
      throw new Error('CsvExporter not initialized. Call initialize() first.');
    }

    const row: Record<string, string | number> = {};

    for (const col of this.columns) {
      const value = record[col.name];

      if (value instanceof Date) {
        row[col.name] = value.toISOString();
      } else if (value === null || value === undefined) {
        row[col.name] = '';
      } else {
        row[col.name] = value;
      }
    }

    // Write row; if backpressure occurs, wait for drain
    const ok = this.csvStream.write(row);
    if (!ok) {
      await new Promise<void>((resolve) => this.csvStream!.once('drain', resolve));
    }
  }

  async finalize(): Promise<void> {
    if (!this.csvStream || !this.writeStream) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.writeStream!.on('finish', resolve);
      this.writeStream!.on('error', reject);
      this.csvStream!.end();
    });

    this.csvStream = null;
    this.writeStream = null;
  }
}
