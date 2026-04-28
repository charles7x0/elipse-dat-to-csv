import path from 'path';
import { open } from 'fs/promises';
import type { InputParser, ParserRegistry } from '../types';
import type { DataRecord } from '../types';
import { validateMagicHeader, parseFile } from './datParser';

/**
 * Concrete InputParser for Elipse SCADA .dat binary files.
 * Wraps the standalone functions from datParser.ts.
 */
export class DatParserImpl implements InputParser {
  readonly supportedExtensions: string[] = ['.dat'];

  async canParse(filePath: string): Promise<boolean> {
    try {
      const fh = await open(filePath, 'r');
      try {
        const buf = Buffer.alloc(4);
        const { bytesRead } = await fh.read(buf, 0, 4, 0);
        if (bytesRead < 4) return false;
        return validateMagicHeader(buf);
      } finally {
        await fh.close();
      }
    } catch {
      return false;
    }
  }

  parseFile(filePath: string): AsyncGenerator<DataRecord> {
    return parseFile(filePath);
  }
}

/**
 * Registry that selects the correct InputParser based on file extension.
 * Uses an internal Map keyed by extension (e.g. '.dat').
 */
export class ParserRegistryImpl implements ParserRegistry {
  private parsers = new Map<string, InputParser>();

  register(parser: InputParser): void {
    for (const ext of parser.supportedExtensions) {
      this.parsers.set(ext.toLowerCase(), parser);
    }
  }

  getParser(filePath: string): InputParser | null {
    const ext = path.extname(filePath).toLowerCase();
    return this.parsers.get(ext) ?? null;
  }

  supportedExtensions(): string[] {
    return Array.from(this.parsers.keys());
  }
}

/**
 * Creates a ParserRegistry with the DatParser pre-registered.
 */
export function createParserRegistry(): ParserRegistry {
  const registry = new ParserRegistryImpl();
  registry.register(new DatParserImpl());
  return registry;
}
