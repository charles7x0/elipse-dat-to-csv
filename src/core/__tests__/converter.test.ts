import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm, readFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { convertFile } from '../converter';
import type { ConvertOptions } from '../types';
import { ParserRegistryImpl, DatParserImpl } from '../parsers/parserRegistry';
import { ExporterRegistryImpl } from '../exporters/exporterRegistry';
import { CsvExporter } from '../exporters/csvExporter';
import { JsonExporter } from '../exporters/jsonExporter';
import { ColumnType } from '../types';

/** Writes the magic header bytes [0xa7, 0xed, 0xa5, 0xdb] at offset 0 */
function writeMagicHeader(buf: Buffer): void {
  buf[0] = 0xa7;
  buf[1] = 0xed;
  buf[2] = 0xa5;
  buf[3] = 0xdb;
}

/**
 * Builds a minimal valid .dat binary file buffer with the given columns and rows.
 */
function buildDatFile(
  columns: { name: string; type: ColumnType; rawSize: number }[],
  rows: Buffer[],
): Buffer {
  const columnCount = columns.length;
  const headerSize = 24 + columnCount * 40;

  // Compute row size from columns
  let rowSize = 0;
  for (const col of columns) {
    switch (col.type) {
      case ColumnType.DateTime:
        rowSize += 10;
        break;
      case ColumnType.Word:
        rowSize += 2;
        break;
      case ColumnType.Float:
        rowSize += 4;
        break;
      case ColumnType.String:
        rowSize += col.rawSize;
        break;
    }
  }

  const lineCount = rows.length;

  // Build header
  const header = Buffer.alloc(headerSize, 0);
  header.writeUInt32LE(0, 0);
  writeMagicHeader(header);
  header.writeInt16LE(lineCount, 4);
  header.writeInt8(rowSize, 16);
  header.writeInt8(columnCount, 18);

  // Write column definitions
  for (let i = 0; i < columnCount; i++) {
    const offset = 24 + i * 40;
    const nameBuf = Buffer.from(columns[i].name, 'latin1');
    nameBuf.copy(header, offset, 0, Math.min(nameBuf.length, 36));
    header.writeInt16LE(columns[i].type, offset + 36);
    header.writeInt16LE(columns[i].rawSize, offset + 38);
  }

  return Buffer.concat([header, ...rows]);
}

/**
 * Builds a row buffer for a Word + Float column layout (2 + 4 = 6 bytes per row).
 */
function buildWordFloatRow(wordVal: number, floatVal: number): Buffer {
  const buf = Buffer.alloc(6);
  buf.writeInt16LE(wordVal, 0);
  buf.writeFloatLE(floatVal, 2);
  return buf;
}

describe('convertFile', () => {
  let tmpDir: string;
  let options: ConvertOptions;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `converter-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });

    const parserRegistry = new ParserRegistryImpl();
    parserRegistry.register(new DatParserImpl());

    const exporterRegistry = new ExporterRegistryImpl();
    exporterRegistry.register(new CsvExporter());
    exporterRegistry.register(new JsonExporter());

    options = { parserRegistry, exporterRegistry };
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('converts a .dat file to CSV with correct row count and success', async () => {
    const columns = [
      { name: 'Status', type: ColumnType.Word, rawSize: 2 },
      { name: 'Value', type: ColumnType.Float, rawSize: 4 },
    ];
    const rows = [
      buildWordFloatRow(1, 3.14),
      buildWordFloatRow(2, 6.28),
      buildWordFloatRow(3, 9.42),
    ];
    const datBuf = buildDatFile(columns, rows);

    const inputPath = path.join(tmpDir, 'test.dat');
    const outputPath = path.join(tmpDir, 'test.csv');
    await writeFile(inputPath, datBuf);

    const result = await convertFile(inputPath, outputPath, 'csv', options);

    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(3);
    expect(result.filePath).toBe(inputPath);
    expect(result.outputPath).toBe(outputPath);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();

    // Verify CSV content
    const csvContent = await readFile(outputPath, 'utf8');
    const lines = csvContent.trim().split('\n');
    expect(lines[0]).toBe('Status,Value');
    expect(lines.length).toBe(4); // header + 3 rows
  });

  it('converts a .dat file to JSON with correct structure', async () => {
    const columns = [
      { name: 'Code', type: ColumnType.Word, rawSize: 2 },
      { name: 'Temp', type: ColumnType.Float, rawSize: 4 },
    ];
    const rows = [buildWordFloatRow(10, 25.5), buildWordFloatRow(20, 30.0)];
    const datBuf = buildDatFile(columns, rows);

    const inputPath = path.join(tmpDir, 'test.dat');
    const outputPath = path.join(tmpDir, 'test.json');
    await writeFile(inputPath, datBuf);

    const result = await convertFile(inputPath, outputPath, 'json', options);

    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(2);

    const jsonContent = await readFile(outputPath, 'utf8');
    const parsed = JSON.parse(jsonContent);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toHaveProperty('Code');
    expect(parsed[0]).toHaveProperty('Temp');
  });

  it('returns success: false for invalid .dat file (bad magic header)', async () => {
    const badBuf = Buffer.alloc(100, 0); // no magic header
    const inputPath = path.join(tmpDir, 'bad.dat');
    const outputPath = path.join(tmpDir, 'bad.csv');
    await writeFile(inputPath, badBuf);

    const result = await convertFile(inputPath, outputPath, 'csv', options);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.rowCount).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns success: false when no parser is registered for the extension', async () => {
    const inputPath = path.join(tmpDir, 'test.xyz');
    const outputPath = path.join(tmpDir, 'test.csv');
    await writeFile(inputPath, Buffer.from('hello'));

    const result = await convertFile(inputPath, outputPath, 'csv', options);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No parser registered');
  });

  it('returns success: false when exporter format is not registered', async () => {
    const columns = [{ name: 'Val', type: ColumnType.Word, rawSize: 2 }];
    const rows = [Buffer.alloc(2)];
    const datBuf = buildDatFile(columns, rows);

    const inputPath = path.join(tmpDir, 'test.dat');
    const outputPath = path.join(tmpDir, 'test.parquet');
    await writeFile(inputPath, datBuf);

    // 'parquet' is not a registered format — cast to bypass TS check
    const result = await convertFile(inputPath, outputPath, 'parquet' as any, options);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No exporter registered');
  });

  it('handles zero-row .dat file correctly', async () => {
    const columns = [
      { name: 'A', type: ColumnType.Word, rawSize: 2 },
    ];
    const datBuf = buildDatFile(columns, []);

    const inputPath = path.join(tmpDir, 'empty.dat');
    const outputPath = path.join(tmpDir, 'empty.csv');
    await writeFile(inputPath, datBuf);

    const result = await convertFile(inputPath, outputPath, 'csv', options);

    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
