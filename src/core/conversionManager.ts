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
import { convertFile, mergeFiles } from './converter';
import { resolveOutputPath, resolveMergeOutputPath } from './utils';
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

    // Node's EventEmitter throws if an 'error' event is emitted with no listener
    // attached. A failed file/merge is a normal, recoverable outcome that is
    // already captured in the returned BatchResult, so a caller that does not
    // subscribe to 'error' must not crash. This no-op guarantees at least one
    // listener; real subscribers still receive the event alongside it.
    this.on('error', () => {
      /* swallow: failures are reported via the returned BatchResult */
    });
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

    // Merge mode: concatenate all files into a single output,
    // sorted chronologically. Handled separately from per-file conversion.
    if (config.mergeOutput) {
      return this.runMerge(files, config);
    }

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
   * Merges all input files into a single output, sorted by timestamp.
   * Emits live 'progress' events as files are read and rows are written,
   * then 'fileComplete' or 'error'.
   * Returns a BatchResult where the merged output is represented as one entry.
   */
  private async runMerge(files: string[], config: ConversionConfig): Promise<BatchResult> {
    const outputPath = resolveMergeOutputPath(config);
    const startTime = Date.now();

    // Initial event so the UI shows activity immediately.
    this.emit('progress', {
      currentFileIndex: 0,
      totalFiles: files.length,
      currentFileName: path.basename(files[0] ?? outputPath),
      bytesProcessed: 0,
      totalBytes: 0,
      rowsProcessed: 0,
      status: 'processing',
    } satisfies ProgressUpdate);

    const merge = await mergeFiles(
      files,
      outputPath,
      config.format,
      {
        parserRegistry: this.parserRegistry,
        exporterRegistry: this.exporterRegistry,
      },
      (p) => {
        // Translate merge-phase progress into the UI's ProgressUpdate shape.
        // Reading phase advances currentFileIndex per file; writing phase holds
        // the index at the last file and reports rows written.
        this.emit('progress', {
          currentFileIndex:
            p.phase === 'reading' ? (p.fileIndex ?? 0) : Math.max(0, files.length - 1),
          totalFiles: files.length,
          currentFileName:
            p.phase === 'reading'
              ? (p.fileName ?? path.basename(outputPath))
              : path.basename(outputPath),
          bytesProcessed: 0,
          totalBytes: 0,
          rowsProcessed: p.rowsProcessed,
          status: 'processing',
        } satisfies ProgressUpdate);
      },
    );

    const durationMs = Date.now() - startTime;

    const result: FileResult = {
      filePath: merge.inputFiles.join(', '),
      success: merge.success,
      rowCount: merge.rowCount,
      outputPath: merge.outputPath,
      durationMs,
      error: merge.error,
    };

    if (merge.success) {
      this.emit('fileComplete', result);
    } else {
      this.emit('error', {
        filePath: result.filePath,
        error: merge.error ?? 'Unknown error',
      } satisfies FileError);
    }

    return {
      totalFiles: files.length,
      successCount: merge.success ? 1 : 0,
      failureCount: merge.success ? 0 : 1,
      totalRows: merge.rowCount,
      totalDurationMs: durationMs,
      results: [result],
    };
  }

  /**
   * Sets the cancellation flag. No new files will be started after this call.
   */
  cancelBatch(): void {
    this.cancelled = true;
  }
}
