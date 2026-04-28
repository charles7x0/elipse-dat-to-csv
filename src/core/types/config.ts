import type { ExportFormat } from './data';

export type NamingPattern = 'same-name' | 'tag-separated' | 'merged-output';

export interface ConversionConfig {
  inputFiles: string[];
  outputDirectory: string;
  format: ExportFormat;
  namingPattern: NamingPattern;
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
