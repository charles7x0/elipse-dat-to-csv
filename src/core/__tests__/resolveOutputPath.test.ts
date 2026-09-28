import { describe, it, expect } from 'vitest';
import path from 'path';
import { resolveOutputPath, resolveMergeOutputPath } from '../utils/resolveOutputPath';
import type { ConversionConfig } from '../types';

function makeConfig(overrides?: Partial<ConversionConfig>): ConversionConfig {
  return {
    inputFiles: [],
    outputDirectory: '/tmp/output',
    format: 'csv',
    namingPattern: 'same-name',
    ...overrides,
  };
}

describe('resolveOutputPath', () => {
  describe('same-name pattern', () => {
    it('uses input base name with .csv extension', () => {
      const result = resolveOutputPath('/data/plant_01.dat', makeConfig());
      expect(result).toBe(path.join('/tmp/output', 'plant_01.csv'));
    });

    it('uses input base name with .json extension', () => {
      const result = resolveOutputPath('/data/plant_01.dat', makeConfig({ format: 'json' }));
      expect(result).toBe(path.join('/tmp/output', 'plant_01.json'));
    });

    it('uses input base name with .xlsx extension for Excel', () => {
      const result = resolveOutputPath('/data/plant_01.dat', makeConfig({ format: 'Excel' }));
      expect(result).toBe(path.join('/tmp/output', 'plant_01.xlsx'));
    });
  });

  describe('tag-separated pattern', () => {
    it('appends _tags suffix with .csv extension', () => {
      const result = resolveOutputPath('/data/plant_01.dat', makeConfig({ namingPattern: 'tag-separated' }));
      expect(result).toBe(path.join('/tmp/output', 'plant_01_tags.csv'));
    });

    it('appends _tags suffix with .json extension', () => {
      const result = resolveOutputPath('/data/plant_01.dat', makeConfig({ namingPattern: 'tag-separated', format: 'json' }));
      expect(result).toBe(path.join('/tmp/output', 'plant_01_tags.json'));
    });

    it('appends _tags suffix with .xlsx extension', () => {
      const result = resolveOutputPath('/data/plant_01.dat', makeConfig({ namingPattern: 'tag-separated', format: 'Excel' }));
      expect(result).toBe(path.join('/tmp/output', 'plant_01_tags.xlsx'));
    });
  });

  describe('resolveMergeOutputPath', () => {
    it('defaults to merged_output with the format extension', () => {
      expect(resolveMergeOutputPath(makeConfig({ mergeOutput: true }))).toBe(
        path.join('/tmp/output', 'merged_output.csv'),
      );
      expect(resolveMergeOutputPath(makeConfig({ mergeOutput: true, format: 'json' }))).toBe(
        path.join('/tmp/output', 'merged_output.json'),
      );
      expect(resolveMergeOutputPath(makeConfig({ mergeOutput: true, format: 'Excel' }))).toBe(
        path.join('/tmp/output', 'merged_output.xlsx'),
      );
    });

    it('uses a custom merge file name', () => {
      const result = resolveMergeOutputPath(
        makeConfig({ mergeOutput: true, mergeFileName: 'my_report' }),
      );
      expect(result).toBe(path.join('/tmp/output', 'my_report.csv'));
    });

    it('strips a trailing extension from the custom name', () => {
      const result = resolveMergeOutputPath(
        makeConfig({ mergeOutput: true, mergeFileName: 'my_report.csv', format: 'json' }),
      );
      expect(result).toBe(path.join('/tmp/output', 'my_report.json'));
    });

    it('falls back to default for an empty or whitespace name', () => {
      expect(
        resolveMergeOutputPath(makeConfig({ mergeOutput: true, mergeFileName: '   ' })),
      ).toBe(path.join('/tmp/output', 'merged_output.csv'));
    });

    it('strips directory components to prevent path traversal', () => {
      const result = resolveMergeOutputPath(
        makeConfig({ mergeOutput: true, mergeFileName: '../../etc/evil' }),
      );
      expect(result).toBe(path.join('/tmp/output', 'evil.csv'));
    });
  });

  describe('edge cases', () => {
    it('strips non-.dat extensions correctly', () => {
      const result = resolveOutputPath('/data/report.bin', makeConfig());
      expect(result).toBe(path.join('/tmp/output', 'report.csv'));
    });

    it('handles deeply nested input paths', () => {
      const result = resolveOutputPath('/a/b/c/d/file.dat', makeConfig({ outputDirectory: '/out' }));
      expect(result).toBe(path.join('/out', 'file.csv'));
    });
  });
});
