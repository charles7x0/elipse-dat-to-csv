import { describe, it, expect, afterEach } from 'vitest';
import { validateMagicHeader, decodeColumnValue, parseFile } from '../parsers/datParser';
import { ColumnType, type DataRecord } from '../types';
import { InvalidDatFileError, CorruptedFileError } from '../utils/errors';
import { writeFile, unlink, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

/** Writes the magic header bytes [0xa7, 0xed, 0xa5, 0xdb] at offset 0 */
function writeMagicHeader(buf: Buffer): void {
  buf[0] = 0xa7;
  buf[1] = 0xed;
  buf[2] = 0xa5;
  buf[3] = 0xdb;
}

describe('validateMagicHeader', () => {
  it('returns true for a valid magic header', () => {
    const buf = Buffer.alloc(4);
    writeMagicHeader(buf);
    expect(validateMagicHeader(buf)).toBe(true);
  });

  it('returns true when buffer is larger than 4 bytes with valid header', () => {
    const buf = Buffer.alloc(64);
    writeMagicHeader(buf);
    buf.writeUInt8(0xff, 4); // extra data after header
    expect(validateMagicHeader(buf)).toBe(true);
  });

  it('returns false for an invalid magic header', () => {
    const buf = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    expect(validateMagicHeader(buf)).toBe(false);
  });

  it('returns false for a buffer shorter than 4 bytes', () => {
    expect(validateMagicHeader(Buffer.alloc(0))).toBe(false);
    expect(validateMagicHeader(Buffer.alloc(1))).toBe(false);
    expect(validateMagicHeader(Buffer.alloc(3))).toBe(false);
  });

  it('returns false when bytes are reversed', () => {
    const buf = Buffer.from([0xdb, 0xa5, 0xed, 0xa7]);
    expect(validateMagicHeader(buf)).toBe(false);
  });

  it('does not modify the input buffer', () => {
    const buf = Buffer.alloc(8);
    writeMagicHeader(buf);
    buf.writeUInt32LE(0x12345678, 4);
    const copy = Buffer.from(buf);
    validateMagicHeader(buf);
    expect(buf.equals(copy)).toBe(true);
  });
});

describe('decodeColumnValue', () => {
  it('decodes DateTime: reads DoubleLE at offset 2, multiplies by 1000', () => {
    const buf = Buffer.alloc(10);
    const epochSeconds = 1700000000; // known timestamp
    buf.writeDoubleLE(epochSeconds, 2); // 2 bytes padding + 8 bytes double
    const result = decodeColumnValue(ColumnType.DateTime, buf);
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).getTime()).toBe(epochSeconds * 1000);
  });

  it('decodes String: latin1, null-terminated, trimmed', () => {
    const str = 'Hello';
    const buf = Buffer.alloc(20, 0x00);
    buf.write(str, 0, 'latin1');
    expect(decodeColumnValue(ColumnType.String, buf)).toBe('Hello');
  });

  it('decodes String: trims whitespace', () => {
    const buf = Buffer.alloc(10, 0x00);
    buf.write('  Hi  ', 0, 'latin1');
    expect(decodeColumnValue(ColumnType.String, buf)).toBe('Hi');
  });

  it('decodes String: handles no null terminator', () => {
    const buf = Buffer.from('ABCDE', 'latin1');
    expect(decodeColumnValue(ColumnType.String, buf)).toBe('ABCDE');
  });

  it('decodes Word: reads Int16LE', () => {
    const buf = Buffer.alloc(2);
    buf.writeInt16LE(42, 0);
    expect(decodeColumnValue(ColumnType.Word, buf)).toBe(42);
  });

  it('decodes Word: handles negative values', () => {
    const buf = Buffer.alloc(2);
    buf.writeInt16LE(-100, 0);
    expect(decodeColumnValue(ColumnType.Word, buf)).toBe(-100);
  });

  it('decodes Float: reads FloatLE', () => {
    const buf = Buffer.alloc(4);
    buf.writeFloatLE(3.14, 0);
    const result = decodeColumnValue(ColumnType.Float, buf) as number;
    expect(result).toBeCloseTo(3.14, 2);
  });

  it('decodes Boolean: non-zero byte is true', () => {
    const buf = Buffer.from([0x01]);
    expect(decodeColumnValue(ColumnType.Boolean, buf)).toBe(true);
  });

  it('decodes Boolean: zero byte is false', () => {
    const buf = Buffer.from([0x00]);
    expect(decodeColumnValue(ColumnType.Boolean, buf)).toBe(false);
  });

  it('decodes Boolean: any non-zero value is true', () => {
    const buf = Buffer.from([0xff]);
    expect(decodeColumnValue(ColumnType.Boolean, buf)).toBe(true);
  });

  it('decodes DWord: reads Int32LE', () => {
    const buf = Buffer.alloc(4);
    buf.writeInt32LE(123456, 0);
    expect(decodeColumnValue(ColumnType.DWord, buf)).toBe(123456);
  });

  it('decodes DWord: handles negative values', () => {
    const buf = Buffer.alloc(4);
    buf.writeInt32LE(-987654, 0);
    expect(decodeColumnValue(ColumnType.DWord, buf)).toBe(-987654);
  });

  it('decodes DWordAlt (type 5): reads Int32LE like DWord', () => {
    const buf = Buffer.alloc(4);
    buf.writeInt32LE(2000000, 0);
    expect(decodeColumnValue(ColumnType.DWordAlt, buf)).toBe(2000000);
  });

  it('decodes Double: reads DoubleLE', () => {
    const buf = Buffer.alloc(8);
    buf.writeDoubleLE(3.141592653589793, 0);
    const result = decodeColumnValue(ColumnType.Double, buf) as number;
    expect(result).toBeCloseTo(3.141592653589793, 12);
  });

  it('returns null for unknown column type', () => {
    const buf = Buffer.alloc(4);
    expect(decodeColumnValue(99 as ColumnType, buf)).toBeNull();
  });
});

/**
 * Helper: builds a synthetic .dat binary file buffer.
 * Creates a file with the given columns and row data.
 */
function buildDatFile(
  columns: { name: string; type: ColumnType; rawSize: number }[],
  rows: Buffer[],
): Buffer {
  const columnCount = columns.length;
  const headerByteLength = 24 + columnCount * 40;

  // Compute rowSize from columns
  let rowSize = 0;
  for (const col of columns) {
    switch (col.type) {
      case ColumnType.Boolean: rowSize += 1; break;
      case ColumnType.Word: rowSize += 2; break;
      case ColumnType.DWord: rowSize += 4; break;
      case ColumnType.DWordAlt: rowSize += 4; break;
      case ColumnType.Float: rowSize += 4; break;
      case ColumnType.Double: rowSize += 8; break;
      case ColumnType.DateTime: rowSize += 10; break;
      case ColumnType.String: rowSize += col.rawSize; break;
    }
  }

  const totalSize = headerByteLength + rows.length * rowSize;
  const buf = Buffer.alloc(totalSize);

  // Magic header
  writeMagicHeader(buf);
  // lineCount
  buf.writeInt16LE(rows.length, 4);
  // rowSize at offset 16
  buf.writeInt8(rowSize, 16);
  // columnCount at offset 18
  buf.writeInt8(columnCount, 18);

  // Column definitions
  for (let i = 0; i < columnCount; i++) {
    const offset = 24 + i * 40;
    // Name (36 bytes, latin1, null-padded)
    buf.write(columns[i].name, offset, 'latin1');
    // Type (2 bytes at offset+36)
    buf.writeInt16LE(columns[i].type, offset + 36);
    // Raw size (2 bytes at offset+38)
    buf.writeInt16LE(columns[i].rawSize, offset + 38);
  }

  // Row data
  for (let i = 0; i < rows.length; i++) {
    rows[i].copy(buf, headerByteLength + i * rowSize);
  }

  return buf;
}

describe('parseFile', () => {
  const tempFiles: string[] = [];
  let tempDir: string;

  // Create a temp dir for test files
  const getTempDir = async () => {
    if (!tempDir) {
      tempDir = await mkdtemp(join(tmpdir(), 'datparser-test-'));
    }
    return tempDir;
  };

  const writeTempDat = async (name: string, data: Buffer): Promise<string> => {
    const dir = await getTempDir();
    const filePath = join(dir, name);
    await writeFile(filePath, data);
    tempFiles.push(filePath);
    return filePath;
  };

  afterEach(async () => {
    for (const f of tempFiles) {
      try { await unlink(f); } catch { /* ignore */ }
    }
    tempFiles.length = 0;
  });

  it('yields correct records for a valid .dat file with Word and Float columns', async () => {
    // 2 columns: Word (2 bytes) + Float (4 bytes) = rowSize 6
    const columns = [
      { name: 'Status', type: ColumnType.Word, rawSize: 2 },
      { name: 'Value', type: ColumnType.Float, rawSize: 4 },
    ];

    const row1 = Buffer.alloc(6);
    row1.writeInt16LE(42, 0);
    row1.writeFloatLE(3.14, 2);

    const row2 = Buffer.alloc(6);
    row2.writeInt16LE(7, 0);
    row2.writeFloatLE(2.71, 2);

    const datBuf = buildDatFile(columns, [row1, row2]);
    const filePath = await writeTempDat('test_word_float.dat', datBuf);

    const records: DataRecord[] = [];
    for await (const record of parseFile(filePath)) {
      records.push(record);
    }

    expect(records).toHaveLength(2);
    expect(records[0]['Status']).toBe(42);
    expect(records[0]['Value']).toBeCloseTo(3.14, 2);
    expect(records[1]['Status']).toBe(7);
    expect(records[1]['Value']).toBeCloseTo(2.71, 2);
  });

  it('yields correct DateTime values', async () => {
    const columns = [
      { name: 'Timestamp', type: ColumnType.DateTime, rawSize: 10 },
    ];

    const epochSeconds = 1700000000;
    const row1 = Buffer.alloc(10);
    row1.writeDoubleLE(epochSeconds, 2);

    const datBuf = buildDatFile(columns, [row1]);
    const filePath = await writeTempDat('test_datetime.dat', datBuf);

    const records: DataRecord[] = [];
    for await (const record of parseFile(filePath)) {
      records.push(record);
    }

    expect(records).toHaveLength(1);
    expect(records[0]['Timestamp']).toBeInstanceOf(Date);
    expect((records[0]['Timestamp'] as Date).getTime()).toBe(epochSeconds * 1000);
  });

  it('yields correct String values', async () => {
    const columns = [
      { name: 'Tag', type: ColumnType.String, rawSize: 20 },
    ];

    const row1 = Buffer.alloc(20, 0x00);
    row1.write('SensorA', 0, 'latin1');

    const datBuf = buildDatFile(columns, [row1]);
    const filePath = await writeTempDat('test_string.dat', datBuf);

    const records: DataRecord[] = [];
    for await (const record of parseFile(filePath)) {
      records.push(record);
    }

    expect(records).toHaveLength(1);
    expect(records[0]['Tag']).toBe('SensorA');
  });

  it('yields correct values for Boolean, DWord, DWordAlt, and Double columns', async () => {
    const columns = [
      { name: 'Flag', type: ColumnType.Boolean, rawSize: 1 },
      { name: 'Counter', type: ColumnType.DWord, rawSize: 4 },
      { name: 'CounterAlt', type: ColumnType.DWordAlt, rawSize: 4 },
      { name: 'Precise', type: ColumnType.Double, rawSize: 8 },
    ];

    // rowSize = 1 + 4 + 4 + 8 = 17
    const row1 = Buffer.alloc(17);
    let offset = 0;
    row1.writeUInt8(1, offset); offset += 1; // Flag = true
    row1.writeInt32LE(100000, offset); offset += 4; // Counter
    row1.writeInt32LE(-50000, offset); offset += 4; // CounterAlt
    row1.writeDoubleLE(2.718281828459045, offset); // Precise

    const row2 = Buffer.alloc(17);
    offset = 0;
    row2.writeUInt8(0, offset); offset += 1; // Flag = false
    row2.writeInt32LE(0, offset); offset += 4;
    row2.writeInt32LE(42, offset); offset += 4;
    row2.writeDoubleLE(-1.5, offset);

    const datBuf = buildDatFile(columns, [row1, row2]);
    const filePath = await writeTempDat('test_all_types.dat', datBuf);

    const records: DataRecord[] = [];
    for await (const record of parseFile(filePath)) {
      records.push(record);
    }

    expect(records).toHaveLength(2);

    expect(records[0]['Flag']).toBe(true);
    expect(records[0]['Counter']).toBe(100000);
    expect(records[0]['CounterAlt']).toBe(-50000);
    expect(records[0]['Precise']).toBeCloseTo(2.718281828459045, 12);

    expect(records[1]['Flag']).toBe(false);
    expect(records[1]['Counter']).toBe(0);
    expect(records[1]['CounterAlt']).toBe(42);
    expect(records[1]['Precise']).toBeCloseTo(-1.5, 12);
  });

  it('throws InvalidDatFileError for a file with invalid magic header', async () => {
    const buf = Buffer.alloc(100);
    buf.writeUInt32LE(0x12345678, 0); // wrong magic
    const filePath = await writeTempDat('test_invalid.dat', buf);

    await expect(async () => {
      for await (const _ of parseFile(filePath)) { /* consume */ }
    }).rejects.toThrow(InvalidDatFileError);
  });

  it('throws InvalidDatFileError for a file too small for header', async () => {
    const buf = Buffer.alloc(10); // less than 24 bytes
    const filePath = await writeTempDat('test_tiny.dat', buf);

    await expect(async () => {
      for await (const _ of parseFile(filePath)) { /* consume */ }
    }).rejects.toThrow(InvalidDatFileError);
  });

  it('throws CorruptedFileError for truncated row data', async () => {
    const columns = [
      { name: 'Value', type: ColumnType.Float, rawSize: 4 },
    ];

    // Build a valid file with 1 complete row
    const row1 = Buffer.alloc(4);
    row1.writeFloatLE(1.0, 0);
    const datBuf = buildDatFile(columns, [row1]);

    // Append 2 extra bytes (partial row) to simulate truncation
    const truncatedBuf = Buffer.concat([datBuf, Buffer.from([0x01, 0x02])]);
    const filePath = await writeTempDat('test_truncated.dat', truncatedBuf);

    const records: DataRecord[] = [];
    await expect(async () => {
      for await (const record of parseFile(filePath)) {
        records.push(record);
      }
    }).rejects.toThrow(CorruptedFileError);

    // Should have yielded the 1 complete row before throwing
    expect(records).toHaveLength(1);
    expect(records[0]['Value']).toBeCloseTo(1.0, 2);
  });

  it('yields zero records for a valid file with no row data', async () => {
    const columns = [
      { name: 'X', type: ColumnType.Word, rawSize: 2 },
    ];

    const datBuf = buildDatFile(columns, []);
    const filePath = await writeTempDat('test_empty.dat', datBuf);

    const records: DataRecord[] = [];
    for await (const record of parseFile(filePath)) {
      records.push(record);
    }

    expect(records).toHaveLength(0);
  });

  it('record keys match column names from header', async () => {
    const columns = [
      { name: 'Alpha', type: ColumnType.Word, rawSize: 2 },
      { name: 'Beta', type: ColumnType.Float, rawSize: 4 },
    ];

    const row = Buffer.alloc(6);
    row.writeInt16LE(1, 0);
    row.writeFloatLE(2.0, 2);

    const datBuf = buildDatFile(columns, [row]);
    const filePath = await writeTempDat('test_keys.dat', datBuf);

    const records: DataRecord[] = [];
    for await (const record of parseFile(filePath)) {
      records.push(record);
    }

    expect(records).toHaveLength(1);
    expect(Object.keys(records[0])).toEqual(['Alpha', 'Beta']);
  });
});
