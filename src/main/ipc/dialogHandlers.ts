import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '../../shared/ipcChannels'

/**
 * Registers dialog-related IPC handlers: file selection and output folder selection.
 */
export function registerDialogHandlers(mainWindow: BrowserWindow): void {
  // ── dialog:selectFiles ──────────────────────────────────────────────
  // Opens a native file dialog filtered to .dat files with multi-select.
  ipcMain.handle(IPC.SELECT_FILES, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select .dat files',
      filters: [{ name: 'Elipse DAT Files', extensions: ['dat'] }],
      properties: ['openFile', 'multiSelections'],
    })

    if (result.canceled) {
      return []
    }
    return result.filePaths
  })

  // ── dialog:selectOutputFolder ───────────────────────────────────────
  // Opens a native folder dialog for choosing the output directory.
  ipcMain.handle(IPC.SELECT_OUTPUT_FOLDER, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select output folder',
      properties: ['openDirectory', 'createDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })
}
