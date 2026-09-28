import { createReadStream } from 'fs';
import { open } from 'fs/promises';
import { DAT_MAGIC_HEADER, ColumnType } from '../types';
import type { ColumnHeader, DatFileHeader, DataRecord } from '../types';
import { InvalidDatFileError, CorruptedFileError } from '../utils/errors';
import { UnsupportedColumnTypeError } from '../utils/errors';

/**
 * Validates that a buffer starts with the Elipse .dat magic header.
 *
 * @param buffer - Buffer with at least 4 bytes
 * @returns true if the first 4 bytes equal 0xa7eda5db (LE), false otherwise
 */
export function validateMagicHeader(buffer: Buffer): boolean {
  if (buffer.length < 4) {
    return false;
  }
  return buffer[0] === DAT_MAGIC_HEADER[0] && buffer[1] === DAT_MAGIC_HEADER[1] && buffer[2] === DAT_MAGIC_HEADER[2] && buffer[3] === DAT_MAGIC_HEADER[3];
}

const VALID_COLUMN_TYPES = new Set<number>([
  ColumnType.Boolean,
  ColumnType.Word,
  ColumnType.DWord,
  ColumnType.DWordAlt,
  ColumnType.Float,
  ColumnType.Double,
  ColumnType.DateTime,
  ColumnType.String,
]);

/**
 * Computes the byte size for a column based on its type and raw size field.
 *
 * @param type - The column type enum value
 * @param rawSize - The raw size value from the header (used for String type)
 * @returns The byte size for this column
 * @throws UnsupportedColumnTypeError for unknown column types
 */
export function computeTypeSize(type: ColumnType, rawSize: number): number {
  switch (type) {
    case ColumnType.Boolean:
      return 1;
    case ColumnType.Word:
      return 2;
    case ColumnType.DWord:
    case ColumnType.DWordAlt:
      return 4;
    case ColumnType.Float:
      return 4;
    case ColumnType.Double:
      return 8;
    case ColumnType.DateTime:
      return 10;
    case ColumnType.String:
      return rawSize;
    default:
      throw new UnsupportedColumnTypeError(`Unknown column type: ${type}`);
  }
}

/**
 * Decodes a column value from a binary buffer based on its column type.
 *
 * @param type - The column type enum value
 * @param data - Buffer containing the raw column data
 * @returns Decoded value (Date, string, number, boolean) or null for unknown types
 */
export function decodeColumnValue(
  type: ColumnType,
  data: Buffer,
): Date | string | number | boolean | null {
  switch (type) {
    case ColumnType.Boolean:
      return data[0] !== 0;
    case ColumnType.Word:
      return data.readInt16LE(0);
    case ColumnType.DWord:
    case ColumnType.DWordAlt:
      return data.readInt32LE(0);
    case ColumnType.Float:
      return data.readFloatLE(0);
    case ColumnType.Double:
      return data.readDoubleLE(0);
    case ColumnType.DateTime:
      return new Date(data.readDoubleLE(2) * 1000);
    case ColumnType.String: {
      const nullIndex = data.indexOf(0x00);
      const end = nullIndex === -1 ? data.length : nullIndex;
      return data.subarray(0, end).toString('latin1').trim();
    }
    default:
      return null;
  }
}

/**
 * Parses the binary header of an Elipse .dat file.
 *
 * @param buffer - Buffer containing at least the full header
 * @returns Parsed DatFileHeader with column definitions
 * @throws InvalidDatFileError if the header is malformed
 */
export function parseHeader(buffer: Buffer): DatFileHeader {
  if (buffer.length < 24) {
    throw new InvalidDatFileError('Buffer too small: must be at least 24 bytes');
  }

  if (!validateMagicHeader(buffer)) {
    throw new InvalidDatFileError('Invalid magic header');
  }

  const lineCount = buffer.readInt16LE(4);
  const rowSize = buffer.readInt8(16);
  const columnCount = buffer.readInt8(18);

  if (columnCount <= 0 || columnCount > 256) {
    throw new InvalidDatFileError(
      `Invalid column count: ${columnCount} (must be between 1 and 256)`,
    );
  }

  const headerByteLength = 24 + columnCount * 40;

  if (buffer.length < headerByteLength) {
    throw new InvalidDatFileError(
      `Buffer too small for ${columnCount} columns: need ${headerByteLength} bytes, got ${buffer.length}`,
    );
  }

  const columns: ColumnHeader[] = [];

  for (let i = 0; i < columnCount; i++) {
    const offset = 24 + i * 40;

    // Name: first 36 bytes, null-terminated latin1
    const nameBuffer = buffer.subarray(offset, offset + 36);
    const nullIndex = nameBuffer.indexOf(0x00);
    const nameEnd = nullIndex === -1 ? nameBuffer.length : nullIndex;
    const name = nameBuffer.subarray(0, nameEnd).toString('latin1').trim();

    // Type: 2 bytes at offset+36, Int16LE
    const typeValue = buffer.readInt16LE(offset + 36);

    if (!VALID_COLUMN_TYPES.has(typeValue)) {
      throw new InvalidDatFileError(
        `Unsupported column type ${typeValue} for column "${name}" at index ${i}`,
      );
    }

    const type = typeValue as ColumnType;

    // Raw size: 2 bytes at offset+38, Int16LE
    const rawSize = buffer.readInt16LE(offset + 38);
    const size = computeTypeSize(type, rawSize);

    if (size <= 0) {
      throw new InvalidDatFileError(
        `Invalid column size ${size} for column "${name}" at index ${i}`,
      );
    }

    columns.push({ name, type, size });
  }

  return {
    lineCount,
    rowSize,
    columnCount,
    columns,
    headerByteLength,
  };
}

/**
 * Async generator that streams and parses an Elipse .dat binary file.
 *
 * Reads the header to extract column definitions, then streams row data
 * using a sliding buffer window. Yields one DataRecord per row.
 *
 * @param filePath - Path to the .dat file
 * @yields DataRecord objects with column names as keys
 * @throws InvalidDatFileError if the file has an invalid magic header or malformed header
 * @throws CorruptedFileError if the file is truncated (partial row data at end)
 */
export async function* parseFile(filePath: string): AsyncGenerator<DataRecord> {
  // Step 1: Read the header — first read 24 bytes to get column count, then read full header
  const fh = await open(filePath, 'r');
  try {
    const minHeaderBuf = Buffer.alloc(24);
    const { bytesRead: minRead } = await fh.read(minHeaderBuf, 0, 24, 0);

    if (minRead < 24) {
      throw new InvalidDatFileError(`File too small to contain a valid header: ${filePath}`);
    }

    if (!validateMagicHeader(minHeaderBuf)) {
      throw new InvalidDatFileError(`Invalid magic header in ${filePath}`);
    }

    // Determine full header size from columnCount
    const columnCount = minHeaderBuf.readInt8(18);
    const fullHeaderSize = 24 + columnCount * 40;

    const headerBuffer = Buffer.alloc(fullHeaderSize);
    await fh.read(headerBuffer, 0, fullHeaderSize, 0);

    // Step 2: Parse column definitions
    const header = parseHeader(headerBuffer);
    const { columns, headerByteLength, rowSize } = header;

    // Step 3: Stream row data starting after the header
    const stream = createReadStream(filePath, {
      start: headerByteLength,
      highWaterMark: rowSize * 100,
    });

    let rowBuffer = Buffer.alloc(0);
    let rowsYielded = 0;

    try {
      for await (const chunk of stream) {
        rowBuffer = Buffer.concat([rowBuffer, chunk as Buffer]);

        while (rowBuffer.length >= rowSize) {
          const row = rowBuffer.subarray(0, rowSize);
          rowBuffer = rowBuffer.subarray(rowSize);

          const record: DataRecord = {};
          let fieldOffset = 0;

          for (const col of columns) {
            const fieldData = row.subarray(fieldOffset, fieldOffset + col.size);
            record[col.name] = decodeColumnValue(col.type, fieldData);
            fieldOffset += col.size;
          }

          rowsYielded++;
          yield record;
        }
      }
    } finally {
      stream.destroy();
    }

    // Step 4: Handle truncated file — leftover bytes that don't form a complete row
    if (rowBuffer.length > 0) {
      throw new CorruptedFileError(
        `Truncated file: ${rowBuffer.length} leftover bytes after ${rowsYielded} complete rows in ${filePath}`,
      );
    }
  } finally {
    await fh.close();
  }
}
