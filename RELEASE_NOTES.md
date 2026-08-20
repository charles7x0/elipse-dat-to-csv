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
