import { BrowserWindow } from 'electron'
import { registerDialogHandlers } from './dialogHandlers'
import { registerFileHandlers } from './fileHandlers'
import { registerConversionHandlers } from './conversionHandlers'

/**
 * Registers all IPC handlers for the main process.
 * Call this once after creating the main BrowserWindow.
 */
export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  registerDialogHandlers(mainWindow)
  registerFileHandlers()
  registerConversionHandlers(mainWindow)
}
