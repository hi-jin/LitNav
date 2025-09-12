const electronModule = require('electron')
const { app, BrowserWindow, dialog, ipcMain, shell, nativeTheme } = electronModule
const path = require('node:path')
const fs = require('node:fs')
const url = require('node:url')
const axios = require('axios')
// Removed MiniSearch dependency - using dense vector search only

// Lazy import pdfjs-dist for text extraction
let pdfjsLib = null

// Preprocess state
let currentPreprocess = null // { cancelled, controller, running }

// Global in-memory state (no DB)
const workspace = {
  root: null,
  includeFiles: [],
  docs: new Map(), // docId -> { id, path, pages, chunks: [{id, page, text, embedding, norm}] }
  settings: {
    embeddingHost: '',
    embeddingModel: '',
    apiKey: '',
    chunkSize: 1200,
    chunkOverlap: 200,
  },
}

function createWindow() {
  const windowOptions = {
    width: 1400,
    height: 900,
    title: 'LitNav',
    backgroundColor: '#1e1e1e',
    show: false, // Don't show until ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  }

  // Windows-specific dark mode settings
  if (process.platform === 'win32') {
    windowOptions.titleBarStyle = 'hidden'
    windowOptions.titleBarOverlay = {
      color: '#1e1e1e',
      symbolColor: '#ffffff',
      height: 30
    }
  } else if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hiddenInset'
    windowOptions.vibrancy = 'under-window'
  }

  const win = new BrowserWindow(windowOptions)

  // Show window when ready
  win.once('ready-to-show', () => {
    win.show()
  })

  const indexPath = path.join(process.cwd(), 'dist', 'index.html')
  if (fs.existsSync(indexPath)) {
    win.loadURL(url.pathToFileURL(indexPath).href)
  } else {
    win.loadURL('data:text/html,<h1>Build not found. Run npm run start</h1>')
  }

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  // Force dark mode
  nativeTheme.themeSource = 'dark'
  
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Utilities
function walkDir(dir) {
  const result = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      result.push(...walkDir(full))
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase()
      if (ext === '.pdf' || ext === '.txt' || ext === '.md') {
        result.push(full)
      }
    }
  }
  return result
}

async function loadPdfTextPages(filePath) {
  if (!pdfjsLib) {
    // Use legacy ESM build for Node compatibility (v5+)
    pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  }
  // Read the file directly to avoid URL fetch differences
  const data = new Uint8Array(fs.readFileSync(filePath))
  const loadingTask = pdfjsLib.getDocument({ data })
  const pdf = await loadingTask.promise
  const pages = []
  const total = pdf.numPages
  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i)
    const tc = await page.getTextContent()
    const text = tc.items.map((it) => it.str).join(' ')
    pages.push(text)
  }
  return pages
}

function chunkPageText(text, page, chunkSize, overlap) {
  const chunks = []
  if (!text || text.trim().length === 0) return chunks
  const size = Math.max(200, chunkSize)
  const ov = Math.max(0, Math.min(overlap, Math.floor(size * 0.8)))
  let start = 0
  while (start < text.length) {
    const end = Math.min(text.length, start + size)
    const slice = text.slice(start, end)
    chunks.push({ page, text: slice })
    if (end >= text.length) break
    start = end - ov
  }
  return chunks
}

async function embedBatch(inputs, host, model, apiKey, signal) {
  const url = new URL('/v1/embeddings', host).toString().replace('/v1/v1/', '/v1/')
  const res = await axios.post(
    url,
    { model, input: inputs },
    {
      timeout: 120000,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal,
    }
  )
  if (!res.data || !res.data.data) throw new Error('Invalid embedding response')
  return res.data.data.map((d) => d.embedding)
}

function dot(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}
function norm(a) {
  return Math.sqrt(dot(a, a))
}

// IPC handlers
ipcMain.handle('select-workspace', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (res.canceled || res.filePaths.length === 0) return null
  const root = res.filePaths[0]
  const files = walkDir(root)
  const pdfs = files.filter((f) => path.extname(f).toLowerCase() === '.pdf')
  workspace.root = root
  workspace.includeFiles = pdfs
  return { root, files: pdfs }
})

ipcMain.handle('set-settings', (_, settings) => {
  workspace.settings = { ...workspace.settings, ...settings }
  return workspace.settings
})

ipcMain.handle('set-include-files', (_, files) => {
  workspace.includeFiles = files
  return workspace.includeFiles
})

ipcMain.handle('reset-workspace', () => {
  workspace.root = null
  workspace.includeFiles = []
  workspace.docs.clear()
  return true
})

ipcMain.handle('preprocess', async (event) => {
  if (!workspace.root || !workspace.includeFiles?.length) {
    throw new Error('워크스페이스 또는 포함 파일이 설정되지 않았습니다.')
  }
  if (currentPreprocess?.running) {
    throw new Error('이미 전처리 중입니다.')
  }

  const { chunkSize, chunkOverlap, embeddingHost, embeddingModel, apiKey } = workspace.settings
  if (!embeddingHost || !embeddingModel) throw new Error('임베딩 설정(Host/Model)을 입력해주세요.')

  // Init token
  const controller = new AbortController()
  currentPreprocess = { cancelled: false, controller, running: true }
  const sender = event.sender

  const send = (name, payload) => {
    try { sender.send(name, payload) } catch {}
  }

  try {
    // Clear previous
    workspace.docs.clear()

    // Extract text and chunk
    send('preprocess-progress', { phase: 'extract', current: 0, total: workspace.includeFiles.length })
    let globalChunkId = 0
    let fileIndex = 0
    for (const filePath of workspace.includeFiles) {
      if (currentPreprocess.cancelled || controller.signal.aborted) throw new Error('CANCELLED')
      const id = filePath
      const ext = path.extname(filePath).toLowerCase()
      let pages = []
      if (ext === '.pdf') {
        pages = await loadPdfTextPages(filePath)
      } else if (ext === '.txt' || ext === '.md') {
        const txt = fs.readFileSync(filePath, 'utf-8')
        pages = [txt]
      } else {
        fileIndex++
        send('preprocess-progress', { phase: 'extract', current: fileIndex, total: workspace.includeFiles.length, file: filePath })
        continue
      }
      const chunks = []
      pages.forEach((t, i) => {
        const page = i + 1
        const pageChunks = chunkPageText(t, page, chunkSize, chunkOverlap)
        for (const pc of pageChunks) {
          chunks.push({ id: `${globalChunkId++}`, page, text: pc.text, embedding: null, norm: 0 })
        }
      })
      workspace.docs.set(id, { id, path: filePath, pages: pages.length, chunks })
      fileIndex++
      send('preprocess-progress', { phase: 'extract', current: fileIndex, total: workspace.includeFiles.length, file: filePath })
    }

    // Build embeddings for all chunks
    const allChunks = []
    for (const doc of workspace.docs.values()) {
      for (const c of doc.chunks) allChunks.push({ docId: doc.id, c })
    }
    const inputs = allChunks.map((x) => x.c.text)

    send('preprocess-progress', { phase: 'embed', current: 0, total: inputs.length })
    const batchSize = 64
    let processed = 0
    for (let i = 0; i < inputs.length; i += batchSize) {
      if (currentPreprocess.cancelled || controller.signal.aborted) throw new Error('CANCELLED')
      const end = Math.min(inputs.length, i + batchSize)
      const batchInputs = inputs.slice(i, end)
      const embs = await embedBatch(batchInputs, embeddingHost, embeddingModel, apiKey, controller.signal)
      for (let j = 0; j < embs.length; j++) {
        const { docId, c } = allChunks[i + j]
        c.embedding = embs[j]
        c.norm = norm(c.embedding)
        processed++
      }
      send('preprocess-progress', { phase: 'embed', current: processed, total: inputs.length })
    }

    // Count total chunks for summary
    let totalChunks = 0
    for (const doc of workspace.docs.values()) {
      totalChunks += doc.chunks.length
    }

    const summary = { docCount: workspace.docs.size, chunkCount: totalChunks }
    send('preprocess-complete', summary)
    return summary
  } catch (e) {
    // Cleanup on cancel
    if (e && typeof e.message === 'string' && e.message === 'CANCELLED') {
      workspace.docs.clear()
      send('preprocess-cancelled', {})
      throw new Error('전처리가 취소되었습니다.')
    }
    send('preprocess-error', { message: e?.message || String(e) })
    throw e
  } finally {
    if (currentPreprocess) currentPreprocess.running = false
    currentPreprocess = null
  }
})

ipcMain.handle('preprocess-cancel', () => {
  if (currentPreprocess?.running) {
    currentPreprocess.cancelled = true
    try { currentPreprocess.controller.abort() } catch {}
    return true
  }
  return false
})

ipcMain.handle('search', async (_, { query, perDocN = 3 }) => {
  if (workspace.docs.size === 0) throw new Error('전처리가 완료되지 않았습니다.')
  const { embeddingHost, embeddingModel, apiKey } = workspace.settings
  
  // Get query embedding
  const [qEmb] = await embedBatch([query], embeddingHost, embeddingModel, apiKey)
  const qNorm = norm(qEmb)

  // Dense vector similarity search across all chunks
  const resultsByDoc = new Map() // docId -> [{id, score, page, text}]
  
  for (const doc of workspace.docs.values()) {
    const docResults = []
    
    for (const c of doc.chunks) {
      // Calculate cosine similarity
      const similarity = qNorm && c.norm ? dot(qEmb, c.embedding) / (qNorm * c.norm) : 0
      
      docResults.push({
        id: `${doc.id}::${c.id}`,
        score: similarity,
        page: c.page,
        text: c.text
      })
    }
    
    // Sort by similarity score and keep top N per document
    docResults.sort((a, b) => b.score - a.score)
    if (docResults.length > 0) {
      resultsByDoc.set(doc.id, docResults.slice(0, perDocN))
    }
  }

  // Convert to final result format and sort documents by best hit
  const results = []
  for (const [docId, hits] of resultsByDoc.entries()) {
    results.push({
      docId,
      path: docId,
      hits
    })
  }
  
  // Sort documents by their top hit score
  results.sort((a, b) => (b.hits[0]?.score || 0) - (a.hits[0]?.score || 0))
  
  return results
})

ipcMain.handle('resolve-file-url', (_, filePath) => {
  return url.pathToFileURL(filePath).href
})

ipcMain.handle('load-pdf-data', async (_, filePath) => {
  const buf = fs.readFileSync(filePath)
  // Return as ArrayBuffer instead of base64 to avoid conversion issues
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
})
