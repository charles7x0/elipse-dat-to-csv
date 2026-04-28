import type {
  DataRecord,
  DatFileHeader,
  ColumnHeader,
  ExportFormat,
} from './data';
import type {
  ConversionConfig,
  BatchResult,
  ProgressUpdate,
  FileResult,
  FileError,
} from './config';

/** Base parser interface — all input format parsers implement this */
export interface InputParser {
  readonly supportedExtensions: string[];
  canParse(filePath: string): Promise<boolean>;
  parseFile(filePath: string): AsyncGenerator<DataRecord>;
}

/** DAT parser — Elipse SCADA historian .dat binary files */
export interface DatParser extends InputParser {
  parseHeader(buffer: Buffer): DatFileHeader;
  validateMagicHeader(buffer: Buffer): boolean;
}

/** Registry to select the correct parser based on file type */
export interface ParserRegistry {
  register(parser: InputParser): void;
  getParser(filePath: string): InputParser | null;
  supportedExtensions(): string[];
}

/** Streaming exporter interface for output formats */
export interface Exporter {
  readonly format: ExportFormat;
  initialize(outputPath: string, columns: ColumnHeader[]): Promise<void>;
  writeRecord(record: DataRecord): Promise<void>;
  finalize(): Promise<void>;
}

/** Registry for pluggable export format writers */
export interface ExporterRegistry {
  register(exporter: Exporter): void;
  get(format: ExportFormat): Exporter;
  supportedFormats(): ExportFormat[];
}

/** Orchestrates batch file conversion with progress events and cancellation */
export interface ConversionManager {
  startBatch(files: string[], config: ConversionConfig): Promise<BatchResult>;
  cancelBatch(): void;
  on(event: 'progress', handler: (update: ProgressUpdate) => void): void;
  on(event: 'fileComplete', handler: (result: FileResult) => void): void;
  on(event: 'error', handler: (error: FileError) => void): void;
}

/** Options for single-file conversion — provides parser and exporter registries */
export interface ConvertOptions {
  parserRegistry: ParserRegistry;
  exporterRegistry: ExporterRegistry;
}
