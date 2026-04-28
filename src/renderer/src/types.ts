import type { ExportFormat } from '../../core/types'

export type FileConversionStatus = 'pending' | 'converting' | 'success' | 'error'

export interface FileEntry {
  path: string
  name: string
  size: number
  valid: boolean
  lineCount?: number
  conversionStatus?: FileConversionStatus
  conversionError?: string
}

export interface LogEntry {
  timestamp: Date
  level: 'info' | 'warn' | 'error'
  message: string
  fileName?: string
}

export type ConversionStatus = 'idle' | 'converting' | 'complete' | 'cancelled' | 'error'
