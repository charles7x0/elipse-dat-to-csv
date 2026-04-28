import { open } from 'fs/promises';
import path from 'path';
import type { ParserRegistry, ExporterRegistry, ConvertOptions } from './types';
import type { ExportFormat, FileResult, ColumnHeader } from './types';
import { parseHeader } from './parsers';
import { wrapFsError } from './utils';

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
