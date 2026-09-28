import { createWriteStream, type WriteStream } from 'fs';
import type { Exporter } from '../types';
import type { ColumnHeader, DataRecord, ExportFormat } from '../types';

/**
 * JSON exporter — writes a valid JSON array of objects.
 * Implements the streaming Exporter interface (initialize → writeRecord → finalize).
 * Output is parseable by JSON.parse().
 */
export class JsonExporter implements Exporter {
  readonly format: ExportFormat = 'json';

  private writeStream: WriteStream | null = null;
  private columns: ColumnHeader[] = [];
  private isFirstRecord = true;

  async initialize(outputPath: string, columns: ColumnHeader[]): Promise<void> {
    this.columns = columns;
    this.isFirstRecord = true;

    this.writeStream = createWriteStream(outputPath, { encoding: 'utf8' });

    // Write opening bracket
    const ok = this.writeStream.write('[\n');
    if (!ok) {
      await new Promise<void>((resolve) => this.writeStream!.once('drain', resolve));
    }
  }

  async writeRecord(record: DataRecord): Promise<void> {
    if (!this.writeStream) {
      throw new Error('JsonExporter not initialized. Call initialize() first.');
    }

    // Build an ordered object from the columns array
    const obj: Record<string, string | number | boolean | null> = {};
    for (const col of this.columns) {
      const value = record[col.name];
      if (value instanceof Date) {
        obj[col.name] = value.toISOString();
      } else if (value === undefined) {
        obj[col.name] = null;
      } else {
        obj[col.name] = value;
      }
    }

    const prefix = this.isFirstRecord ? '' : ',\n';
    const line = prefix + JSON.stringify(obj);
    this.isFirstRecord = false;

    const ok = this.writeStream.write(line);
    if (!ok) {
      await new Promise<void>((resolve) => this.writeStream!.once('drain', resolve));
    }
  }

  async finalize(): Promise<void> {
    if (!this.writeStream) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.writeStream!.on('finish', resolve);
      this.writeStream!.on('error', reject);
      this.writeStream!.end('\n]');
    });

    this.writeStream = null;
  }
}
