import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import type { ParserRegistry, ExporterRegistry } from '../types';
import type { ConversionConfig, ProgressUpdate, FileResult, FileError } from '../types';

// Mock convertFile before importing ConversionManager
vi.mock('../converter', () => ({
  convertFile: vi.fn(),
}));

// Mock fs/promises stat
vi.mock('fs/promises', () => ({
  stat: vi.fn().mockResolvedValue({ size: 1024 }),
}));

// Mock validateOutputDirectory to avoid real filesystem checks in unit tests
vi.mock('../utils/fsUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/fsUtils')>();
  return {
    ...actual,
    validateOutputDirectory: vi.fn().mockResolvedValue(undefined),
  };
});

import { ConversionManager } from '../conversionManager';
import { convertFile } from '../converter';

const mockConvertFile = vi.mocked(convertFile);

function createMockRegistries(): { parserRegistry: ParserRegistry; exporterRegistry: ExporterRegistry } {
  return {
    parserRegistry: {
      register: vi.fn(),
      getParser: vi.fn(),
      supportedExtensions: vi.fn().mockReturnValue(['.dat']),
    },
    exporterRegistry: {
      register: vi.fn(),
      get: vi.fn(),
      supportedFormats: vi.fn().mockReturnValue(['csv']),
    },
  };
}

function createConfig(overrides?: Partial<ConversionConfig>): ConversionConfig {
  return {
    inputFiles: [],
    outputDirectory: '/tmp/output',
    format: 'csv',
    namingPattern: 'same-name',
    ...overrides,
  };
}

function makeSuccessResult(filePath: string, outputPath: string, rowCount = 2): FileResult {
  return {
    filePath,
    success: true,
    rowCount,
    outputPath,
    durationMs: 10,
  };
}

function makeFailureResult(filePath: string, outputPath: string, error: string): FileResult {
  return {
    filePath,
    success: false,
    rowCount: 0,
    outputPath,
    durationMs: 5,
    error,
  };
}

describe('ConversionManager', () => {
  let manager: ConversionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    const { parserRegistry, exporterRegistry } = createMockRegistries();
    manager = new ConversionManager(parserRegistry, exporterRegistry);

    // Default: convertFile succeeds
    mockConvertFile.mockImplementation(async (inputPath, outputPath) => {
      return makeSuccessResult(inputPath, outputPath);
    });
  });

  describe('startBatch', () => {
    it('returns empty batch result for empty file list', async () => {
      const result = await manager.startBatch([], createConfig());

      expect(result.totalFiles).toBe(0);
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('processes files sequentially and returns correct accounting', async () => {
      const files = ['/data/file1.dat', '/data/file2.dat'];
      const result = await manager.startBatch(files, createConfig());

      expect(result.totalFiles).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.successCount + result.failureCount).toBe(result.results.length);
    });

    it('emits progress event before each file', async () => {
      const progressEvents: ProgressUpdate[] = [];
      manager.on('progress', (update) => progressEvents.push(update));

      const files = ['/data/file1.dat', '/data/file2.dat'];
      await manager.startBatch(files, createConfig());

      expect(progressEvents).toHaveLength(2);
      expect(progressEvents[0].currentFileIndex).toBe(0);
      expect(progressEvents[0].totalFiles).toBe(2);
      expect(progressEvents[0].currentFileName).toBe('file1.dat');
      expect(progressEvents[0].status).toBe('processing');
      expect(progressEvents[0].totalBytes).toBe(1024);
      expect(progressEvents[1].currentFileIndex).toBe(1);
      expect(progressEvents[1].currentFileName).toBe('file2.dat');
    });

    it('emits fileComplete event for successful files', async () => {
      const completeEvents: FileResult[] = [];
      manager.on('fileComplete', (result) => completeEvents.push(result));

      await manager.startBatch(['/data/file1.dat'], createConfig());

      expect(completeEvents).toHaveLength(1);
      expect(completeEvents[0].success).toBe(true);
      expect(completeEvents[0].filePath).toBe('/data/file1.dat');
    });

    it('emits error event and continues on file failure', async () => {
      mockConvertFile
        .mockResolvedValueOnce(makeFailureResult('/data/bad.dat', '/tmp/output/bad.csv', 'Parse error'))
        .mockResolvedValueOnce(makeSuccessResult('/data/good.dat', '/tmp/output/good.csv'));

      const errorEvents: FileError[] = [];
      const completeEvents: FileResult[] = [];
      manager.on('error', (err) => errorEvents.push(err));
      manager.on('fileComplete', (result) => completeEvents.push(result));

      const files = ['/data/bad.dat', '/data/good.dat'];
      const result = await manager.startBatch(files, createConfig());

      expect(result.failureCount).toBe(1);
      expect(result.successCount).toBe(1);
      expect(result.successCount + result.failureCount).toBe(2);
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].filePath).toBe('/data/bad.dat');
      expect(errorEvents[0].error).toBe('Parse error');
      expect(completeEvents).toHaveLength(1);
      expect(completeEvents[0].filePath).toBe('/data/good.dat');
    });

    it('respects cancellation flag — stops before next file', async () => {
      manager.on('progress', (update: ProgressUpdate) => {
        if (update.currentFileIndex === 0) {
          manager.cancelBatch();
        }
      });

      const files = ['/data/file1.dat', '/data/file2.dat', '/data/file3.dat'];
      const result = await manager.startBatch(files, createConfig());

      // First file processed, then cancellation checked before file2
      expect(result.totalFiles).toBe(3);
      expect(result.results).toHaveLength(1);
      expect(result.successCount + result.failureCount).toBe(1);
    });

    it('computes totalRows and totalDurationMs from results', async () => {
      mockConvertFile
        .mockResolvedValueOnce(makeSuccessResult('/data/f1.dat', '/tmp/output/f1.csv', 10))
        .mockResolvedValueOnce(makeSuccessResult('/data/f2.dat', '/tmp/output/f2.csv', 20));

      const files = ['/data/f1.dat', '/data/f2.dat'];
      const result = await manager.startBatch(files, createConfig());

      expect(result.totalRows).toBe(30);
      expect(result.totalDurationMs).toBe(20); // 10 + 10
    });

    it('resolves output path with correct extension for json format', async () => {
      await manager.startBatch(
        ['/data/file1.dat'],
        createConfig({ format: 'json' }),
      );

      expect(mockConvertFile).toHaveBeenCalledWith(
        '/data/file1.dat',
        path.join('/tmp/output', 'file1.json'),
        'json',
        expect.any(Object),
      );
    });

    it('resolves output path with .xlsx extension for Excel format', async () => {
      await manager.startBatch(
        ['/data/file1.dat'],
        createConfig({ format: 'Excel' }),
      );

      expect(mockConvertFile).toHaveBeenCalledWith(
        '/data/file1.dat',
        path.join('/tmp/output', 'file1.xlsx'),
        'Excel',
        expect.any(Object),
      );
    });

    it('passes parserRegistry and exporterRegistry to convertFile', async () => {
      await manager.startBatch(['/data/file1.dat'], createConfig());

      expect(mockConvertFile).toHaveBeenCalledWith(
        '/data/file1.dat',
        expect.any(String),
        'csv',
        expect.objectContaining({
          parserRegistry: expect.any(Object),
          exporterRegistry: expect.any(Object),
        }),
      );
    });
  });

  describe('cancelBatch', () => {
    it('resets cancellation flag on new startBatch call', async () => {
      manager.cancelBatch();

      const result = await manager.startBatch(
        ['/data/file1.dat'],
        createConfig(),
      );

      // startBatch resets the flag, so the file is still processed
      expect(result.results).toHaveLength(1);
    });
  });
});
