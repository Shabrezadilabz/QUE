"""Extract PDF design pages to PNG + manifest."""
from pathlib import Path

import pymupdf

PDF = Path(__file__).resolve().parents[1] / "Untitled.pdf"
OUT = Path(__file__).resolve().parents[1] / "docs" / "pdf-screens"
OUT.mkdir(parents=True, exist_ok=True)

doc = pymupdf.open(PDF)
page_count = doc.page_count
lines: list[str] = [f"# PDF screens — {page_count} pages", ""]

for i in range(page_count):
    page = doc[i]
    pix = page.get_pixmap(matrix=pymupdf.Matrix(1.25, 1.25))
    name = f"page-{i + 1:02d}.png"
    pix.save(str(OUT / name))
    text = page.get_text().strip()
    first_lines = " | ".join(text.splitlines()[:8])
    lines.append(f"## Page {i + 1} — {name} ({pix.width}×{pix.height})")
    lines.append(first_lines)
    lines.append("")

doc.close()
(OUT / "manifest.md").write_text("\n".join(lines), encoding="utf-8")
print(f"Extracted {page_count} pages to {OUT}")
