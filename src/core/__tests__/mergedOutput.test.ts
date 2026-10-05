import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import ExcelJS from 'exceljs';
import { ConversionManager } from '../conversionManager';
import { createParserRegistry } from '../parsers/parserRegistry';
import { ExporterRegistryImpl } from '../exporters/exporterRegistry';
import { CsvExporter } from '../exporters/csvExporter';
import { JsonExporter } from '../exporters/jsonExporter';
import { ExcelExporter } from '../exporters/excelExporter';
import { ColumnType, type ConversionConfig } from '../types';

/**
 * End-to-end tests for merged output files. Unlike mergeFiles.test.ts (which
 * calls mergeFiles directly) and conversionManager.test.ts (which mocks the
 * converter), these run the REAL ConversionManager in merge mode against real
 * .dat fixtures and validate the actual output file content for every format.
 */

/** Writes the magic header bytes [0xa7, 0xed, 0xa5, 0xdb] at offset 0. */
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

interface ColumnSpec {
  name: string;
  type: ColumnType;
  rawSize: number;
}

/** Builds a minimal valid .dat binary file buffer with the given columns and rows. */
function buildDatFile(columns: ColumnSpec[], rows: Buffer[]): Buffer {
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

/** DateTime (10 bytes: 2 pad + 8 double epoch seconds) + Word (2 bytes). */
const DATE_WORD_COLUMNS: ColumnSpec[] = [
  { name: 'DateTime', type: ColumnType.DateTime, rawSize: 10 },
  { name: 'Value', type: ColumnType.Word, rawSize: 2 },
];

function buildDateWordRow(epochSeconds: number, word: number): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeDoubleLE(epochSeconds, 2);
  buf.writeInt16LE(word, 10);
  return buf;
}

describe('merged output (end-to-end through ConversionManager)', () => {
  let tmpDir: string;
  let outDir: string;
  let manager: ConversionManager;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `merged-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    outDir = path.join(tmpDir, 'out');
    await mkdir(tmpDir, { recursive: true });
    await mkdir(outDir, { recursive: true });

    const exporterRegistry = new ExporterRegistryImpl();
    exporterRegistry.register(new CsvExporter());
    exporterRegistry.register(new JsonExporter());
    exporterRegistry.register(new ExcelExporter());

    manager = new ConversionManager(createParserRegistry(), exporterRegistry);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const writeDat = async (name: string, columns: ColumnSpec[], rows: Buffer[]): Promise<string> => {
    const p = path.join(tmpDir, name);
    await writeFile(p, buildDatFile(columns, rows));
    return p;
  };

  const config = (overrides: Partial<ConversionConfig>): ConversionConfig => ({
    inputFiles: [],
    outputDirectory: outDir,
    format: 'csv',
    namingPattern: 'same-name',
    mergeOutput: true,
    mergeFileName: 'merged_output',
    ...overrides,
  });

  it('writes a single CSV with all rows sorted chronologically', async () => {
    const f1 = await writeDat('late.dat', DATE_WORD_COLUMNS, [
      buildDateWordRow(5000, 50),
      buildDateWordRow(9000, 90),
    ]);
    const f2 = await writeDat('early.dat', DATE_WORD_COLUMNS, [
      buildDateWordRow(1000, 10),
      buildDateWordRow(7000, 70),
    ]);

    const result = await manager.startBatch([f1, f2], config({ format: 'csv' }));

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
    expect(result.totalRows).toBe(4);

    const outPath = path.join(outDir, 'merged_output.csv');
    expect(existsSync(outPath)).toBe(true);

    const lines = (await readFile(outPath, 'utf8')).trim().split('\n');
    expect(lines[0]).toBe('DateTime,Value');
    expect(lines).toHaveLength(5); // header + 4 rows

    // Values ordered by timestamp: 1000, 5000, 7000, 9000
    const values = lines.slice(1).map((l) => Number(l.split(',')[1]));
    expect(values).toEqual([10, 50, 70, 90]);
  });

  it('produces exactly one output file (not one per input)', async () => {
    const f1 = await writeDat('a.dat', DATE_WORD_COLUMNS, [buildDateWordRow(1000, 1)]);
    const f2 = await writeDat('b.dat', DATE_WORD_COLUMNS, [buildDateWordRow(2000, 2)]);

    await manager.startBatch([f1, f2], config({ format: 'csv' }));

    expect(existsSync(path.join(outDir, 'merged_output.csv'))).toBe(true);
    // No per-file outputs should have been created
    expect(existsSync(path.join(outDir, 'a.csv'))).toBe(false);
    expect(existsSync(path.join(outDir, 'b.csv'))).toBe(false);
  });

  it('honors a custom merge file name', async () => {
    const f1 = await writeDat('a.dat', DATE_WORD_COLUMNS, [buildDateWordRow(1000, 1)]);

    await manager.startBatch([f1], config({ format: 'json', mergeFileName: 'my_report' }));

    expect(existsSync(path.join(outDir, 'my_report.json'))).toBe(true);
  });

  it('merges files with different columns into the union (CSV)', async () => {
    // f1: DateTime + Value (Word)
    const f1 = await writeDat('tca.dat', DATE_WORD_COLUMNS, [buildDateWordRow(1000, 1)]);

    // f2: DateTime + Value + Extra (String) — different column set
    const extendedColumns: ColumnSpec[] = [
      ...DATE_WORD_COLUMNS,
      { name: 'Extra', type: ColumnType.String, rawSize: 8 },
    ];
    const row = Buffer.alloc(12 + 8);
    row.writeDoubleLE(2000, 2);
    row.writeInt16LE(2, 10);
    row.write('hi', 12, 'latin1');
    const f2 = await writeDat('tvz.dat', extendedColumns, [row]);

    const result = await manager.startBatch([f1, f2], config({ format: 'csv' }));

    expect(result.successCount).toBe(1);
    expect(result.totalRows).toBe(2);

    const lines = (await readFile(path.join(outDir, 'merged_output.csv'), 'utf8')).trim().split('\n');
    expect(lines[0]).toBe('DateTime,Value,Extra'); // union header
    expect(lines).toHaveLength(3); // header + 2 rows
    // f1 row (sorted first) has no Extra -> trailing empty cell
    expect(lines[1].endsWith(',1,')).toBe(true);
    // f2 row fills Extra
    expect(lines[2].endsWith(',2,hi')).toBe(true);
  });

  it('merges files with different columns into the union (JSON)', async () => {
    const f1 = await writeDat('tca.dat', DATE_WORD_COLUMNS, [buildDateWordRow(1000, 1)]);

    const extendedColumns: ColumnSpec[] = [
      ...DATE_WORD_COLUMNS,
      { name: 'Extra', type: ColumnType.String, rawSize: 8 },
    ];
    const row = Buffer.alloc(12 + 8);
    row.writeDoubleLE(2000, 2);
    row.writeInt16LE(2, 10);
    row.write('hi', 12, 'latin1');
    const f2 = await writeDat('tvz.dat', extendedColumns, [row]);

    await manager.startBatch([f1, f2], config({ format: 'json' }));

    const parsed = JSON.parse(await readFile(path.join(outDir, 'merged_output.json'), 'utf8')) as Array<{
      Value: number;
      Extra: string | null;
    }>;
    expect(parsed).toHaveLength(2);
    // First (earlier timestamp) came from f1 which has no Extra -> null
    expect(parsed[0].Value).toBe(1);
    expect(parsed[0].Extra).toBeNull();
    expect(parsed[1].Value).toBe(2);
    expect(parsed[1].Extra).toBe('hi');
  });

  it('merges files with different columns into the union (Excel)', async () => {
    const f1 = await writeDat('tca.dat', DATE_WORD_COLUMNS, [buildDateWordRow(1000, 1)]);

    const extendedColumns: ColumnSpec[] = [
      ...DATE_WORD_COLUMNS,
      { name: 'Extra', type: ColumnType.String, rawSize: 8 },
    ];
    const row = Buffer.alloc(12 + 8);
    row.writeDoubleLE(2000, 2);
    row.writeInt16LE(2, 10);
    row.write('hi', 12, 'latin1');
    const f2 = await writeDat('tvz.dat', extendedColumns, [row]);

    const result = await manager.startBatch([f1, f2], config({ format: 'Excel' }));
    expect(result.successCount).toBe(1);

    const outPath = path.join(outDir, 'merged_output.xlsx');
    expect(existsSync(outPath)).toBe(true);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(outPath);
    const ws = wb.getWorksheet('Data')!;
    expect(ws).toBeDefined();

    const header = ws.getRow(1);
    expect(header.getCell(1).value).toBe('DateTime');
    expect(header.getCell(2).value).toBe('Value');
    expect(header.getCell(3).value).toBe('Extra'); // union column present

    // Row 2 = f1 (earlier), has no Extra; Row 3 = f2 fills Extra
    expect(ws.getRow(2).getCell(2).value).toBe(1);
    expect(ws.getRow(2).getCell(3).value ?? null).toBeNull();
    expect(ws.getRow(3).getCell(2).value).toBe(2);
    expect(ws.getRow(3).getCell(3).value).toBe('hi');
  });

  it('reports failure (no output) when an input file is corrupt', async () => {
    const good = await writeDat('good.dat', DATE_WORD_COLUMNS, [buildDateWordRow(1000, 1)]);

    // A file with a valid header but a truncated trailing row triggers CorruptedFileError
    const corruptBuf = buildDatFile(DATE_WORD_COLUMNS, [buildDateWordRow(2000, 2)]);
    const truncated = corruptBuf.subarray(0, corruptBuf.length - 3); // drop last 3 bytes of the row
    const bad = path.join(tmpDir, 'bad.dat');
    await writeFile(bad, truncated);

    const result = await manager.startBatch([good, bad], config({ format: 'csv' }));

    expect(result.successCount).toBe(0);
    expect(result.failureCount).toBe(1);
    expect(result.results[0].error).toBeTruthy();
  });
});
