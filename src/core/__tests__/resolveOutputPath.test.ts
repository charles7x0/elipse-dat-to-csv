import { describe, it, expect } from 'vitest';
import path from 'path';
import { resolveOutputPath } from '../utils/resolveOutputPath';
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

  describe('merged-output pattern', () => {
    it('uses merged_output name with .csv extension', () => {
      const result = resolveOutputPath('/data/plant_01.dat', makeConfig({ namingPattern: 'merged-output' }));
      expect(result).toBe(path.join('/tmp/output', 'merged_output.csv'));
    });

    it('uses merged_output name with .json extension', () => {
      const result = resolveOutputPath('/data/plant_01.dat', makeConfig({ namingPattern: 'merged-output', format: 'json' }));
      expect(result).toBe(path.join('/tmp/output', 'merged_output.json'));
    });

    it('uses merged_output name with .xlsx extension', () => {
      const result = resolveOutputPath('/data/plant_01.dat', makeConfig({ namingPattern: 'merged-output', format: 'Excel' }));
      expect(result).toBe(path.join('/tmp/output', 'merged_output.xlsx'));
    });

    it('ignores input file name entirely', () => {
      const r1 = resolveOutputPath('/data/file_a.dat', makeConfig({ namingPattern: 'merged-output' }));
      const r2 = resolveOutputPath('/data/file_b.dat', makeConfig({ namingPattern: 'merged-output' }));
      expect(r1).toBe(r2);
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
