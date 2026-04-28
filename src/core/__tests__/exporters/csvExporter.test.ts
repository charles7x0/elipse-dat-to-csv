import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CsvExporter } from '../../exporters/csvExporter';
import { ColumnType, type ColumnHeader, type DataRecord } from '../../types';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('CsvExporter', () => {
  let exporter: CsvExporter;
  let testDir: string;

  beforeEach(() => {
    exporter = new CsvExporter();
    testDir = join(tmpdir(), `csv-exporter-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('has format property set to csv', () => {
    expect(exporter.format).toBe('csv');
  });

  it('writes header row from column names', async () => {
    const outputPath = join(testDir, 'header.csv');
    const columns: ColumnHeader[] = [
      { name: 'Timestamp', type: ColumnType.DateTime, size: 10 },
      { name: 'Value', type: ColumnType.Float, size: 4 },
      { name: 'Tag', type: ColumnType.String, size: 36 },
    ];

    await exporter.initialize(outputPath, columns);
    await exporter.writeRecord({ Timestamp: new Date('2024-01-01T00:00:00Z'), Value: 1.0, Tag: 'test' });
    await exporter.finalize();

    const content = readFileSync(outputPath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines[0]).toBe('Timestamp,Value,Tag');
    expect(lines).toHaveLength(2);
  });

  it('formats DateTime values as ISO 8601', async () => {
    const outputPath = join(testDir, 'datetime.csv');
    const columns: ColumnHeader[] = [
      { name: 'Timestamp', type: ColumnType.DateTime, size: 10 },
    ];
    const date = new Date('2024-01-15T10:30:00.000Z');

    await exporter.initialize(outputPath, columns);
    await exporter.writeRecord({ Timestamp: date });
    await exporter.finalize();

    const content = readFileSync(outputPath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines[1]).toBe('2024-01-15T10:30:00.000Z');
  });

  it('writes numeric values unquoted', async () => {
    const outputPath = join(testDir, 'numeric.csv');
    const columns: ColumnHeader[] = [
      { name: 'IntVal', type: ColumnType.Word, size: 2 },
      { name: 'FloatVal', type: ColumnType.Float, size: 4 },
    ];

    await exporter.initialize(outputPath, columns);
    await exporter.writeRecord({ IntVal: 42, FloatVal: 3.14 });
    await exporter.finalize();

    const content = readFileSync(outputPath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines[1]).toBe('42,3.14');
  });

  it('escapes strings containing commas', async () => {
    const outputPath = join(testDir, 'escape-comma.csv');
    const columns: ColumnHeader[] = [
      { name: 'Tag', type: ColumnType.String, size: 36 },
    ];

    await exporter.initialize(outputPath, columns);
    await exporter.writeRecord({ Tag: 'hello, world' });
    await exporter.finalize();

    const content = readFileSync(outputPath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines[1]).toBe('"hello, world"');
  });

  it('escapes strings containing quotes', async () => {
    const outputPath = join(testDir, 'escape-quote.csv');
    const columns: ColumnHeader[] = [
      { name: 'Tag', type: ColumnType.String, size: 36 },
    ];

    await exporter.initialize(outputPath, columns);
    await exporter.writeRecord({ Tag: 'say "hello"' });
    await exporter.finalize();

    const content = readFileSync(outputPath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines[1]).toBe('"say ""hello"""');
  });

  it('handles null values as empty strings', async () => {
    const outputPath = join(testDir, 'null.csv');
    const columns: ColumnHeader[] = [
      { name: 'A', type: ColumnType.Word, size: 2 },
      { name: 'B', type: ColumnType.String, size: 36 },
    ];

    await exporter.initialize(outputPath, columns);
    await exporter.writeRecord({ A: null, B: null });
    await exporter.finalize();

    const content = readFileSync(outputPath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines[1]).toBe(',');
  });

  it('writes multiple records in column order', async () => {
    const outputPath = join(testDir, 'multi.csv');
    const columns: ColumnHeader[] = [
      { name: 'Timestamp', type: ColumnType.DateTime, size: 10 },
      { name: 'Value', type: ColumnType.Float, size: 4 },
      { name: 'Tag', type: ColumnType.String, size: 36 },
    ];
    const date1 = new Date('2024-01-01T00:00:00.000Z');
    const date2 = new Date('2024-06-15T12:30:00.000Z');

    await exporter.initialize(outputPath, columns);
    await exporter.writeRecord({ Timestamp: date1, Value: 1.5, Tag: 'sensor_a' });
    await exporter.writeRecord({ Timestamp: date2, Value: 99.9, Tag: 'sensor_b' });
    await exporter.finalize();

    const content = readFileSync(outputPath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Timestamp,Value,Tag');
    expect(lines[1]).toBe('2024-01-01T00:00:00.000Z,1.5,sensor_a');
    expect(lines[2]).toBe('2024-06-15T12:30:00.000Z,99.9,sensor_b');
  });

  it('throws if writeRecord is called before initialize', async () => {
    await expect(exporter.writeRecord({ A: 1 })).rejects.toThrow(
      'CsvExporter not initialized'
    );
  });
});
