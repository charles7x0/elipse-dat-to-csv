import type { ConversionConfig, ProgressUpdate, BatchResult, FileResult, FileError } from '../core/types'

export interface ElectronAPI {
  selectFiles(): Promise<string[]>
  selectOutputFolder(): Promise<string | null>
  discoverDatFiles(folderPath: string): Promise<string[]>
  validateFile(filePath: string): Promise<boolean>
  getFileInfo(filePath: string): Promise<{ size: number; valid: boolean; lineCount: number }>
  startConversion(config: ConversionConfig): Promise<void>
  cancelConversion(): void
  onProgress(callback: (update: ProgressUpdate) => void): () => void
  onFileComplete(callback: (result: FileResult) => void): () => void
  onFileError(callback: (err: FileError) => void): () => void
  onConversionComplete(callback: (result: BatchResult) => void): () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
