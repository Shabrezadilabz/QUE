# Que

Interactive schema relationship diagram for a data-engineering workspace.

Scaffolded from Google Stitch designs in `../stitch_schema_stitch_visualizer` (Midnight Cyber theme).

## Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS v4
- React Router

## Dev

```bash
cd adc/Que
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`). Primary route: `/workspace`.

Sign in first (`/login`). Demo owner: `dev@stitch.local` / `stitch-dev`. Member: `member@stitch.local` / `stitch-member`. Viewer: `viewer@stitch.local` / `stitch-viewer`.

## Layout regions

`MainDiagramLayout` provides annotated slots:

| Slot | Component | Next task |
|------|-----------|-----------|
| TopBar | search, filters, export, visible counts | done |
| LeftSidebar | `DataSourceSidebar` (220px, filterable connections) | done |
| MainCanvas | draggable tables + SVG relationships | done (nodes/edges) |
| RightSidebar | table details, schema, sample data | done |
| MiniMap | scaled overview + draggable viewport | done |

Dummy sources: `src/data/dummySources.ts`. State for selection / viewport lives in `DiagramContext`.

## Database (Step 1)

Postgres metadata schema for Que lives in [`db/`](./db/).  
See [`db/README.md`](./db/README.md) for DBeaver / Docker setup.

## API (Step 2)

Minimal read API in [`api/`](./api/):

```bash
docker start stitch-pg
# apply migrations if needed, e.g. db/005_auth.sql
cd api && npm install && npm run seed && npm start
```

UI loads from `http://localhost:8787` with Bearer auth on workspace routes (falls back to dummy data if the API is down).

Auth endpoints: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.  
Disable with `STITCH_AUTH_DISABLED=1` for local prototyping.

