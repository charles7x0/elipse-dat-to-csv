import type { ExportFormat } from './data';

export type NamingPattern = 'same-name' | 'tag-separated';

export interface ConversionConfig {
  inputFiles: string[];
  outputDirectory: string;
  format: ExportFormat;
  /** Naming pattern for per-file output. Ignored when `mergeOutput` is true. */
  namingPattern: NamingPattern;
  /**
   * When true, all input files are concatenated into a single output file
   * (sorted by timestamp) instead of producing one output per input.
   */
  mergeOutput?: boolean;
  /**
   * Base name (without extension) for the merged output file.
   * Only used when `mergeOutput` is true. Defaults to `merged_output`.
   */
  mergeFileName?: string;
}

export interface ProgressUpdate {
  currentFileIndex: number;
  totalFiles: number;
  currentFileName: string;
  bytesProcessed: number;
  totalBytes: number;
  rowsProcessed: number;
  status: 'processing' | 'complete' | 'error' | 'cancelled';
}

export interface FileResult {
  filePath: string;
  success: boolean;
  rowCount: number;
  outputPath: string;
  durationMs: number;
  error?: string;
}

export interface BatchResult {
  totalFiles: number;
  successCount: number;
  failureCount: number;
  totalRows: number;
  totalDurationMs: number;
  results: FileResult[];
}

export interface FileError {
  filePath: string;
  error: string;
}
