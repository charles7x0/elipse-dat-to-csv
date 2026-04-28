import { describe, it, expect, vi } from 'vitest';
import type { InputParser } from '../types';
import type { DataRecord } from '../types';
import { DatParserImpl, ParserRegistryImpl, createParserRegistry } from '../parsers/parserRegistry';

// Minimal fake parser for testing registry behavior
function makeFakeParser(extensions: string[]): InputParser {
  return {
    supportedExtensions: extensions,
    canParse: vi.fn(async () => true),
    async *parseFile(): AsyncGenerator<DataRecord> {
      yield { col: 'value' };
    },
  };
}

describe('ParserRegistryImpl', () => {
  it('returns null for unregistered extension', () => {
    const registry = new ParserRegistryImpl();
    expect(registry.getParser('/some/file.xyz')).toBeNull();
  });

  it('registers a parser and retrieves it by extension', () => {
    const registry = new ParserRegistryImpl();
    const parser = makeFakeParser(['.foo']);
    registry.register(parser);

    expect(registry.getParser('/path/to/file.foo')).toBe(parser);
  });

  it('handles case-insensitive extension matching', () => {
    const registry = new ParserRegistryImpl();
    const parser = makeFakeParser(['.DAT']);
    registry.register(parser);

    expect(registry.getParser('/path/to/FILE.dat')).toBe(parser);
    expect(registry.getParser('/path/to/FILE.DAT')).toBe(parser);
  });

  it('registers parser for multiple extensions', () => {
    const registry = new ParserRegistryImpl();
    const parser = makeFakeParser(['.a', '.b']);
    registry.register(parser);

    expect(registry.getParser('file.a')).toBe(parser);
    expect(registry.getParser('file.b')).toBe(parser);
  });

  it('returns all supported extensions', () => {
    const registry = new ParserRegistryImpl();
    registry.register(makeFakeParser(['.dat']));
    registry.register(makeFakeParser(['.csv', '.tsv']));

    const exts = registry.supportedExtensions();
    expect(exts).toContain('.dat');
    expect(exts).toContain('.csv');
    expect(exts).toContain('.tsv');
    expect(exts).toHaveLength(3);
  });

  it('later registration overwrites earlier for same extension', () => {
    const registry = new ParserRegistryImpl();
    const first = makeFakeParser(['.dat']);
    const second = makeFakeParser(['.dat']);
    registry.register(first);
    registry.register(second);

    expect(registry.getParser('file.dat')).toBe(second);
  });

  it('returns empty array when no parsers registered', () => {
    const registry = new ParserRegistryImpl();
    expect(registry.supportedExtensions()).toEqual([]);
  });
});

describe('DatParserImpl', () => {
  it('has .dat as supported extension', () => {
    const parser = new DatParserImpl();
    expect(parser.supportedExtensions).toEqual(['.dat']);
  });

  it('canParse returns false for non-existent file', async () => {
    const parser = new DatParserImpl();
    const result = await parser.canParse('/nonexistent/file.dat');
    expect(result).toBe(false);
  });
});

describe('createParserRegistry', () => {
  it('returns a registry with .dat pre-registered', () => {
    const registry = createParserRegistry();
    expect(registry.supportedExtensions()).toContain('.dat');
    expect(registry.getParser('test.dat')).not.toBeNull();
  });

  it('returns null for unsupported extensions', () => {
    const registry = createParserRegistry();
    expect(registry.getParser('test.csv')).toBeNull();
    expect(registry.getParser('test.json')).toBeNull();
  });
});
