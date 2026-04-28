import { useCallback } from 'react'
import { AppShell, Stack, Title, Group } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import type { BatchResult } from '../../core/types'
import { useConversion } from './hooks/useConversion'
import { FileSelection } from './components/FileSelection'
import { SettingsPanel } from './components/SettingsPanel'
import { ConversionControls } from './components/ConversionControls'
import { LogPanel } from './components/LogPanel'

function fmtMs(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`
}

function App(): React.JSX.Element {
  const {
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
    addLog,
    clearLogs,
  } = useConversion()

  const handleConversionComplete = useCallback((result: BatchResult) => {
    if (result.failureCount === 0) {
      notifications.show({ title: 'Done', message: `${result.totalRows} rows in ${fmtMs(result.totalDurationMs)}`, color: 'green', autoClose: 5000 })
    } else if (result.successCount > 0) {
      notifications.show({ title: 'Partial', message: `${result.successCount} ok, ${result.failureCount} failed`, color: 'yellow', autoClose: 7000 })
    } else {
      notifications.show({ title: 'Failed', message: `All ${result.failureCount} file(s) failed`, color: 'red', autoClose: 7000 })
    }
  }, [])

  return (
    <AppShell padding={0}>
      <AppShell.Main>
        <Stack gap={6} p="sm" style={{ height: '100vh', overflow: 'hidden' }}>
          <Title order={4}>Elipse DAT Converter</Title>

          {/* File list — flex grows to fill */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <FileSelection files={selectedFiles} onFilesChange={setSelectedFiles} />
          </div>

          {/* Settings row */}
          <SettingsPanel
            outputFormat={outputFormat}
            onOutputFormatChange={setOutputFormat}
            outputDirectory={outputDirectory}
            onOutputDirectoryChange={setOutputDirectory}
            namingPattern={namingPattern}
            onNamingPatternChange={setNamingPattern}
          />

          {/* Convert button + progress */}
          <ConversionControls
            files={selectedFiles}
            onFilesChange={setSelectedFiles}
            outputFormat={outputFormat}
            outputDirectory={outputDirectory}
            namingPattern={namingPattern}
            conversionStatus={conversionStatus}
            onConversionStatusChange={setConversionStatus}
            progress={progress}
            onProgressChange={setProgress}
            onConversionComplete={handleConversionComplete}
            onLog={addLog}
          />

          {/* Logs */}
          <LogPanel logs={logs} onClearLogs={clearLogs} />
        </Stack>
      </AppShell.Main>
    </AppShell>
  )
}

export default App
