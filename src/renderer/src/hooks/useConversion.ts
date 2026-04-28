import { useState, useCallback } from 'react'
import type { ExportFormat, NamingPattern, ProgressUpdate } from '../../../core/types'
import type { FileEntry, ConversionStatus, LogEntry } from '../types'

export interface UseConversionReturn {
  selectedFiles: FileEntry[]
  setSelectedFiles: React.Dispatch<React.SetStateAction<FileEntry[]>>
  outputFormat: ExportFormat
  setOutputFormat: (format: ExportFormat) => void
  outputDirectory: string
  setOutputDirectory: (directory: string) => void
  namingPattern: NamingPattern
  setNamingPattern: (pattern: NamingPattern) => void
  conversionStatus: ConversionStatus
  setConversionStatus: (status: ConversionStatus) => void
  progress: ProgressUpdate | null
  setProgress: (progress: ProgressUpdate | null) => void
  logs: LogEntry[]
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>
  addLog: (entry: LogEntry) => void
  clearLogs: () => void
}

export function useConversion(): UseConversionReturn {
  const [selectedFiles, setSelectedFiles] = useState<FileEntry[]>([])
  const [outputFormat, setOutputFormat] = useState<ExportFormat>('csv')
  const [outputDirectory, setOutputDirectory] = useState<string>('')
  const [namingPattern, setNamingPattern] = useState<NamingPattern>('same-name')
  const [conversionStatus, setConversionStatus] = useState<ConversionStatus>('idle')
  const [progress, setProgress] = useState<ProgressUpdate | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])

  const addLog = useCallback((entry: LogEntry) => setLogs(prev => [...prev, entry]), [])
  const clearLogs = useCallback(() => setLogs([]), [])

  return {
    selectedFiles,
    setSelectedFiles,
    outputFormat,
    setOutputFormat,
    outputDirectory,
    setOutputDirectory,
    namingPattern,
    setNamingPattern,
    conversionStatus,
    setConversionStatus,
    progress,
    setProgress,
    logs,
    setLogs,
    addLog,
    clearLogs,
  }
}
