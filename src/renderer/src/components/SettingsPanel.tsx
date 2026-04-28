import { useCallback } from 'react'
import { Button, Group, Text, Select } from '@mantine/core'
import type { ExportFormat, NamingPattern } from '../../../core/types'

interface SettingsPanelProps {
  outputFormat: ExportFormat
  onOutputFormatChange: (format: ExportFormat) => void
  outputDirectory: string
  onOutputDirectoryChange: (directory: string) => void
  namingPattern: NamingPattern
  onNamingPatternChange: (pattern: NamingPattern) => void
}

const FORMAT_OPTIONS = [
  { value: 'csv', label: 'CSV' },
  { value: 'Excel', label: 'Excel' },
  { value: 'json', label: 'JSON' }
]

const NAMING_OPTIONS = [
  { value: 'same-name', label: 'Same name' },
  { value: 'tag-separated', label: 'Tag separated' },
  { value: 'merged-output', label: 'Merged' }
]

export function SettingsPanel({
  outputFormat,
  onOutputFormatChange,
  outputDirectory,
  onOutputDirectoryChange,
  namingPattern,
  onNamingPatternChange
}: SettingsPanelProps): React.JSX.Element {
  const handleSelectOutputFolder = useCallback(async () => {
    const folder = await window.electronAPI.selectOutputFolder()
    if (folder) onOutputDirectoryChange(folder)
  }, [onOutputDirectoryChange])

  return (
    <Group gap="sm" align="flex-end" wrap="wrap">
      <Button variant="default" size="xs" onClick={handleSelectOutputFolder}>
        Output Folder
      </Button>
      <Text size="xs" c={outputDirectory ? undefined : 'dimmed'} lineClamp={1} style={{ flex: 1, minWidth: 100 }}>
        {outputDirectory || 'No folder selected'}
      </Text>
      <Select
        size="xs"
        label="Format"
        data={FORMAT_OPTIONS}
        value={outputFormat}
        onChange={(v) => { if (v) onOutputFormatChange(v as ExportFormat) }}
        allowDeselect={false}
        style={{ width: 100 }}
      />
      <Select
        size="xs"
        label="Naming"
        data={NAMING_OPTIONS}
        value={namingPattern}
        onChange={(v) => { if (v) onNamingPatternChange(v as NamingPattern) }}
        allowDeselect={false}
        style={{ width: 140 }}
      />
    </Group>
  )
}
