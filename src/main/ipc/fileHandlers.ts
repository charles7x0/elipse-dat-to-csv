import { ipcMain } from 'electron'
import { open } from 'fs/promises'
import path from 'path'
import fse from 'fs-extra'
import { IPC } from '../../shared/ipcChannels'
import { validateMagicHeader } from '../../core'

/**
 * Recursively discovers all .dat files within a directory.
 */
async function discoverDatFiles(dirPath: string): Promise<string[]> {
  const results: string[] = []

  async function walk(dir: string): Promise<void> {
    const entries = await fse.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.dat') {
        results.push(fullPath)
      }
    }
  }

  await walk(dirPath)
  return results
}

/**
 * Registers file-related IPC handlers: validate, getInfo, discoverDatFiles.
 */
export function registerFileHandlers(): void {
  // ── dialog:discoverDatFiles ─────────────────────────────────────────
  // Recursively discovers .dat files in a folder using fs-extra.
  ipcMain.handle(IPC.DISCOVER_DAT_FILES, async (_event, folderPath: string) => {
    return discoverDatFiles(folderPath)
  })

  // ── file:validate ───────────────────────────────────────────────────
  // Validates a file's magic header (first 4 bytes).
  ipcMain.handle(IPC.VALIDATE_FILE, async (_event, filePath: string) => {
    try {
      const fh = await open(filePath, 'r')
      try {
        const buf = Buffer.alloc(4)
        const { bytesRead } = await fh.read(buf, 0, 4, 0)
        if (bytesRead < 4) return false
        return validateMagicHeader(buf)
      } finally {
        await fh.close()
      }
    } catch {
      return false
    }
  })

  // ── file:getInfo ────────────────────────────────────────────────────
  // Returns file size, magic header validity, and line count in a single IPC call.
  ipcMain.handle(IPC.GET_FILE_INFO, async (_event, filePath: string) => {
    try {
      const fh = await open(filePath, 'r')
      try {
        const fileStat = await fh.stat()
        const buf = Buffer.alloc(24)
        const { bytesRead } = await fh.read(buf, 0, 24, 0)
        const valid = bytesRead >= 4 && validateMagicHeader(buf)
        const lineCount = bytesRead >= 6 ? buf.readInt16LE(4) : 0
        return { size: fileStat.size, valid, lineCount: valid ? lineCount : 0 }
      } finally {
        await fh.close()
      }
    } catch {
      return { size: 0, valid: false, lineCount: 0 }
    }
  })
}
