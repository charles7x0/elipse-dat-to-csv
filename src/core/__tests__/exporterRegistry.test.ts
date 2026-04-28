import { describe, it, expect, vi } from 'vitest';
import { ExporterRegistryImpl } from '../exporters/exporterRegistry';
import type { Exporter } from '../types';
import type { ExportFormat, ColumnHeader, DataRecord } from '../types';

function createMockExporter(format: ExportFormat): Exporter {
  return {
    format,
    initialize: vi.fn(),
    writeRecord: vi.fn(),
    finalize: vi.fn(),
  };
}

describe('ExporterRegistryImpl', () => {
  it('registers and retrieves an exporter by format', () => {
    const registry = new ExporterRegistryImpl();
    const csvExporter = createMockExporter('csv');

    registry.register(csvExporter);

    expect(registry.get('csv')).toBe(csvExporter);
  });

  it('throws when getting an unregistered format', () => {
    const registry = new ExporterRegistryImpl();

    expect(() => registry.get('json')).toThrow('No exporter registered for format: json');
  });

  it('returns all registered format names', () => {
    const registry = new ExporterRegistryImpl();
    registry.register(createMockExporter('csv'));
    registry.register(createMockExporter('json'));

    const formats = registry.supportedFormats();

    expect(formats).toEqual(['csv', 'json']);
  });

  it('returns empty array when no exporters registered', () => {
    const registry = new ExporterRegistryImpl();

    expect(registry.supportedFormats()).toEqual([]);
  });

  it('overwrites exporter when registering same format twice', () => {
    const registry = new ExporterRegistryImpl();
    const first = createMockExporter('csv');
    const second = createMockExporter('csv');

    registry.register(first);
    registry.register(second);

    expect(registry.get('csv')).toBe(second);
    expect(registry.supportedFormats()).toEqual(['csv']);
  });
});
