/** Magic header constant for Elipse .dat files (prefer DAT_MAGIC_BYTES from datParser) */
export const DAT_MAGIC_HEADER = Buffer.from([0xa7, 0xed, 0xa5, 0xdb]);

/** Supported column types in .dat binary format */
export enum ColumnType {
  Boolean = 2, // 1 byte, non-zero = true
  Word = 3, // Int16LE, 2 bytes
  DWord = 4, // Int32LE, 4 bytes
  DWordAlt = 5, // Int32LE, 4 bytes (alternate DWord code)
  Float = 6, // FloatLE, 4 bytes
  Double = 7, // DoubleLE, 8 bytes
  DateTime = 8, // DoubleLE epoch seconds at offset+2, 10 bytes (2 padding + 8 data)
  String = 9, // Latin1 encoded, variable length
}

export interface ColumnHeader {
  name: string; // 36 bytes, latin1, null-terminated
  type: ColumnType; // 2 bytes, Int16LE
  size: number; // computed from type + raw size field
}

export interface DatFileHeader {
  lineCount: number; // offset 4-6, Int16LE
  rowSize: number; // offset 16-18, Int8
  columnCount: number; // offset 18-20, Int8
  columns: ColumnHeader[];
  headerByteLength: number; // 24 + (columnCount * 40)
}

export interface DataRecord {
  [columnName: string]: Date | string | number | boolean | null;
}

export type ExportFormat = 'csv' | 'Excel' | 'json';
