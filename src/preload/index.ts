import { contextBridge, ipcRenderer } from 'electron'
import type { ConversionConfig, ProgressUpdate, BatchResult, FileResult, FileError } from '../core/types'
import { IPC } from '../shared/ipcChannels'

const electronAPI = {
  selectFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.SELECT_FILES),
  selectOutputFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.SELECT_OUTPUT_FOLDER),
  discoverDatFiles: (folderPath: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC.DISCOVER_DAT_FILES, folderPath),
  validateFile: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.VALIDATE_FILE, filePath),
  getFileInfo: (filePath: string): Promise<{ size: number; valid: boolean; lineCount: number }> =>
    ipcRenderer.invoke(IPC.GET_FILE_INFO, filePath),
  startConversion: (config: ConversionConfig): Promise<void> =>
    ipcRenderer.invoke(IPC.CONVERSION_START, config),
  cancelConversion: (): void => { ipcRenderer.send(IPC.CONVERSION_CANCEL) },

  onProgress: (callback: (update: ProgressUpdate) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, u: ProgressUpdate): void => callback(u)
    ipcRenderer.on(IPC.CONVERSION_PROGRESS, handler)
    return () => { ipcRenderer.removeListener(IPC.CONVERSION_PROGRESS, handler) }
  },
  onFileComplete: (callback: (result: FileResult) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, r: FileResult): void => callback(r)
    ipcRenderer.on(IPC.CONVERSION_FILE_COMPLETE, handler)
    return () => { ipcRenderer.removeListener(IPC.CONVERSION_FILE_COMPLETE, handler) }
  },
  onFileError: (callback: (err: FileError) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, err: FileError): void => callback(err)
    ipcRenderer.on(IPC.CONVERSION_ERROR, handler)
    return () => { ipcRenderer.removeListener(IPC.CONVERSION_ERROR, handler) }
  },
  onConversionComplete: (callback: (result: BatchResult) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, r: BatchResult): void => callback(r)
    ipcRenderer.on(IPC.CONVERSION_COMPLETE, handler)
    return () => { ipcRenderer.removeListener(IPC.CONVERSION_COMPLETE, handler) }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI)
  } catch (error) {
    console.error('Failed to expose electronAPI via contextBridge:', error)
  }
} else {
  // @ts-ignore
  window.electronAPI = electronAPI
}
