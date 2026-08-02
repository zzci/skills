---
name: "read-pdf"
description: "Read PDF\nExtract text and figures from PDF files"
---
Use your harness's native PDF reading — no in-page parser library is needed.

- **Claude Code**: the `Read` tool reads PDFs directly (pass `pages` for large files, max 20 pages per call); it returns text and renders page images.
- **Codex Agent**: use the file/attachment viewing tools if they accept PDFs; otherwise extract text via shell, e.g. `pdftotext file.pdf -` (poppler-utils), and view specific pages as images with `pdftoppm` if visual layout matters.

Only reach for a JS PDF library when a **prototype page itself** must parse a user-provided PDF in the browser at runtime — that is application behavior, not something you need for reading source material.
