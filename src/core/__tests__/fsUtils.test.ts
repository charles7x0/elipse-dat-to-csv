import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import { wrapFsError, validateOutputDirectory } from '../utils/fsUtils';
import { PermissionError, DiskSpaceError } from '../utils/errors';

describe('wrapFsError', () => {
  it('wraps EACCES into PermissionError', () => {
    const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    expect(() => wrapFsError(err, '/some/path')).toThrow(PermissionError);
    expect(() => wrapFsError(err, '/some/path')).toThrow('Permission denied: /some/path');
  });

  it('wraps EPERM into PermissionError', () => {
    const err = Object.assign(new Error('EPERM'), { code: 'EPERM' });
    expect(() => wrapFsError(err, '/some/file.dat')).toThrow(PermissionError);
    expect(() => wrapFsError(err, '/some/file.dat')).toThrow('Permission denied: /some/file.dat');
  });

  it('wraps ENOSPC into DiskSpaceError', () => {
    const err = Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
    expect(() => wrapFsError(err, '/output/file.csv')).toThrow(DiskSpaceError);
    expect(() => wrapFsError(err, '/output/file.csv')).toThrow(
      'Disk space exhausted while writing: /output/file.csv',
    );
  });

  it('re-throws unknown errors unchanged', () => {
    const err = new Error('Something else');
    expect(() => wrapFsError(err, '/path')).toThrow('Something else');
  });

  it('re-throws unknown fs error codes unchanged', () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    expect(() => wrapFsError(err, '/path')).toThrow('ENOENT');
  });
});

describe('validateOutputDirectory', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      os.tmpdir(),
      `fsutils-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('succeeds for a writable directory', async () => {
    await expect(validateOutputDirectory(tmpDir)).resolves.toBeUndefined();
  });

  it('throws PermissionError for non-existent directory', async () => {
    const nonExistent = path.join(tmpDir, 'does-not-exist');
    await expect(validateOutputDirectory(nonExistent)).rejects.toThrow(PermissionError);
    await expect(validateOutputDirectory(nonExistent)).rejects.toThrow('does not exist');
  });
});
