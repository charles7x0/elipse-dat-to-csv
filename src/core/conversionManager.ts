import { EventEmitter } from 'events';
import path from 'path';
import { stat } from 'fs/promises';
import type { ParserRegistry, ExporterRegistry } from './types';
import type {
  ConversionConfig,
  BatchResult,
  ProgressUpdate,
  FileResult,
  FileError,
} from './types';
import { convertFile } from './converter';
import { resolveOutputPath } from './utils';
import { validateOutputDirectory } from './utils';

/**
 * Orchestrates batch file conversion with progress events and cancellation.
 * Extends EventEmitter to emit 'progress', 'fileComplete', and 'error' events.
 */
export class ConversionManager extends EventEmitter {
  private cancelled = false;
  private parserRegistry: ParserRegistry;
  private exporterRegistry: ExporterRegistry;

  constructor(parserRegistry: ParserRegistry, exporterRegistry: ExporterRegistry) {
    super();
    this.parserRegistry = parserRegistry;
    this.exporterRegistry = exporterRegistry;
  }

  /**
   * Process files sequentially, emitting progress events for each file.
   * On failure: record in results, continue to next file.
   * Returns BatchResult with full accounting.
   */
  async startBatch(files: string[], config: ConversionConfig): Promise<BatchResult> {
    this.cancelled = false;

    // Validate output directory is writable before starting conversion
    await validateOutputDirectory(config.outputDirectory);

    const results: FileResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < files.length; i++) {
      // Check cancellation flag before each file
      if (this.cancelled) break;

      const inputPath = files[i];
      const outputPath = resolveOutputPath(inputPath, config);

      // Get file size for progress event (default to 0 on error)
      let totalBytes = 0;
      try {
        const fileStat = await stat(inputPath);
        totalBytes = fileStat.size;
      } catch {
        // File may not exist — will be caught during conversion
      }

      this.emit('progress', {
        currentFileIndex: i,
        totalFiles: files.length,
        currentFileName: path.basename(inputPath),
        bytesProcessed: 0,
        totalBytes,
        rowsProcessed: 0,
        status: 'processing',
      } satisfies ProgressUpdate);

      const result = await convertFile(inputPath, outputPath, config.format, {
        parserRegistry: this.parserRegistry,
        exporterRegistry: this.exporterRegistry,
      });

      results.push(result);

      if (result.success) {
        successCount++;
        this.emit('fileComplete', result);
      } else {
        failureCount++;
        this.emit('error', {
          filePath: result.filePath,
          error: result.error ?? 'Unknown error',
        } satisfies FileError);
      }
    }

    return {
      totalFiles: files.length,
      successCount,
      failureCount,
      totalRows: results.reduce((sum, r) => sum + r.rowCount, 0),
      totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
      results,
    };
  }

  /**
   * Sets the cancellation flag. No new files will be started after this call.
   */
  cancelBatch(): void {
    this.cancelled = true;
  }
}
