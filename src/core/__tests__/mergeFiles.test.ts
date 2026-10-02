import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm, readFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { mergeFiles } from '../converter';
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

/** Byte size per column type (String uses rawSize). */
function typeSize(type: ColumnType, rawSize: number): number {
  switch (type) {
    case ColumnType.Boolean:
      return 1;
    case ColumnType.Word:
      return 2;
    case ColumnType.DWord:
    case ColumnType.DWordAlt:
    case ColumnType.Float:
      return 4;
    case ColumnType.Double:
      return 8;
    case ColumnType.DateTime:
      return 10;
    case ColumnType.String:
      return rawSize;
    default:
      return 0;
  }
}

/** Builds a minimal valid .dat binary file buffer with the given columns and rows. */
function buildDatFile(
  columns: { name: string; type: ColumnType; rawSize: number }[],
  rows: Buffer[],
): Buffer {
  const columnCount = columns.length;
  const headerSize = 24 + columnCount * 40;

  let rowSize = 0;
  for (const col of columns) {
    rowSize += typeSize(col.type, col.rawSize);
  }

  const header = Buffer.alloc(headerSize, 0);
  writeMagicHeader(header);
  header.writeInt16LE(rows.length, 4);
  header.writeInt8(rowSize, 16);
  header.writeInt8(columnCount, 18);

  for (let i = 0; i < columnCount; i++) {
    const offset = 24 + i * 40;
    const nameBuf = Buffer.from(columns[i].name, 'latin1');
    nameBuf.copy(header, offset, 0, Math.min(nameBuf.length, 36));
    header.writeInt16LE(columns[i].type, offset + 36);
    header.writeInt16LE(columns[i].rawSize, offset + 38);
  }

  return Buffer.concat([header, ...rows]);
}

/** Builds a DateTime + Word row (10 + 2 = 12 bytes). DateTime is epoch seconds at offset+2. */
function buildDateWordRow(epochSeconds: number, word: number): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeDoubleLE(epochSeconds, 2); // DateTime column (2 pad + 8 double)
  buf.writeInt16LE(word, 10); // Word column
  return buf;
}

const DATE_WORD_COLUMNS = [
  { name: 'DateTime', type: ColumnType.DateTime, rawSize: 10 },
  { name: 'Value', type: ColumnType.Word, rawSize: 2 },
];

describe('mergeFiles', () => {
  let tmpDir: string;
  let options: ConvertOptions;

  beforeEach(async () => {
    tmpDir = path.join(
      os.tmpdir(),
      `merge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
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

  const writeDat = async (name: string, rows: Buffer[]): Promise<string> => {
    const p = path.join(tmpDir, name);
    await writeFile(p, buildDatFile(DATE_WORD_COLUMNS, rows));
    return p;
  };

  it('concatenates rows from multiple files into one output', async () => {
    const f1 = await writeDat('a.dat', [buildDateWordRow(1000, 1), buildDateWordRow(2000, 2)]);
    const f2 = await writeDat('b.dat', [buildDateWordRow(3000, 3)]);
    const outputPath = path.join(tmpDir, 'merged_output.csv');

    const result = await mergeFiles([f1, f2], outputPath, 'csv', options);

    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(3);
    expect(result.inputFiles).toEqual([f1, f2]);

    const csv = await readFile(outputPath, 'utf8');
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('DateTime,Value');
    expect(lines).toHaveLength(4); // header + 3 rows
  });

  it('sorts merged rows ascending by the DateTime column', async () => {
    // File 1 has later timestamps, file 2 earlier — merged output must interleave by time
    const f1 = await writeDat('late.dat', [buildDateWordRow(5000, 50), buildDateWordRow(9000, 90)]);
    const f2 = await writeDat('early.dat', [buildDateWordRow(1000, 10), buildDateWordRow(7000, 70)]);
    const outputPath = path.join(tmpDir, 'merged_output.json');

    const result = await mergeFiles([f1, f2], outputPath, 'json', options);
    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(4);

    const parsed = JSON.parse(await readFile(outputPath, 'utf8')) as { Value: number }[];
    const values = parsed.map((r) => r.Value);
    expect(values).toEqual([10, 50, 70, 90]); // chronological by timestamp
  });

  it('merges files with different columns using the union of all columns', async () => {
    const f1 = await writeDat('a.dat', [buildDateWordRow(1000, 1)]);

    // f2 has an extra String column
    const extendedColumns = [
      ...DATE_WORD_COLUMNS,
      { name: 'Extra', type: ColumnType.String, rawSize: 8 },
    ];
    const row = Buffer.alloc(12 + 8);
    row.writeDoubleLE(2000, 2);
    row.writeInt16LE(2, 10);
    row.write('hi', 12, 'latin1');
    const f2 = path.join(tmpDir, 'b.dat');
    await writeFile(f2, buildDatFile(extendedColumns, [row]));

    const outputPath = path.join(tmpDir, 'merged_output.csv');
    const result = await mergeFiles([f1, f2], outputPath, 'csv', options);

    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(2);

    const csv = await readFile(outputPath, 'utf8');
    const lines = csv.trim().split('\n');
    // Header is the union: DateTime, Value, Extra
    expect(lines[0]).toBe('DateTime,Value,Extra');
    expect(lines).toHaveLength(3); // header + 2 rows
    // Row from f1 (no Extra) leaves the Extra cell blank
    expect(lines[1].endsWith(',1,')).toBe(true);
    // Row from f2 fills Extra
    expect(lines[2].endsWith(',2,hi')).toBe(true);
  });

  it('merges files that share a column name with differing types (first type wins in header)', async () => {
    const f1 = await writeDat('a.dat', [buildDateWordRow(1000, 1)]);

    // Same names/order but second column is Float instead of Word
    const typeVariant = [
      { name: 'DateTime', type: ColumnType.DateTime, rawSize: 10 },
      { name: 'Value', type: ColumnType.Float, rawSize: 4 },
    ];
    const row = Buffer.alloc(14);
    row.writeDoubleLE(2000, 2);
    row.writeFloatLE(1.5, 10);
    const f2 = path.join(tmpDir, 'b.dat');
    await writeFile(f2, buildDatFile(typeVariant, [row]));

    const outputPath = path.join(tmpDir, 'merged_output.json');
    const result = await mergeFiles([f1, f2], outputPath, 'json', options);

    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(2);

    const parsed = JSON.parse(await readFile(outputPath, 'utf8')) as { Value: number }[];
    // Both files contribute a Value; sorted chronologically (1000 then 2000)
    expect(parsed.map((r) => r.Value)).toEqual([1, 1.5]);
  });

  it('returns failure when no input files are provided', async () => {
    const outputPath = path.join(tmpDir, 'merged_output.csv');
    const result = await mergeFiles([], outputPath, 'csv', options);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No input files');
  });

  it('merges a single file successfully', async () => {
    const f1 = await writeDat('solo.dat', [buildDateWordRow(1000, 1), buildDateWordRow(500, 2)]);
    const outputPath = path.join(tmpDir, 'merged_output.json');

    const result = await mergeFiles([f1], outputPath, 'json', options);

    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(2);

    const parsed = JSON.parse(await readFile(outputPath, 'utf8')) as { Value: number }[];
    // Sorted: epoch 500 (Value 2) before epoch 1000 (Value 1)
    expect(parsed.map((r) => r.Value)).toEqual([2, 1]);
  });
});
