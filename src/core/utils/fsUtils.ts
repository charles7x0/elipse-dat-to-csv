import { accessSync, constants } from 'fs';
import { PermissionError, DiskSpaceError } from './errors';

/**
 * Wraps a Node.js filesystem error into the appropriate custom error type.
 * - EACCES / EPERM → PermissionError
 * - ENOSPC → DiskSpaceError
 * - Otherwise re-throws the original error
 */
export function wrapFsError(err: unknown, contextPath: string): never {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM') {
      throw new PermissionError(`Permission denied: ${contextPath}`);
    }
    if (code === 'ENOSPC') {
      throw new DiskSpaceError(`Disk space exhausted while writing: ${contextPath}`);
    }
  }
  throw err;
}

/**
 * Validates that the given directory path exists and is writable.
 * Throws PermissionError if the directory is not writable.
 */
export async function validateOutputDirectory(dirPath: string): Promise<void> {
  try {
    accessSync(dirPath, constants.W_OK);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throw new PermissionError(`Output directory does not exist: ${dirPath}`);
      }
      if (code === 'EACCES' || code === 'EPERM') {
        throw new PermissionError(`Output directory is not writable: ${dirPath}`);
      }
    }
    throw new PermissionError(`Cannot access output directory: ${dirPath}`);
  }
}
