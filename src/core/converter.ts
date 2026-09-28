import { open } from 'fs/promises';
import path from 'path';
import type { ParserRegistry, ExporterRegistry, ConvertOptions } from './types';
import type { ExportFormat, FileResult, ColumnHeader, DataRecord } from './types';
import { ColumnType } from './types';
import { parseHeader } from './parsers';
import { wrapFsError, MergeMismatchError } from './utils';

/**
 * Reads the .dat file header and extracts column definitions.
 * Reads the minimum 24 bytes first to determine column count,
 * then reads the full header to parse column definitions.
 */
async function readColumns(inputPath: string): Promise<ColumnHeader[]> {
  let fh;
  try {
    fh = await open(inputPath, 'r');
  } catch (err) {
    wrapFsError(err, inputPath);
  }
  try {
    // Read minimum header to get column count
    const minBuf = Buffer.alloc(24);
    const { bytesRead } = await fh.read(minBuf, 0, 24, 0);
    if (bytesRead < 24) {
      throw new Error(`File too small to contain a valid header: ${inputPath}`);
    }

    const columnCount = minBuf.readInt8(18);
    const fullHeaderSize = 24 + columnCount * 40;

    const headerBuf = Buffer.alloc(fullHeaderSize);
    await fh.read(headerBuf, 0, fullHeaderSize, 0);

    const header = parseHeader(headerBuf);
    return header.columns;
  } finally {
    await fh.close();
  }
}

/**
 * Converts a single input file to the specified output format.
 *
 * Gets the appropriate parser and exporter from their registries,
 * streams records from parser to exporter, and returns a FileResult.
 *
 * @param inputPath - Path to the input file
 * @param outputPath - Path for the output file
 * @param format - Export format (csv, Excel, json)
 * @param options - Registries for parser and exporter lookup
 * @returns FileResult with rowCount, durationMs, success status
 */
export async function convertFile(
  inputPath: string,
  outputPath: string,
  format: ExportFormat,
  options: ConvertOptions,
): Promise<FileResult> {
  const startTime = Date.now();

  try {
    // Get parser based on file extension
    const parser = options.parserRegistry.getParser(inputPath);
    if (!parser) {
      const ext = path.extname(inputPath);
      throw new Error(`No parser registered for extension: ${ext}`);
    }

    // Get exporter based on format
    const exporter = options.exporterRegistry.get(format);

    // Read column definitions from the file header
    const columns = await readColumns(inputPath);

    // Initialize exporter with output path and columns
    await exporter.initialize(outputPath, columns);

    // Stream records from parser to exporter
    let rowCount = 0;
    try {
      for await (const record of parser.parseFile(inputPath)) {
        try {
          await exporter.writeRecord(record);
        } catch (writeErr) {
          wrapFsError(writeErr, outputPath);
        }
        rowCount++;
      }
    } finally {
      try {
        await exporter.finalize();
      } catch (finalizeErr) {
        wrapFsError(finalizeErr, outputPath);
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      filePath: inputPath,
      success: true,
      rowCount,
      outputPath,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;

    return {
      filePath: inputPath,
      success: false,
      rowCount: 0,
      outputPath,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Compares two column lists for merge compatibility.
 * Columns must match in count, name, type, and order.
 *
 * @returns null if compatible, or a human-readable reason describing the mismatch
 */
function describeColumnMismatch(
  reference: ColumnHeader[],
  candidate: ColumnHeader[],
): string | null {
  if (reference.length !== candidate.length) {
    return `column count differs (expected ${reference.length}, got ${candidate.length})`;
  }
  for (let i = 0; i < reference.length; i++) {
    const a = reference[i];
    const b = candidate[i];
    if (a.name !== b.name) {
      return `column ${i} name differs (expected "${a.name}", got "${b.name}")`;
    }
    if (a.type !== b.type) {
      return `column "${a.name}" type differs (expected ${a.type}, got ${b.type})`;
    }
  }
  return null;
}

/**
 * Finds the name of the first DateTime column in a column list, or null if none.
 * Used to sort merged rows chronologically.
 */
function findDateTimeColumn(columns: ColumnHeader[]): string | null {
  const col = columns.find((c) => c.type === ColumnType.DateTime);
  return col ? col.name : null;
}

/** Result of a merge operation covering multiple input files. */
export interface MergeResult {
  success: boolean;
  inputFiles: string[];
  outputPath: string;
  rowCount: number;
  durationMs: number;
  error?: string;
}

/**
 * Merges multiple .dat files into a single output file.
 *
 * All input files must share identical column definitions (name, type, order);
 * otherwise a MergeMismatchError is thrown. Rows from every file are collected,
 * sorted ascending by the first DateTime column (if present), then written once
 * through the exporter.
 *
 * Note: unlike per-file conversion, merge buffers all rows in memory because
 * chronological sorting requires the full dataset. This is a deliberate tradeoff
 * for the merged-output mode.
 *
 * @param inputPaths - Paths to the input .dat files (at least one)
 * @param outputPath - Path for the single merged output file
 * @param format - Export format (csv, Excel, json)
 * @param options - Registries for parser and exporter lookup
 * @returns MergeResult with combined rowCount and timing
 */
export async function mergeFiles(
  inputPaths: string[],
  outputPath: string,
  format: ExportFormat,
  options: ConvertOptions,
): Promise<MergeResult> {
  const startTime = Date.now();

  try {
    if (inputPaths.length === 0) {
      throw new Error('No input files provided for merge');
    }

    // Read and validate columns across all files (option c: identical headers)
    const referenceColumns = await readColumns(inputPaths[0]);
    for (let i = 1; i < inputPaths.length; i++) {
      const columns = await readColumns(inputPaths[i]);
      const mismatch = describeColumnMismatch(referenceColumns, columns);
      if (mismatch) {
        throw new MergeMismatchError(
          `Cannot merge "${path.basename(inputPaths[i])}": ${mismatch}. ` +
            `All files must have identical columns to merge.`,
        );
      }
    }

    const parser = options.parserRegistry.getParser(inputPaths[0]);
    if (!parser) {
      const ext = path.extname(inputPaths[0]);
      throw new Error(`No parser registered for extension: ${ext}`);
    }

    // Collect all rows from every file (buffered for sorting)
    const allRecords: DataRecord[] = [];
    for (const inputPath of inputPaths) {
      for await (const record of parser.parseFile(inputPath)) {
        allRecords.push(record);
      }
    }

    // Sort ascending by the DateTime column, if one exists
    const dateColumn = findDateTimeColumn(referenceColumns);
    if (dateColumn) {
      allRecords.sort((a, b) => {
        const av = a[dateColumn];
        const bv = b[dateColumn];
        const at = av instanceof Date ? av.getTime() : Number.NEGATIVE_INFINITY;
        const bt = bv instanceof Date ? bv.getTime() : Number.NEGATIVE_INFINITY;
        return at - bt;
      });
    }

    // Write once through the exporter
    const exporter = options.exporterRegistry.get(format);
    await exporter.initialize(outputPath, referenceColumns);

    let rowCount = 0;
    try {
      for (const record of allRecords) {
        try {
          await exporter.writeRecord(record);
        } catch (writeErr) {
          wrapFsError(writeErr, outputPath);
        }
        rowCount++;
      }
    } finally {
      try {
        await exporter.finalize();
      } catch (finalizeErr) {
        wrapFsError(finalizeErr, outputPath);
      }
    }

    return {
      success: true,
      inputFiles: inputPaths,
      outputPath,
      rowCount,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      inputFiles: inputPaths,
      outputPath,
      rowCount: 0,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
