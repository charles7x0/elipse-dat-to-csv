import { useCallback } from 'react'
import { Button, Group, Text, Select, Checkbox, TextInput } from '@mantine/core'
import type { ExportFormat, NamingPattern } from '../../../core/types'

interface SettingsPanelProps {
  outputFormat: ExportFormat
  onOutputFormatChange: (format: ExportFormat) => void
  outputDirectory: string
  onOutputDirectoryChange: (directory: string) => void
  namingPattern: NamingPattern
  onNamingPatternChange: (pattern: NamingPattern) => void
  mergeOutput: boolean
  onMergeOutputChange: (merge: boolean) => void
  mergeFileName: string
  onMergeFileNameChange: (name: string) => void
}

const FORMAT_OPTIONS = [
  { value: 'csv', label: 'CSV' },
  { value: 'Excel', label: 'Excel' },
  { value: 'json', label: 'JSON' }
]

const NAMING_OPTIONS = [
  { value: 'same-name', label: 'Same name' },
  { value: 'tag-separated', label: 'Tag separated' }
]

export function SettingsPanel({
  outputFormat,
  onOutputFormatChange,
  outputDirectory,
  onOutputDirectoryChange,
  namingPattern,
  onNamingPatternChange,
  mergeOutput,
  onMergeOutputChange,
  mergeFileName,
  onMergeFileNameChange
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
        disabled={mergeOutput}
        style={{ width: 140 }}
      />
      <Checkbox
        size="xs"
        label="Merge into one file"
        checked={mergeOutput}
        onChange={(e) => onMergeOutputChange(e.currentTarget.checked)}
        style={{ alignSelf: 'center' }}
      />
      {mergeOutput && (
        <TextInput
          size="xs"
          label="Merged file name"
          placeholder="merged_output"
          value={mergeFileName}
          onChange={(e) => onMergeFileNameChange(e.currentTarget.value)}
          style={{ width: 160 }}
        />
      )}
    </Group>
  )
}
