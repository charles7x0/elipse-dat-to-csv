import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import type { ConversionConfig } from '../../core'
import {
  ConversionManager,
  ExporterRegistryImpl,
  createParserRegistry,
  CsvExporter,
  JsonExporter,
  ExcelExporter,
  PermissionError,
  DiskSpaceError,
} from '../../core'

/** Active conversion manager instance (so cancel can reference it) */
let activeManager: ConversionManager | null = null

/**
 * Creates an ExporterRegistry with CSV, JSON, and Excel exporters pre-registered.
 */
function createExporterRegistry(): ExporterRegistryImpl {
  const registry = new ExporterRegistryImpl()
  registry.register(new CsvExporter())
  registry.register(new JsonExporter())
  registry.register(new ExcelExporter())
  return registry
}

/**
 * Registers conversion-related IPC handlers: start, cancel, and event relay.
 */
export function registerConversionHandlers(mainWindow: BrowserWindow): void {
  // ── conversion:start ────────────────────────────────────────────────
  // Instantiates a ConversionManager, starts the batch, and relays
  // progress events to the renderer via webContents.send.
  ipcMain.handle(IPC.CONVERSION_START, async (_event, config: ConversionConfig) => {
    const parserRegistry = createParserRegistry()
    const exporterRegistry = createExporterRegistry()

    const manager = new ConversionManager(parserRegistry, exporterRegistry)
    activeManager = manager

    // Relay progress events to the renderer
    manager.on('progress', (update) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.CONVERSION_PROGRESS, update)
      }
    })

    manager.on('fileComplete', (result) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.CONVERSION_FILE_COMPLETE, result)
      }
    })

    manager.on('error', (error) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.CONVERSION_ERROR, error)
      }
    })

    try {
      const batchResult = await manager.startBatch(config.inputFiles, config)

      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.CONVERSION_COMPLETE, batchResult)
      }

      return batchResult
    } catch (err) {
      // Surface PermissionError / DiskSpaceError to the renderer as error events
      if (!mainWindow.isDestroyed()) {
        const message =
          err instanceof PermissionError || err instanceof DiskSpaceError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err)
        mainWindow.webContents.send(IPC.CONVERSION_ERROR, {
          filePath: '',
          error: message,
        })
      }
      throw err
    } finally {
      activeManager = null
    }
  })

  // ── conversion:cancel ───────────────────────────────────────────────
  // Fire-and-forget: calls cancelBatch() on the active manager.
  ipcMain.on(IPC.CONVERSION_CANCEL, () => {
    if (activeManager) {
      activeManager.cancelBatch()
    }
  })
}
