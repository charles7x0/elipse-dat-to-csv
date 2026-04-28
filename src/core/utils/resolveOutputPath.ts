import path from 'path';
import type { ConversionConfig, ExportFormat, NamingPattern } from '../types';

/**
 * Maps an export format to its file extension.
 */
function getExtension(format: ExportFormat): string {
  switch (format) {
    case 'csv':
      return '.csv';
    case 'Excel':
      return '.xlsx';
    case 'json':
      return '.json';
  }
}

/**
 * Resolves the output file path based on input path and conversion config.
 *
 * Naming patterns:
 * - `same-name`: output has same base name as input with new extension
 * - `tag-separated`: output has base name suffixed with `_tags`
 * - `merged-output`: all inputs map to a single `merged_output` file
 *
 * @param inputPath - Path to the input .dat file
 * @param config - Conversion configuration with outputDirectory, format, and namingPattern
 * @returns Full output file path
 */
export function resolveOutputPath(inputPath: string, config: ConversionConfig): string {
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const ext = getExtension(config.format);

  switch (config.namingPattern) {
    case 'same-name':
      return path.join(config.outputDirectory, `${baseName}${ext}`);
    case 'tag-separated':
      return path.join(config.outputDirectory, `${baseName}_tags${ext}`);
    case 'merged-output':
      return path.join(config.outputDirectory, `merged_output${ext}`);
  }
}
