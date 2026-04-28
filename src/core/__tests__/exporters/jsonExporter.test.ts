import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonExporter } from '../../exporters/jsonExporter';
import { ColumnType, type ColumnHeader } from '../../types';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('JsonExporter', () => {
  let exporter: JsonExporter;
  let testDir: string;

  beforeEach(() => {
    exporter = new JsonExporter();
    testDir = join(tmpdir(), `json-exporter-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('has format property set to json', () => {
    expect(exporter.format).toBe('json');
  });

  it('produces valid JSON parseable by JSON.parse()', async () => {
    const outputPath = join(testDir, 'valid.json');
    const columns: ColumnHeader[] = [
      { name: 'Value', type: ColumnType.Float, size: 4 },
    ];

    await exporter.initialize(outputPath, columns);
    await exporter.writeRecord({ Value: 1.5 });
    await exporter.writeRecord({ Value: 2.5 });
    await exporter.finalize();

    const content = readFileSync(outputPath, 'utf8');
    const parsed = JSON.parse(content);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });

  it('serializes DateTime values as ISO 8601 strings', async () => {
    const outputPath = join(testDir, 'datetime.json');
    const columns: ColumnHeader[] = [
      { name: 'Timestamp', type: ColumnType.DateTime, size: 10 },
    ];
    const date = new Date('2024-01-15T10:30:00.000Z');

    await exporter.initialize(outputPath, columns);
    await exporter.writeRecord({ Timestamp: date });
    await exporter.finalize();

    const parsed = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(parsed[0].Timestamp).toBe('2024-01-15T10:30:00.000Z');
  });

  it('serializes numeric values as JSON numbers', async () => {
    const outputPath = join(testDir, 'numeric.json');
    const columns: ColumnHeader[] = [
      { name: 'IntVal', type: ColumnType.Word, size: 2 },
      { name: 'FloatVal', type: ColumnType.Float, size: 4 },
    ];

    await exporter.initialize(outputPath, columns);
    await exporter.writeRecord({ IntVal: 42, FloatVal: 3.14 });
    await exporter.finalize();

    const parsed = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(parsed[0].IntVal).toBe(42);
    expect(typeof parsed[0].IntVal).toBe('number');
    expect(parsed[0].FloatVal).toBeCloseTo(3.14);
    expect(typeof parsed[0].FloatVal).toBe('number');
  });

  it('uses column names as object keys', async () => {
    const outputPath = join(testDir, 'keys.json');
    const columns: ColumnHeader[] = [
      { name: 'Timestamp', type: ColumnType.DateTime, size: 10 },
      { name: 'Value', type: ColumnType.Float, size: 4 },
      { name: 'Tag', type: ColumnType.String, size: 36 },
    ];

    await exporter.initialize(outputPath, columns);
    await exporter.writeRecord({ Timestamp: new Date('2024-01-01T00:00:00Z'), Value: 1.0, Tag: 'sensor' });
    await exporter.finalize();

    const parsed = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(Object.keys(parsed[0])).toEqual(['Timestamp', 'Value', 'Tag']);
  });

  it('handles null values', async () => {
    const outputPath = join(testDir, 'null.json');
    const columns: ColumnHeader[] = [
      { name: 'A', type: ColumnType.Word, size: 2 },
      { name: 'B', type: ColumnType.String, size: 36 },
    ];

    await exporter.initialize(outputPath, columns);
    await exporter.writeRecord({ A: null, B: null });
    await exporter.finalize();

    const parsed = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(parsed[0].A).toBeNull();
    expect(parsed[0].B).toBeNull();
  });

  it('writes multiple records correctly', async () => {
    const outputPath = join(testDir, 'multi.json');
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

    const parsed = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ Timestamp: '2024-01-01T00:00:00.000Z', Value: 1.5, Tag: 'sensor_a' });
    expect(parsed[1]).toEqual({ Timestamp: '2024-06-15T12:30:00.000Z', Value: 99.9, Tag: 'sensor_b' });
  });

  it('produces valid JSON with zero records (empty array)', async () => {
    const outputPath = join(testDir, 'empty.json');
    const columns: ColumnHeader[] = [
      { name: 'Value', type: ColumnType.Float, size: 4 },
    ];

    await exporter.initialize(outputPath, columns);
    await exporter.finalize();

    const parsed = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(parsed).toEqual([]);
  });

  it('throws if writeRecord is called before initialize', async () => {
    await expect(exporter.writeRecord({ A: 1 })).rejects.toThrow(
      'JsonExporter not initialized'
    );
  });
});
