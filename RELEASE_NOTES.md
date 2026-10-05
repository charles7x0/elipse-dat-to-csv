## v1.1.1 — Merge Fixes

Fixes three issues in merge mode discovered with real-world historian exports.

### 🐛 Fixes

- **Merge files with different columns** — merge mode no longer requires every file to share identical columns. The merged output now uses the union of all columns across the selected files (first-seen order); cells a file doesn't have are left blank. Combining different tags/PLCs (e.g. `tca` and `tvz` files) now works instead of failing with a column-mismatch error.
- **Live progress during merge** — the progress bar now advances throughout a merge: per file as each is read, and periodically as rows are written. Previously it showed a single update and appeared frozen on large merges.
- **Readable Excel timestamps** — DateTime values in `.xlsx` output are written as full `YYYY-MM-DD HH:mm:ss` text, matching CSV/JSON. Previously Excel rendered them with a locale-ambiguous `mm-dd-yy` format that hid the time-of-day entirely.
- Per-file rows in the list now resolve to their final status (success/error) after a merge instead of staying stuck on **PENDING**.

### ⚙️ Notes

- Excel DateTime cells are now text rather than native Excel date values, so the complete timestamp is always visible. This is a deliberate workaround for a limitation in the streaming `.xlsx` writer and keeps Excel output consistent with CSV and JSON.
- Merge still buffers rows in memory to sort by timestamp; per-file conversion remains fully streaming.

### ⬆️ Upgrading from v1.1.0

No action required. Existing workflows are unchanged; the fixes apply automatically.

---

## v1.1.0 — Merge Mode & More Column Types

Adds a merge mode for combining files and expands column type support.

### ✨ Highlights

- **Merge mode** — concatenate many `.dat` files into a single output, sorted chronologically by timestamp, with a configurable file name (defaults to `merged_output`). Merging requires all files to share identical columns; a clear error is reported if they differ.
- **More column types** — added Boolean, DWord (codes 4 and 5), and Double, bringing full parity with the reference parser. Files using these types now convert instead of failing.

### 📊 Supported Column Types

| Type | Code | Size (bytes) | Decoding |
|------|------|--------------|----------|
| Boolean | 2 | 1 | Non-zero byte → `true` |
| Word | 3 | 2 | Int16LE |
| DWord | 4 | 4 | Int32LE |
| DWord | 5 | 4 | Int32LE (alternate code) |
| Float | 6 | 4 | FloatLE |
| Double | 7 | 8 | DoubleLE |
| DateTime | 8 | 10 | DoubleLE epoch seconds × 1000 → Date |
| String | 9 | variable | Latin1, null-terminated |

Booleans are written as `true`/`false` in CSV, and as native booleans in JSON and Excel.

### ⚙️ Notes

- Merge mode buffers rows in memory to sort by timestamp, so it does not use streaming I/O. Per-file conversion remains fully streaming.

### 🛠️ Tech Stack

Electron 33 · React 19 · Mantine 7 · TypeScript 5 · fast-csv · exceljs · vitest

### 🚀 Getting Started

1. Download the installer for your platform from the assets below.
2. Install and launch the app.
3. Select or drag your `.dat` files into the window.
4. Choose your output format. To combine files, tick **Merge into one file** and optionally set a name.
5. Click **Convert**.

### 🏗️ Build from Source

```bash
git clone https://github.com/nicedoc/elipse-dat-to-csv.git
cd elipse-dat-to-csv
npm ci
npm run build:win   # or build:linux / build:all
```

### ⬆️ Upgrading from v1.0.0

No action required — existing workflows are unchanged. Merge mode is opt-in via the new **Merge into one file** setting, and the added column types are handled automatically.

---

## v1.0.0 — Initial Release

Desktop converter for Elipse SCADA `.dat` binary historian files. Converts to CSV, Excel, and JSON with streaming I/O for large file support.

### ✨ Highlights

- **Multiple export formats** — CSV (RFC 4180), Excel (.xlsx), and JSON
- **Batch conversion** — process multiple `.dat` files sequentially with progress tracking
- **Drag and drop** — drop files or folders directly into the app
- **Folder discovery** — recursively finds all `.dat` files in a selected folder
- **File validation** — verifies the magic header (`0xa7eda5db`) before conversion
- **Streaming I/O** — handles files >1 GB without loading them into memory
- **Pluggable architecture** — extensible parser and exporter registries
- **Cross-platform** — Windows (NSIS installer) and Linux (AppImage/deb)

### 📊 Supported Column Types

| Type | Code | Decoding |
|------|------|----------|
| DateTime | 8 | DoubleLE × 1000 → Date |
| String | 9 | Latin1, null-terminated |
| Word | 3 | Int16LE |
| Float | 6 | FloatLE |

### 🛠️ Tech Stack

Electron 33 · React 19 · Mantine 7 · TypeScript 5 · fast-csv · exceljs · vitest

### 🚀 Getting Started

1. Download the installer for your platform from the assets below.
2. Install and launch the app.
3. Select or drag your `.dat` files into the window.
4. Choose your output format and click **Convert**.

### 🏗️ Build from Source

```bash
git clone https://github.com/nicedoc/elipse-dat-to-csv.git
cd elipse-dat-to-csv
npm ci
npm run build:win   # or build:linux / build:all
```

### 📝 License

MIT
