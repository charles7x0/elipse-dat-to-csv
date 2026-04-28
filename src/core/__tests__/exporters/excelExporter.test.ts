import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExcelExporter } from '../../exporters/excelExporter';
import { ColumnType, type ColumnHeader } from '../../types';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import ExcelJS from 'exceljs';

describe('ExcelExporter', () => {
  let exporter: ExcelExporter;
  let testDir: string;

  beforeEach(() => {
    exporter = new ExcelExporter();
    testDir = join(tmpdir(), `excel-exporter-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('has format property set to Excel', () => {
    expect(exporter.format).toBe('Excel');
  });

  it('creates a valid .xlsx file with header row', async () => {
    const outputPath = join(testDir, 'header.xlsx');
    const columns: ColumnHeader[] = [
      { name: 'Timestamp', type: ColumnType.DateTime, size: 10 },
      { name: 'Value', type: ColumnType.Float, size: 4 },
      { name: 'Tag', type: ColumnType.String, size: 36 },
    ];

    await exporter.initialize(outputPath, columns);
    await exporter.finalize();

    expect(existsSync(outputPath)).toBe(true);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(outputPath);
    const ws = wb.getWorksheet('Data')!;
    expect(ws).toBeDefined();

    const headerRow = ws.getRow(1);
    expect(headerRow.getCell(1).value).toBe('Timestamp');
    expect(headerRow.getCell(2).value).toBe('Value');
    expect(headerRow.getCell(3).value).toBe('Tag');
  });

  it('writes records with proper types', async () => {
    const outputPath = join(testDir, 'records.xlsx');
    const columns: ColumnHeader[] = [
      { name: 'Timestamp', type: ColumnType.DateTime, size: 10 },
      { name: 'Value', type: ColumnType.Float, size: 4 },
      { name: 'Tag', type: ColumnType.String, size: 36 },
      { name: 'Count', type: ColumnType.Word, size: 2 },
    ];
    const date = new Date('2024-01-15T10:30:00.000Z');

    await exporter.initialize(outputPath, columns);
    await exporter.writeRecord({ Timestamp: date, Value: 3.14, Tag: 'sensor_a', Count: 42 });
    await exporter.writeRecord({ Timestamp: new Date('2024-06-01T00:00:00.000Z'), Value: 99.9, Tag: 'sensor_b', Count: 7 });
    await exporter.finalize();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(outputPath);
    const ws = wb.getWorksheet('Data')!;

    // Row 1 is header, row 2 is first data row
    const row2 = ws.getRow(2);
    expect(row2.getCell(1).value).toBeInstanceOf(Date);
    expect((row2.getCell(1).value as Date).toISOString()).toBe('2024-01-15T10:30:00.000Z');
    expect(row2.getCell(2).value).toBe(3.14);
    expect(row2.getCell(3).value).toBe('sensor_a');
    expect(row2.getCell(4).value).toBe(42);

    const row3 = ws.getRow(3);
    expect(row3.getCell(2).value).toBe(99.9);
    expect(row3.getCell(3).value).toBe('sensor_b');
    expect(row3.getCell(4).value).toBe(7);
  });

  it('handles null and undefined values as null', async () => {
    const outputPath = join(testDir, 'nulls.xlsx');
    const columns: ColumnHeader[] = [
      { name: 'A', type: ColumnType.Word, size: 2 },
      { name: 'B', type: ColumnType.String, size: 36 },
    ];

    await exporter.initialize(outputPath, columns);
    await exporter.writeRecord({ A: null, B: null });
    await exporter.finalize();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(outputPath);
    const ws = wb.getWorksheet('Data')!;

    const row2 = ws.getRow(2);
    expect(row2.getCell(1).value).toBeNull();
    expect(row2.getCell(2).value).toBeNull();
  });

  it('throws if writeRecord is called before initialize', async () => {
    await expect(exporter.writeRecord({ A: 1 })).rejects.toThrow(
      'ExcelExporter not initialized'
    );
  });
});
