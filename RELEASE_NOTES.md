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
