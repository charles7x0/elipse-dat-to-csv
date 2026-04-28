import { useEffect, useRef, useCallback } from 'react'
import { Paper, ScrollArea, Text, Stack, Group, Badge, Button } from '@mantine/core'
import type { LogEntry } from '../types'

interface LogPanelProps {
  logs: LogEntry[]
  onClearLogs: () => void
}

const levelColor: Record<LogEntry['level'], string> = {
  info: 'blue',
  warn: 'yellow',
  error: 'red'
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function LogPanel({ logs, onClearLogs }: LogPanelProps): React.JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight
    }
  }, [logs])

  const handleExport = useCallback(() => {
    const lines = logs.map(
      (e) => `[${formatTimestamp(e.timestamp)}] [${e.level.toUpperCase()}] ${e.message}${e.fileName ? ` (${e.fileName})` : ''}`
    )
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `conversion-log-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [logs])

  return (
    <Paper withBorder p={4}>
      <Group gap={4} mb={2} justify="space-between">
        <Text size="xs" fw={600}>Logs</Text>
        <Group gap={4}>
          {logs.length > 0 && (
            <>
              <Button size="compact-xs" variant="subtle" onClick={handleExport}>Export</Button>
              <Button size="compact-xs" variant="subtle" color="red" onClick={onClearLogs}>Clear</Button>
            </>
          )}
        </Group>
      </Group>
      <ScrollArea h={100} viewportRef={viewportRef}>
        <Stack gap={1}>
          {logs.length === 0 && <Text size="xs" c="dimmed">No log entries yet.</Text>}
          {logs.map((entry, i) => (
            <Group key={i} gap={4} wrap="nowrap" align="flex-start">
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                {formatTimestamp(entry.timestamp)}
              </Text>
              <Badge size="xs" color={levelColor[entry.level]} variant="light" style={{ flexShrink: 0 }}>
                {entry.level}
              </Badge>
              <Text size="xs" style={{ flex: 1 }} lineClamp={2}>
                {entry.message}
              </Text>
            </Group>
          ))}
        </Stack>
      </ScrollArea>
    </Paper>
  )
}
