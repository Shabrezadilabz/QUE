# Que design export — PDF source of truth

Extracted from `adc/schemagraph/Untitled.pdf` (12 pages, ~23 MB).

**Assets:** `docs/pdf-screens/page-01.png` … `page-12.png`  
**Re-extract:** `python scripts/extract_pdf_screens.py`

---

## PDF page index → app route

| Page | Screen name (from PDF) | Route(s) | Shell type |
|------|------------------------|----------|------------|
| 01 | **Login** — Sign in to your account | `/login` | Public (no sidebar) |
| 02 | **Managed Data Plane** — dataset table | `/managed` | App: icon sidebar + page header |
| 03 | **Marketplace** — Starter Packs grid | `/marketplace` | App: sidebar + **top nav bar** |
| 04 | **Metrics** — Semantic Layer + lineage | `/metrics` | App: text sidebar + top bar |
| 05 | **Validation & Drift Agent** — gauge + alerts | `/validation`, `/drift-agent` | App: compact sidebar + page header |
| 06 | **Certified BI Dashboard** — KPI cards + chart | `/bi` | App: sidebar + top bar |
| 07 | **Data Catalog & Glossary** — split directory + detail | `/catalog`, `/glossary` | App: sidebar + top bar |
| 08 | **Proposals** — 3-pane inbox + diff + top bar | `/proposals` | App: sidebar + **top bar** + split |
| 09 | **Rules & Org Memory** — rules table + learned | `/rules` | App: sidebar + top bar |
| 10 | **Settings → Members** — org nav + table | `/settings/members` | App: sidebar + settings sub-nav |
| 11 | **Status** — operational bento | `/status` | Public header (no sidebar) |
| 12 | **Verify Attestation** — centered card | `/verify` | Public header (no sidebar) |

Screens **not in PDF** (keep functional UI; skin later): `/workspace`, `/sources`, `/joins`, `/chat`, `/jobs`, `/ship`, `/compliance`, `/lineage`, etc.

---

## Shared design language (from PDF)

### Two layout families

**A — Public pages (01, 11, 12)**  
- Full viewport, no left rail  
- Header: Que logo | section label | optional right link  
- Dark charcoal background, centered or bento content  

**B — App pages (02–10)**  
- **Left sidebar:** icon + label stack (Workspace, Sources, Joins, Chat, Jobs, Lineage, Compliance, Marketplace, Settings)  
- **Top bar (most pages):** Workspace Switcher › breadcrumb · search · Promote · **Sync Schema** (white CTA) · bell · avatar  
- **Page header:** H1 + subtitle + primary actions  
- **Content:** tables, cards, or split panes  

### Color palette (PDF — monochrome + accents)

| Role | Hex (approx) | Where |
|------|----------------|-------|
| Page background | `#0b0e11` – `#111416` | All screens |
| Surface / cards | `#0f1215`, `#15191e`, `#1e2328` | Tables, cards |
| Border | `#424850`, `#2a313c` | Inputs, table rows |
| Primary text | `#d4dbe3`, `#ecf0f4` | Titles |
| Muted text | `#c8cdd3`, `#a3afbe` | Subtitles, labels |
| **Primary CTA** | `#d0d8e0` / **white** bg + dark text | Sign in, Sync Schema, Invite Member |
| CTA text | `#323840` | On light buttons |
| Success / certified | Teal-green checkmarks | Certification, PASSING |
| Warning | `#f0a020`, amber | Drift detected, MED alerts |
| Error / HIGH | Red accent | Drift alerts, diff deletes |
| Diff add | Green tint | SQL diff |
| Diff remove | Red tint | SQL diff |
| Transform tag | Purple | Proposal cards |
| Schema mapping tag | Orange | Proposal cards |
| Join suggestion tag | Green | Proposal cards |
| Learned rules accent | Teal/cyan header | Rules sidebar |

**Note:** PDF is mostly **slate + white CTAs**, not mint-heavy. Mint appears in status/checkmarks, not as the main button color on most screens.

### Typography

- **UI:** Inter-style sans (already in app)  
- **Code / paths:** JetBrains Mono  
- **Labels:** 10px uppercase tracking for table headers  
- **Page titles:** 24px bold, `-0.48px` tracking  

### Recurring components

1. **Icon sidebar** — 40px icons, 9–10px labels, active = white/light border pill  
2. **Top nav bar** — 64px height, breadcrumb underline on current section  
3. **Search input** — dark fill, left icon, rounded 4–12px  
4. **Ghost button** — `Promote` (outline)  
5. **Solid light button** — `Sync Schema`, `Certify Dataset`, `Create New Chart`  
6. **Data tables** — uppercase headers, row dividers, footer pagination  
7. **Status pills** — OPERATIONAL, PASSING, APPROVED, HIGH, MED  
8. **Split pane** — directory left + detail right (Catalog, Proposals, Settings)  

---

## Current app vs PDF (gap summary)

| Page | PDF match today | Main mismatch |
|------|-----------------|---------------|
| 01 Login | ~85% | Extra register/dev UI; otherwise close |
| 02 Managed | ~70% | Missing exact icons, certification graphics, sidebar style |
| 03 Marketplace | ~60% | Top bar close; pack icons/avatars simplified |
| 04 Metrics | ~65% | Lineage panel approximated; top bar differs |
| 05 Validation | ~40% | **Missing diamond gauge**, alert diff cards layout |
| 06 BI Dashboard | ~15% | App is full chart **builder**, not PDF dashboard |
| 07 Catalog/Glossary | ~20% | WIP overlay; not split directory + detail |
| 08 Proposals | ~75% | Missing **top bar** (Workspace Switcher, Sync Schema) |
| 09 Rules | ~70% | Missing top bar; learned rules styling close |
| 10 Settings Members | ~50% | Shell ok; **Members table** still old layout |
| 11 Status | ~80% | Core services rows differ slightly from PDF |
| 12 Verify | ~85% | Copy/button label close |

**Global shell mismatch:** Current `FigmaSidebar` (80px mint rail, no top bar) ≠ PDF (labeled sidebar + top nav on most pages).

---

## Recommended implementation order

Implement **one PDF page at a time**, compare against PNG in `docs/pdf-screens/`:

1. **Page 01** Login — polish  
2. **Page 11** Status  
3. **Page 12** Verify  
4. **Shared shell** — PDF sidebar + top bar (unblocks 02–10)  
5. **Page 08** Proposals  
6. **Page 10** Settings / Members  
7. **Page 02** Managed Data Plane  
8. **Page 03** Marketplace  
9. **Page 04** Metrics  
10. **Page 09** Rules  
11. **Page 05** Validation & Drift  
12. **Page 07** Catalog & Glossary  
13. **Page 06** BI Dashboard (largest rewrite)

---

## Next step

Reply with **“Start page 1”** (or any page number). We implement against the PNG only — component/icon mismatches can be fixed in a later pass.
