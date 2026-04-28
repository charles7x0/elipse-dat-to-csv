import { useCallback, useState } from 'react'
import {
  Button,
  Group,
  Table,
  ActionIcon,
  Text,
  Paper,
  Badge,
  Stack,
  ScrollArea,
  Tooltip,
  rem
} from '@mantine/core'
import type { FileEntry, FileConversionStatus } from '../types'

interface FileSelectionProps {
  files: FileEntry[]
  onFilesChange: (files: FileEntry[]) => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function mergeFiles(existing: FileEntry[], incoming: FileEntry[]): FileEntry[] {
  const paths = new Set(existing.map((f) => f.path))
  return [...existing, ...incoming.filter((f) => !paths.has(f.path))]
}

function conversionBadge(status?: FileConversionStatus, error?: string): React.JSX.Element {
  switch (status) {
    case 'pending':
      return <Badge color="gray" variant="light" size="xs">Pending</Badge>
    case 'converting':
      return <Badge color="blue" variant="light" size="xs">Converting…</Badge>
    case 'success':
      return <Badge color="teal" variant="light" size="xs">Done</Badge>
    case 'error':
      return (
        <Tooltip label={error || 'Unknown error'} multiline maw={300}>
          <Badge color="red" variant="light" size="xs" style={{ cursor: 'help' }}>Failed</Badge>
        </Tooltip>
      )
    default:
      return <Text size="xs" c="dimmed">—</Text>
  }
}

export function FileSelection({ files, onFilesChange }: FileSelectionProps): React.JSX.Element {
  const [dragOver, setDragOver] = useState(false)

  const buildFileEntry = useCallback(async (filePath: string): Promise<FileEntry> => {
    const name = filePath.split(/[\\/]/).pop() ?? filePath
    try {
      const info = await window.electronAPI.getFileInfo(filePath)
      return { path: filePath, name, size: info.size, valid: info.valid, lineCount: info.lineCount }
    } catch {
      return { path: filePath, name, size: 0, valid: false }
    }
  }, [])

  const addFilePaths = useCallback(
    async (paths: string[]) => {
      const entries = await Promise.all(paths.map(buildFileEntry))
      onFilesChange(mergeFiles(files, entries))
    },
    [files, onFilesChange, buildFileEntry]
  )

  const handleSelectFiles = useCallback(async () => {
    const paths = await window.electronAPI.selectFiles()
    if (paths.length > 0) await addFilePaths(paths)
  }, [addFilePaths])

  const handleSelectFolder = useCallback(async () => {
    const folder = await window.electronAPI.selectOutputFolder()
    if (folder) {
      const datPaths = await window.electronAPI.discoverDatFiles(folder)
      if (datPaths.length > 0) await addFilePaths(datPaths)
    }
  }, [addFilePaths])

  const handleRemove = useCallback(
    (filePath: string) => onFilesChange(files.filter((f) => f.path !== filePath)),
    [files, onFilesChange]
  )

  const handleClearAll = useCallback(() => onFilesChange([]), [onFilesChange])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false) }, [])
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation(); setDragOver(false)
      const items = e.dataTransfer.files
      if (!items || items.length === 0) return
      const filePaths: string[] = []
      const folderPaths: string[] = []
      for (let i = 0; i < items.length; i++) {
        const file = items[i]
        const fullPath = (file as File & { path: string }).path
        if (!fullPath) continue
        if (file.type === '' && file.size === 0) folderPaths.push(fullPath)
        else if (fullPath.toLowerCase().endsWith('.dat')) filePaths.push(fullPath)
      }
      for (const folder of folderPaths) {
        const discovered = await window.electronAPI.discoverDatFiles(folder)
        filePaths.push(...discovered)
      }
      if (filePaths.length > 0) await addFilePaths(filePaths)
    },
    [addFilePaths]
  )

  return (
    <Stack gap={4} h="100%">
      <Group gap="xs">
        <Button variant="default" size="xs" onClick={handleSelectFiles}>Select Files</Button>
        <Button variant="default" size="xs" onClick={handleSelectFolder}>Select Folder</Button>
        {files.length > 0 && (
          <Button variant="subtle" size="xs" color="red" onClick={handleClearAll}>Clear All</Button>
        )}
        {files.length > 0 && (
          <Text size="xs" c="dimmed">{files.length} file(s)</Text>
        )}
      </Group>

      <Paper
        withBorder
        p={4}
        style={{
          flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
          borderStyle: dragOver ? 'dashed' : 'solid',
          borderColor: dragOver ? 'var(--mantine-color-blue-5)' : undefined,
          backgroundColor: dragOver ? 'var(--mantine-color-blue-0)' : undefined,
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {files.length === 0 ? (
          <Text c="dimmed" ta="center" py="lg" size="sm">
            Drag and drop .dat files or folders here
          </Text>
        ) : (
          <ScrollArea style={{ flex: 1 }} type="auto">
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>File path</Table.Th>
                  <Table.Th style={{ width: rem(70) }}>Size</Table.Th>
                  <Table.Th style={{ width: rem(60) }}>Lines</Table.Th>
                  <Table.Th style={{ width: rem(55) }}>Valid</Table.Th>
                  <Table.Th style={{ width: rem(80) }}>Conversion</Table.Th>
                  <Table.Th style={{ width: rem(30) }} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {files.map((file) => (
                  <Table.Tr key={file.path}>
                    <Table.Td>
                      <Text size="xs" style={{ wordBreak: 'break-all' }}>{file.path}</Text>
                    </Table.Td>
                    <Table.Td><Text size="xs" style={{ whiteSpace: 'nowrap' }}>{formatFileSize(file.size)}</Text></Table.Td>
                    <Table.Td><Text size="xs" style={{ whiteSpace: 'nowrap' }}>{file.lineCount != null ? file.lineCount.toLocaleString() : '—'}</Text></Table.Td>
                    <Table.Td>
                      <Badge color={file.valid ? 'green' : 'red'} variant="light" size="xs">
                        {file.valid ? 'Yes' : 'No'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{conversionBadge(file.conversionStatus, file.conversionError)}</Table.Td>
                    <Table.Td>
                      <ActionIcon variant="subtle" color="red" size="xs" onClick={() => handleRemove(file.path)} aria-label={`Remove ${file.name}`}>
                        ✕
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Paper>
    </Stack>
  )
}
