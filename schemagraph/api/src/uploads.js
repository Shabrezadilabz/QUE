/**
 * Spreadsheet upload storage — Excel/CSV under api/uploads/{workspaceId}/{connectionId}/
 * Paths relative to api/ so introspectSpreadsheet resolvePath works.
 */
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs'
import { basename, extname, join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import multer from 'multer'
import { createConnection, getConnection, updateConnection } from './connections.js'
import { syncConnection } from './syncConnection.js'
import { reindexWorkspace } from './ai/indexer.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const API_ROOT = resolve(__dirname, '..')
export const UPLOADS_ROOT = resolve(API_ROOT, 'uploads')

const ALLOWED_EXT = new Set(['.csv', '.tsv', '.txt', '.xlsx', '.xls'])

export function slugTableName(filename) {
  const stem = basename(filename, extname(filename))
  return (
    stem
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'uploaded_table'
  )
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function assertAllowed(originalname) {
  const ext = extname(originalname).toLowerCase()
  if (!ALLOWED_EXT.has(ext)) {
    const err = new Error(
      `Unsupported file type ${ext}. Use csv, tsv, xlsx, or xls.`,
    )
    err.status = 400
    throw err
  }
  return ext
}

/** Multer for existing connection uploads (disk). */
export function spreadsheetUploadMiddleware() {
  const storage = multer.diskStorage({
    destination(req, _file, cb) {
      try {
        const dir = join(
          UPLOADS_ROOT,
          req.params.workspaceId,
          req.params.connectionId,
        )
        ensureDir(dir)
        cb(null, dir)
      } catch (err) {
        cb(err)
      }
    },
    filename(_req, file, cb) {
      const safe = basename(file.originalname).replace(/[^\w.\-()+ ]+/g, '_')
      cb(null, `${Date.now().toString(36)}__${safe}`)
    },
  })

  return multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024, files: 10 },
    fileFilter(_req, file, cb) {
      try {
        assertAllowed(file.originalname)
        cb(null, true)
      } catch (err) {
        cb(err)
      }
    },
  }).array('files', 10)
}

/** Multer memory storage for create-from-upload (write after connection id known). */
export function spreadsheetMemoryUploadMiddleware() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 10 },
    fileFilter(_req, file, cb) {
      try {
        assertAllowed(file.originalname)
        cb(null, true)
      } catch (err) {
        cb(err)
      }
    },
  }).array('files', 10)
}

function parseParallelField(body, key) {
  const v = body?.[key]
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      return v.split(',').map((s) => s.trim()).filter(Boolean)
    }
  }
  return []
}

/**
 * Persist multer files (disk or memory) into connection config and sync schema.
 */
export async function attachUploadedFiles(
  workspaceId,
  connectionId,
  files,
  opts = {},
) {
  const connection = await getConnection(workspaceId, connectionId)
  if (!connection) {
    const err = new Error('connection not found')
    err.status = 404
    throw err
  }
  if (connection.type !== 'excel' && connection.type !== 'csv') {
    const err = new Error('uploads only supported for excel/csv connections')
    err.status = 400
    throw err
  }

  const tableNames = opts.tableNames || []
  const sheets = opts.sheets || []
  const dir = join(UPLOADS_ROOT, workspaceId, connectionId)
  ensureDir(dir)

  const newSpecs = []
  for (let i = 0; i < (files || []).length; i++) {
    const f = files[i]
    assertAllowed(f.originalname)
    let filename = f.filename
    if (!filename) {
      const safe = basename(f.originalname).replace(/[^\w.\-()+ ]+/g, '_')
      filename = `${Date.now().toString(36)}_${i}__${safe}`
      writeFileSync(join(dir, filename), f.buffer)
    }
    const rel = `uploads/${workspaceId}/${connectionId}/${filename}`.replace(
      /\\/g,
      '/',
    )
    newSpecs.push({
      path: rel,
      tableName: String(tableNames[i] || slugTableName(f.originalname)),
      sheet: sheets[i] || undefined,
      originalName: f.originalname,
      size: f.size,
    })
  }

  if (newSpecs.length === 0) {
    const err = new Error('no files uploaded')
    err.status = 400
    throw err
  }

  const prevConfig =
    connection.config && typeof connection.config === 'object'
      ? { ...connection.config }
      : {}
  const prevFiles = Array.isArray(prevConfig.files) ? prevConfig.files : []
  const filesList = opts.replace ? newSpecs : [...prevFiles, ...newSpecs]

  const nextConfig = {
    ...prevConfig,
    files: filesList.map((f) => ({
      path: f.path,
      tableName: f.tableName,
      ...(f.sheet ? { sheet: f.sheet } : {}),
      ...(f.originalName ? { originalName: f.originalName } : {}),
    })),
    includeSamples: prevConfig.includeSamples !== false,
    sampleLimit: Math.min(Number(prevConfig.sampleLimit ?? 5), 5),
  }

  const updated = await updateConnection(workspaceId, connectionId, {
    config: nextConfig,
    status: 'warning',
  })

  let syncResult = null
  if (opts.sync !== false) {
    try {
      syncResult = await syncConnection(workspaceId, connectionId)
      void reindexWorkspace(workspaceId).catch((err) =>
        console.warn('[Que upload] reindex:', err.message || err),
      )
    } catch (err) {
      syncResult = { error: String(err.message || err) }
    }
  }

  return {
    connection: updated,
    uploaded: newSpecs,
    sync: syncResult,
  }
}

/**
 * Create excel/csv connection from multipart upload + introspect into workspace.
 */
export async function createSpreadsheetFromUploads(workspaceId, body, files) {
  const type = String(body.type || 'excel').trim()
  if (type !== 'excel' && type !== 'csv') {
    const err = new Error('type must be excel or csv')
    err.status = 400
    throw err
  }
  if (!files?.length) {
    const err = new Error('at least one file required')
    err.status = 400
    throw err
  }

  const connection = await createConnection(workspaceId, {
    id: randomUUID(),
    name: String(body.name || 'Uploaded spreadsheet').trim() || 'Uploaded spreadsheet',
    type,
    description: body.description || undefined,
    status: 'warning',
    config: { files: [], includeSamples: true, sampleLimit: 5 },
  })

  return attachUploadedFiles(workspaceId, connection.id, files, {
    tableNames: parseParallelField(body, 'tableNames'),
    sheets: parseParallelField(body, 'sheets'),
    sync: body.sync !== 'false' && body.sync !== false,
    replace: true,
  })
}

export function parseUploadOptions(req) {
  return {
    tableNames: parseParallelField(req.body, 'tableNames'),
    sheets: parseParallelField(req.body, 'sheets'),
    sync: req.body?.sync !== 'false' && req.query?.sync !== 'false',
    replace:
      req.body?.replace === 'true' ||
      req.body?.replace === true ||
      req.query?.replace === 'true',
  }
}

export function tryDeleteUpload(relPath) {
  try {
    if (!relPath || !String(relPath).startsWith('uploads/')) return
    const abs = resolve(API_ROOT, relPath)
    if (abs.startsWith(UPLOADS_ROOT) && existsSync(abs)) unlinkSync(abs)
  } catch {
    /* ignore */
  }
}
