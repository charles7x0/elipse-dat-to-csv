import { useCallback, useEffect } from 'react'
import { Button, Group, Progress, Text } from '@mantine/core'
import type {
  ExportFormat,
  NamingPattern,
  ProgressUpdate,
  ConversionConfig,
  BatchResult,
  FileResult
} from '../../../core/types'
import type {
  FileEntry,
  ConversionStatus,
  LogEntry
} from '../types'

interface ConversionControlsProps {
  files: FileEntry[]
  onFilesChange: React.Dispatch<React.SetStateAction<FileEntry[]>>
  outputFormat: ExportFormat
  outputDirectory: string
  namingPattern: NamingPattern
  mergeOutput: boolean
  mergeFileName: string
  conversionStatus: ConversionStatus
  onConversionStatusChange: (status: ConversionStatus) => void
  progress: ProgressUpdate | null
  onProgressChange: (progress: ProgressUpdate | null) => void
  onConversionComplete: (result: BatchResult) => void
  onLog: (entry: LogEntry) => void
}

export function ConversionControls({
  files,
  onFilesChange,
  outputFormat,
  outputDirectory,
  namingPattern,
  mergeOutput,
  mergeFileName,
  conversionStatus,
  onConversionStatusChange,
  progress,
  onProgressChange,
  onConversionComplete,
  onLog
}: ConversionControlsProps): React.JSX.Element {
  const isConverting = conversionStatus === 'converting'
  const hasFiles = files.length > 0
  const hasOutputDir = outputDirectory.length > 0
  const canConvert = hasFiles && hasOutputDir && !isConverting

  // We keep a map of inputPath → index so IPC events can match by full path
  const handleConvert = useCallback(async () => {
    if (!outputDirectory) {
      onLog({ timestamp: new Date(), level: 'error', message: 'Please select an output folder first.' })
      return
    }
    const validFiles = files.filter((f) => f.valid)
    if (validFiles.length === 0) {
      onLog({ timestamp: new Date(), level: 'error', message: 'No valid .dat files to convert.' })
      return
    }

    // Reset all valid files to 'pending'
    onFilesChange(prev =>
      prev.map(f => f.valid ? { ...f, conversionStatus: 'pending' as const, conversionError: undefined } : f)
    )

    const config: ConversionConfig = {
      inputFiles: validFiles.map(f => f.path),
      outputDirectory,
      format: outputFormat,
      namingPattern,
      mergeOutput,
      mergeFileName
    }

    onConversionStatusChange('converting')
    onProgressChange(null)
    onLog({ timestamp: new Date(), level: 'info', message: 'Starting conversion...' })

    try {
      await window.electronAPI.startConversion(config)
    } catch (err) {
      onConversionStatusChange('error')
      onLog({
        timestamp: new Date(),
        level: 'error',
        message: `Conversion failed: ${err instanceof Error ? err.message : String(err)}`
      })
    }
  }, [files, outputDirectory, outputFormat, namingPattern, mergeOutput, mergeFileName, onFilesChange, onConversionStatusChange, onProgressChange, onLog])

  const handleCancel = useCallback(() => {
    window.electronAPI.cancelConversion()
    onConversionStatusChange('cancelled')
    onLog({ timestamp: new Date(), level: 'warn', message: 'Conversion cancelled.' })
  }, [onConversionStatusChange, onLog])

  useEffect(() => {
    // Mark file as 'converting' when progress starts for it
    const unsubProgress = window.electronAPI.onProgress((update: ProgressUpdate) => {
      onProgressChange(update)
      // Match by full path: the config.inputFiles[currentFileIndex]
      // We use currentFileName (basename) to find the file being processed
      // But we need full path — so we match by basename + pending/converting status
      onFilesChange(prev => {
        let matched = false
        return prev.map(f => {
          if (!matched && f.name === update.currentFileName && (f.conversionStatus === 'pending' || f.conversionStatus === 'converting')) {
            matched = true
            return { ...f, conversionStatus: 'converting' as const }
          }
          return f
        })
      })
    })

    // Mark individual file as success when it completes
    const unsubFileComplete = window.electronAPI.onFileComplete((result: FileResult) => {
      onFilesChange(prev =>
        prev.map(f => f.path === result.filePath ? { ...f, conversionStatus: 'success' as const } : f)
      )
      onLog({
        timestamp: new Date(),
        level: 'info',
        message: `✓ ${result.filePath} — ${result.rowCount} rows in ${(result.durationMs / 1000).toFixed(2)}s`,
        fileName: result.filePath
      })
    })

    // Mark individual file as error
    const unsubFileError = window.electronAPI.onFileError((err) => {
      if (err.filePath) {
        onFilesChange(prev =>
          prev.map(f => f.path === err.filePath ? { ...f, conversionStatus: 'error' as const, conversionError: err.error } : f)
        )
      }
      onLog({
        timestamp: new Date(),
        level: 'error',
        message: `✗ ${err.filePath || 'Unknown'} — ${err.error}`,
        fileName: err.filePath
      })
    })

    // Batch complete
    const unsubComplete = window.electronAPI.onConversionComplete((result: BatchResult) => {
      const status: ConversionStatus = result.failureCount === result.totalFiles ? 'error' : 'complete'
      onConversionStatusChange(status)

      // Reconcile any file rows still left unresolved. In merge mode the manager
      // emits a single fileComplete/error whose filePath is the joined list of
      // every input, so per-row path matching never fires and all rows stay
      // 'pending'. Resolve them here from the overall batch outcome: a merge is
      // all-or-nothing, so every participating file shares the same result.
      const mergeSucceeded = result.failureCount === 0
      const mergeError = result.results.find(r => !r.success)?.error
      onFilesChange(prev =>
        prev.map(f => {
          if (!f.valid) return f
          if (f.conversionStatus === 'pending' || f.conversionStatus === 'converting') {
            return mergeSucceeded
              ? { ...f, conversionStatus: 'success' as const }
              : { ...f, conversionStatus: 'error' as const, conversionError: mergeError }
          }
          return f
        })
      )

      onConversionComplete(result)
      onLog({
        timestamp: new Date(),
        level: result.failureCount > 0 ? 'warn' : 'info',
        message: `Batch done: ${result.successCount} ok, ${result.failureCount} failed (${result.totalRows} rows, ${(result.totalDurationMs / 1000).toFixed(2)}s)`
      })
    })

    return () => {
      unsubProgress()
      unsubFileComplete()
      unsubFileError()
      unsubComplete()
    }
  }, [onProgressChange, onConversionStatusChange, onConversionComplete, onFilesChange, onLog])

  const progressPercent =
    progress && progress.totalFiles > 0
      ? Math.round(((progress.currentFileIndex + (progress.status === 'complete' ? 1 : 0)) / progress.totalFiles) * 100)
      : 0

  return (
    <Group gap="xs">
      <Button size="xs" onClick={handleConvert} disabled={!canConvert} loading={isConverting}>
        Convert
      </Button>
      {isConverting && (
        <Button size="xs" variant="outline" color="red" onClick={handleCancel}>
          Cancel
        </Button>
      )}
      {isConverting && progress && (
        <Progress value={progressPercent} size="sm" animated style={{ flex: 1 }} />
      )}
      {isConverting && progress && (
        <Text size="xs" c="dimmed">
          {progress.currentFileIndex + 1}/{progress.totalFiles}
        </Text>
      )}
    </Group>
  )
}
