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

/** Default base name for the merged output file when none is provided. */
export const DEFAULT_MERGE_FILE_NAME = 'merged_output';

/**
 * Sanitizes a user-provided merge file name: strips any directory components
 * and a trailing extension, and falls back to the default if empty.
 */
function sanitizeMergeBaseName(name: string | undefined): string {
  if (!name) {
    return DEFAULT_MERGE_FILE_NAME;
  }
  // Strip directory separators to prevent path traversal, then drop any extension
  const base = path.basename(name.trim());
  const withoutExt = base.replace(/\.[^.]+$/, '');
  return withoutExt.length > 0 ? withoutExt : DEFAULT_MERGE_FILE_NAME;
}

/**
 * Resolves the per-file output path based on input path and conversion config.
 *
 * Naming patterns:
 * - `same-name`: output has same base name as input with new extension
 * - `tag-separated`: output has base name suffixed with `_tags`
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
  }
}

/**
 * Resolves the single output path for merge mode, using `config.mergeFileName`
 * (sanitized, without extension) or the default `merged_output`.
 *
 * @param config - Conversion configuration with outputDirectory, format, and optional mergeFileName
 * @returns Full merged output file path
 */
export function resolveMergeOutputPath(config: ConversionConfig): string {
  const ext = getExtension(config.format);
  const baseName = sanitizeMergeBaseName(config.mergeFileName);
  return path.join(config.outputDirectory, `${baseName}${ext}`);
}
