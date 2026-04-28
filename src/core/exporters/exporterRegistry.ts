import type { Exporter, ExporterRegistry } from '../types';
import type { ExportFormat } from '../types';

/**
 * Registry that manages pluggable export format writers.
 * Uses an internal Map keyed by ExportFormat.
 */
export class ExporterRegistryImpl implements ExporterRegistry {
  private exporters = new Map<ExportFormat, Exporter>();

  register(exporter: Exporter): void {
    this.exporters.set(exporter.format, exporter);
  }

  get(format: ExportFormat): Exporter {
    const exporter = this.exporters.get(format);
    if (!exporter) {
      throw new Error(`No exporter registered for format: ${format}`);
    }
    return exporter;
  }

  supportedFormats(): ExportFormat[] {
    return Array.from(this.exporters.keys());
  }
}
