import { describe, it, expect } from 'vitest';
import {
  PermissionError,
  DiskSpaceError,
  InvalidDatFileError,
  CorruptedFileError,
  UnsupportedColumnTypeError,
} from '../utils/errors';

describe('Custom error classes', () => {
  it('InvalidDatFileError has correct name', () => {
    const err = new InvalidDatFileError('bad file');
    expect(err.name).toBe('InvalidDatFileError');
    expect(err.message).toBe('bad file');
    expect(err).toBeInstanceOf(Error);
  });

  it('CorruptedFileError has correct name', () => {
    const err = new CorruptedFileError('corrupted at row 5');
    expect(err.name).toBe('CorruptedFileError');
    expect(err.message).toBe('corrupted at row 5');
    expect(err).toBeInstanceOf(Error);
  });

  it('UnsupportedColumnTypeError has correct name', () => {
    const err = new UnsupportedColumnTypeError('Unknown column type: 42');
    expect(err.name).toBe('UnsupportedColumnTypeError');
    expect(err.message).toBe('Unknown column type: 42');
    expect(err).toBeInstanceOf(Error);
  });

  it('PermissionError has correct name', () => {
    const err = new PermissionError('Permission denied: /path');
    expect(err.name).toBe('PermissionError');
    expect(err).toBeInstanceOf(Error);
  });

  it('DiskSpaceError has correct name', () => {
    const err = new DiskSpaceError('No space left');
    expect(err.name).toBe('DiskSpaceError');
    expect(err).toBeInstanceOf(Error);
  });
});
