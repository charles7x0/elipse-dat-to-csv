/** Thrown when a file does not start with the expected magic header 0xa7eda5db */
export class InvalidDatFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDatFileError';
  }
}

/** Thrown when a .dat file header is valid but row data is malformed or truncated */
export class CorruptedFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorruptedFileError';
  }
}

/** Thrown when a column type in the header is not one of the known types (3, 6, 8, 9) */
export class UnsupportedColumnTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedColumnTypeError';
  }
}

/** Thrown when a file cannot be read or an output directory cannot be written to */
export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

/** Thrown when output write fails due to insufficient disk space */
export class DiskSpaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiskSpaceError';
  }
}
