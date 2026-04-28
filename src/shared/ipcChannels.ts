export const IPC = {
  SELECT_FILES: 'dialog:selectFiles',
  SELECT_OUTPUT_FOLDER: 'dialog:selectOutputFolder',
  DISCOVER_DAT_FILES: 'dialog:discoverDatFiles',
  VALIDATE_FILE: 'file:validate',
  GET_FILE_INFO: 'file:getInfo',
  CONVERSION_START: 'conversion:start',
  CONVERSION_CANCEL: 'conversion:cancel',
  CONVERSION_PROGRESS: 'conversion:progress',
  CONVERSION_FILE_COMPLETE: 'conversion:fileComplete',
  CONVERSION_ERROR: 'conversion:error',
  CONVERSION_COMPLETE: 'conversion:complete',
} as const
