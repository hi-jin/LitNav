import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { FolderIcon, NoteIcon, SettingsIcon, ExitIcon, CancelIcon, SearchIcon } from './icons.jsx'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Configure PDF.js to use worker but with safer options
try {
  // Use the Vite worker URL but configure for safer operation
  if (pdfjsWorker && typeof pdfjsWorker === 'string') {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker
    console.log('PDF.js worker configured with Vite URL:', pdfjsWorker)
  } else {
    // Fallback to CDN worker
    const cdnWorkerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`
    pdfjs.GlobalWorkerOptions.workerSrc = cdnWorkerSrc
    console.log('PDF.js worker configured with CDN:', cdnWorkerSrc)
  }
  
  // Set verbose level to reduce console warnings
  pdfjs.GlobalWorkerOptions.verbosity = 0
  
} catch (error) {
  console.error('Worker configuration failed:', error)
  // Use CDN as final fallback
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`
}

// Error Boundary for PDF Viewer
class PDFErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorKey: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('PDF Error Boundary caught an error:', error, errorInfo)
    
    // Create unique error key based on file path and timestamp
    const errorKey = `${this.props.filePath}-${Date.now()}`
    this.setState({ errorKey })
    
    // Auto-retry for sendWithPromise errors
    if (error?.message?.includes('sendWithPromise') || 
        error?.message?.includes('Cannot read properties of null')) {
      setTimeout(() => {
        this.setState({ hasError: false, error: null })
      }, 200)
    }
  }

  componentDidUpdate(prevProps) {
    // Reset error state when file changes
    if (prevProps.filePath !== this.props.filePath && this.state.hasError) {
      this.setState({ hasError: false, error: null, errorKey: null })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100%', 
          color: 'var(--text-muted)',
          fontSize: '13px',
          flexDirection: 'column',
          gap: '8px',
          padding: '20px'
        }}>
          <div>PDF 표시 중 오류가 발생했습니다</div>
          <div style={{ fontSize: '11px', opacity: 0.7 }}>
            {this.state.error?.message?.includes('sendWithPromise') || 
             this.state.error?.message?.includes('Cannot read properties of null')
              ? '자동으로 재시도 중입니다...'
              : '다른 문서를 시도해보세요'}
          </div>
          <button 
            style={{
              marginTop: '8px',
              padding: '4px 8px',
              background: 'var(--vscode-button-bg)',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              fontSize: '11px',
              cursor: 'pointer'
            }}
            onClick={() => this.setState({ hasError: false, error: null, errorKey: null })}
          >
            수동 재시도
          </button>
        </div>
      )
    }

    return React.cloneElement(this.props.children, { 
      key: this.state.errorKey || this.props.filePath 
    })
  }
}

// Welcome Screen
function WelcomeScreen({ onSelectWorkspace }) {
  return (
    <div className="app-container">
      <TitleBar />
      <div className="welcome-screen">
        <div className="welcome-content">
          <h1 className="welcome-title">LitNav</h1>
          <p className="welcome-subtitle">로컬 워크스페이스 기반 논문 탐색 도구</p>
          <button className="welcome-button" onClick={onSelectWorkspace}>
            워크스페이스 선택
          </button>
        </div>
      </div>
    </div>
  )
}

// Confirmation Modal Component
function ConfirmationModal({ isOpen, title, message, onConfirm, onCancel, confirmText = "확인", cancelText = "취소", isDanger = false }) {
  if (!isOpen) return null

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '13px', lineHeight: '1.5', margin: 0 }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            style={isDanger ? {
              background: 'var(--vscode-errorBackground)',
              color: 'white'
            } : {}}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

// Notes Collection Modal
function NotesCollectionModal({ isOpen, notes, files, onClose, onClearAllNotes }) {
  const [exportFormat, setExportFormat] = useState('markdown')
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  if (!isOpen) return null

  // Filter notes that have content
  const notesWithContent = Object.entries(notes).filter(([_, content]) => content && content.trim())

  // Generate markdown content
  const generateMarkdown = () => {
    let markdown = '# 논문 노트 모음\n\n'
    markdown += `생성 일시: ${new Date().toLocaleString('ko-KR')}\n\n`
    markdown += '---\n\n'

    notesWithContent.forEach(([filePath, content]) => {
      const fileName = filePath.split(/[\\\/]/).pop()
      markdown += `## 📄 ${fileName}\n\n`
      markdown += `${content}\n\n`
      markdown += '---\n\n'
    })

    return markdown
  }

  // Generate plain text content
  const generatePlainText = () => {
    let text = '논문 노트 모음\n'
    text += `생성 일시: ${new Date().toLocaleString('ko-KR')}\n\n`
    text += '='.repeat(50) + '\n\n'

    notesWithContent.forEach(([filePath, content]) => {
      const fileName = filePath.split(/[\\\/]/).pop()
      text += `[${fileName}]\n\n`
      text += `${content}\n\n`
      text += '-'.repeat(50) + '\n\n'
    })

    return text
  }

  // Export notes function
  const handleExport = async () => {
    let content = ''
    let filename = ''
    let mimeType = ''

    if (exportFormat === 'markdown') {
      content = generateMarkdown()
      filename = `notes_${new Date().toISOString().slice(0,10)}.md`
      mimeType = 'text/markdown'
    } else {
      content = generatePlainText()
      filename = `notes_${new Date().toISOString().slice(0,10)}.txt`
      mimeType = 'text/plain'
    }

    // Create blob and download
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Handle clear all notes
  const handleClearAll = () => {
    onClearAllNotes()
    setShowClearConfirm(false)
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '800px', width: '90%' }}>
        <div className="modal-header">
          <div className="modal-title">노트 모음</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {notesWithContent.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              color: 'var(--text-muted)',
              fontSize: '13px'
            }}>
              작성된 노트가 없습니다
            </div>
          ) : (
            <div className="notes-collection">
              <div style={{
                marginBottom: '16px',
                padding: '8px',
                background: 'var(--vscode-panel-bg)',
                borderRadius: '4px',
                fontSize: '12px',
                color: 'var(--text-muted)'
              }}>
                총 {notesWithContent.length}개 문서에 노트가 작성되었습니다
              </div>

              {notesWithContent.map(([filePath, content]) => {
                const fileName = filePath.split(/[\\\/]/).pop()
                return (
                  <div key={filePath} style={{
                    marginBottom: '24px',
                    padding: '16px',
                    background: 'var(--vscode-editor-bg)',
                    borderRadius: '4px',
                    border: '1px solid var(--border)'
                  }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      marginBottom: '12px',
                      color: 'var(--vscode-foreground)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span>📄</span>
                      <span title={filePath}>{fileName}</span>
                    </div>
                    <div style={{
                      fontSize: '13px',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap',
                      color: 'var(--text)'
                    }}>
                      {content}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginRight: 'auto' }}>
            {!showClearConfirm ? (
              <>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>내보내기 형식:</label>
                <select
                  className="form-input"
                  style={{ width: '120px', fontSize: '12px' }}
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                >
                  <option value="markdown">Markdown</option>
                  <option value="text">Plain Text</option>
                </select>
              </>
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--vscode-errorForeground)' }}>
                정말로 모든 노트를 삭제하시겠습니까?
              </span>
            )}
          </div>

          {!showClearConfirm ? (
            <>
              <button
                className="btn btn-secondary"
                onClick={handleExport}
                disabled={notesWithContent.length === 0}
              >
                내보내기
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowClearConfirm(true)}
                disabled={notesWithContent.length === 0}
                style={{
                  background: 'var(--vscode-button-bg)',
                  color: 'var(--vscode-errorForeground)'
                }}
              >
                모두 삭제
              </button>
              <button className="btn btn-primary" onClick={onClose}>닫기</button>
            </>
          ) : (
            <>
              <button
                className="btn btn-secondary"
                onClick={() => setShowClearConfirm(false)}
              >
                취소
              </button>
              <button
                className="btn btn-primary"
                onClick={handleClearAll}
                style={{
                  background: 'var(--vscode-errorBackground)',
                  color: 'white'
                }}
              >
                삭제 확인
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Settings Modal
function SettingsModal({ isOpen, settings, onSave, onClose }) {
  const [localSettings, setLocalSettings] = useState(settings)

  useEffect(() => {
    setLocalSettings(settings)
  }, [settings])

  if (!isOpen) return null

  const handleSave = () => {
    onSave(localSettings)
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">설정</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Embedding API Host</label>
            <input
              className="form-input"
              placeholder="http://localhost:11434"
              value={localSettings.embeddingHost}
              onChange={(e) => setLocalSettings({ ...localSettings, embeddingHost: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Embedding Model</label>
            <input
              className="form-input"
              placeholder="nomic-embed-text"
              value={localSettings.embeddingModel}
              onChange={(e) => setLocalSettings({ ...localSettings, embeddingModel: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">API Key (optional)</label>
            <input
              className="form-input"
              placeholder="sk-..."
              value={localSettings.apiKey}
              onChange={(e) => setLocalSettings({ ...localSettings, apiKey: e.target.value })}
            />
          </div>
          <hr className="modal-divider" />
          <div className="form-group">
            <label className="form-label">LLM API Host (For Exhaustive Search)</label>
            <input
              className="form-input"
              placeholder="http://localhost:11434"
              value={localSettings.llmHost}
              onChange={(e) => setLocalSettings({ ...localSettings, llmHost: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">LLM Model</label>
            <input
              className="form-input"
              placeholder="llama3.2"
              value={localSettings.llmModel}
              onChange={(e) => setLocalSettings({ ...localSettings, llmModel: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">LLM API Key (optional)</label>
            <input
              className="form-input"
              placeholder="sk-..."
              value={localSettings.llmApiKey}
              onChange={(e) => setLocalSettings({ ...localSettings, llmApiKey: e.target.value })}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Chunk Size</label>
              <input
                type="number"
                className="form-input"
                value={localSettings.chunkSize}
                onChange={(e) => setLocalSettings({ ...localSettings, chunkSize: parseInt(e.target.value || '0', 10) })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Overlap</label>
              <input
                type="number"
                className="form-input"
                value={localSettings.chunkOverlap}
                onChange={(e) => setLocalSettings({ ...localSettings, chunkOverlap: parseInt(e.target.value || '0', 10) })}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">논문별 문맥 수 (n)</label>
            <input
              type="number"
              className="form-input"
              value={localSettings.perDocN}
              onChange={(e) => setLocalSettings({ ...localSettings, perDocN: parseInt(e.target.value || '0', 10) })}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={handleSave}>저장</button>
        </div>
      </div>
    </div>
  )
}

// Title Bar Component
function TitleBar() {
  return (
    <div className="title-bar">
      <div className="title-bar-content">
        <span className="app-title">LitNav</span>
      </div>
    </div>
  )
}

// Activity Bar
function ActivityBar({ activeView, onViewChange, processing, onSettings, onExit }) {
  return (
    <div className="activity-bar">
      <div 
        className={`activity-item ${activeView === 'files' ? 'active' : ''}`}
        onClick={() => onViewChange('files')}
        title="Explorer"
      >
        <FolderIcon size={24} />
      </div>
      <div 
        className={`activity-item ${activeView === 'notes' ? 'active' : ''}`}
        onClick={() => onViewChange('notes')}
        title="Notes"
      >
        <NoteIcon size={24} />
      </div>
      <div style={{ flex: 1 }} />
      <div 
        className="activity-item"
        onClick={onSettings}
        title="Settings"
      >
        <SettingsIcon size={24} />
      </div>
      <div 
        className="activity-item"
        onClick={onExit}
        title="Change Workspace"
      >
        <ExitIcon size={24} />
      </div>
    </div>
  )
}

// Sidebar Content
function SidebarContent({
  view,
  workspace,
  files,
  activeDoc,
  notes,
  onUpdateNotes,
  onShowNotesCollection,
  onClearAllNotes,
  documentMode,
  onDocumentModeChange,
  selectedDocument,
  onDocumentSelect
}) {
  if (view === 'files') {
    return (
      <div className="sidebar-content">
        {/* Document Mode Toggle */}
        <div className="document-mode-toggle" style={{ 
          padding: '8px', 
          borderBottom: '1px solid var(--border)', 
          marginBottom: '8px' 
        }}>
          <div style={{ 
            display: 'flex', 
            background: 'var(--background-secondary)', 
            borderRadius: '4px',
            padding: '2px'
          }}>
            <button 
              onClick={() => onDocumentModeChange('multi')}
              style={{
                flex: 1,
                padding: '6px 12px',
                background: documentMode === 'multi' ? 'var(--primary)' : 'transparent',
                color: documentMode === 'multi' ? 'white' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: documentMode === 'multi' ? 'bold' : 'normal'
              }}
            >
              Multi-Doc
            </button>
            <button 
              onClick={() => onDocumentModeChange('single')}
              style={{
                flex: 1,
                padding: '6px 12px',
                background: documentMode === 'single' ? 'var(--primary)' : 'transparent',
                color: documentMode === 'single' ? 'white' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: documentMode === 'single' ? 'bold' : 'normal'
              }}
            >
              Single-Doc
            </button>
          </div>
        </div>

        <div className="file-tree">
          <div className="file-tree-header">
            <span>PDF FILES ({files.length})</span>
          </div>
          {files.map((file) => (
            <div 
              key={file} 
              className={`file-item ${documentMode === 'single' && selectedDocument === file ? 'selected' : ''}`}
            >
              <div 
                className="file-name" 
                title={file}
                style={{ cursor: documentMode === 'single' ? 'pointer' : 'default' }}
                onClick={() => {
                  if (documentMode === 'single') {
                    onDocumentSelect(file)
                  }
                }}
              >
                {file.split(/[\\\\/]/).pop()}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (view === 'notes') {
    const noteValue = activeDoc ? notes[activeDoc] || '' : ''
    const hasAnyNotes = Object.values(notes).some(note => note && note.trim())

    return (
      <div className="sidebar-content">
        <div className="notes-section" style={{ height: '100%', borderTop: 'none' }}>
          <div className="notes-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>NOTES</span>
            {hasAnyNotes && (
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  className="btn btn-secondary"
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  onClick={onShowNotesCollection}
                  title="모든 노트 보기"
                >
                  <span style={{ fontSize: '12px' }}>📝</span>
                  모아보기
                </button>
                <button
                  className="btn btn-secondary"
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'var(--vscode-button-bg)',
                    color: 'var(--vscode-errorForeground)'
                  }}
                  onClick={onClearAllNotes}
                  title="모든 노트 초기화"
                >
                  <span style={{ fontSize: '12px' }}>🗑️</span>
                  초기화
                </button>
              </div>
            )}
          </div>
          <div className="notes-content">
            {!activeDoc ? (
              <div className="notes-placeholder">
                문서를 선택하면 노트를 작성할 수 있습니다
              </div>
            ) : (
              <textarea
                className="notes-textarea"
                placeholder="이 문서에 대한 노트를 작성하세요..."
                value={noteValue}
                onChange={(e) => onUpdateNotes({ ...notes, [activeDoc]: e.target.value })}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}

// Resizable Splitter Component
function ResizableSplitter() {
  const [isDragging, setIsDragging] = useState(false)
  const splitterRef = useRef(null)

  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return
    
    const container = splitterRef.current?.closest('.editor-area')
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const percentage = ((e.clientX - containerRect.left) / containerRect.width) * 100
    
    // Constrain between 30% and 70%
    const constrainedPercentage = Math.max(30, Math.min(70, percentage))
    
    // Update CSS custom property
    container.style.setProperty('--splitter-position', `${constrainedPercentage}%`)
  }, [isDragging])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  return (
    <div 
      ref={splitterRef}
      className="splitter" 
      onMouseDown={handleMouseDown}
      style={{ 
        cursor: isDragging ? 'col-resize' : 'col-resize'
      }}
    />
  )
}

// Define PDF options outside component to prevent re-initialization issues
const pdfOptions = {
  cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
  verbosity: 0,
  disableWorker: false,
  isEvalSupported: false,
  disableAutoFetch: false,
  disableStream: false,
  enableXfa: false,
  maxImageSize: 16777216,
  cacheImages: true,
  useSystemFonts: false,
  useWorkerFetch: false
}

// Function to find text coordinates in PDF with improved coordinate transformation
async function findTextCoordinates(pdfDocument, pageNumber, searchText) {
  try {
    if (!pdfDocument || !searchText) return null
    
    const page = await pdfDocument.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const textContent = await page.getTextContent()
    
    // Normalize search text for comparison
    const normalizedSearchText = searchText.replace(/\s+/g, ' ').trim().toLowerCase()
    
    console.log('Searching for:', normalizedSearchText)
    
    // Build continuous text with position mapping
    let fullText = ''
    const textItems = []
    
    textContent.items.forEach((item, index) => {
      if (item.str && item.str.trim()) {
        const startIndex = fullText.length
        fullText += item.str
        const endIndex = fullText.length
        
        // Use simpler coordinate transformation
        // item.transform = [a, b, c, d, e, f] where e,f are x,y coordinates
        const transform = item.transform
        const x = transform[4]  // Direct x coordinate
        const y = transform[5]  // Direct y coordinate
        
        // Calculate font height from transform matrix
        const fontHeight = Math.sqrt(transform[2] * transform[2] + transform[3] * transform[3])
        const fontWidth = Math.sqrt(transform[0] * transform[0] + transform[1] * transform[1])
        
        // Convert PDF coordinates to viewport coordinates
        const viewportX = x
        const viewportY = viewport.height - y - fontHeight // Flip Y and adjust for font height
        
        // Ensure coordinates are within viewport bounds
        if (viewportX >= 0 && viewportX < viewport.width && 
            viewportY >= 0 && viewportY < viewport.height) {
          
          textItems.push({
            text: item.str,
            startIndex,
            endIndex,
            x: viewportX,
            y: viewportY,
            width: item.width || (item.str.length * fontWidth * 0.6), // Fallback width calculation
            height: fontHeight,
            originalItem: item
          })
        }
        
        // Add space after each item for word separation
        if (index < textContent.items.length - 1) {
          fullText += ' '
        }
      }
    })
    
    console.log('Built full text:', fullText.substring(0, 200) + '...')
    console.log('Total text items:', textItems.length)
    
    // Find the search text in the full text using fuzzy matching
    const normalizedFullText = fullText.replace(/\s+/g, ' ').toLowerCase()
    let searchIndex = normalizedFullText.indexOf(normalizedSearchText)
    
    // Try fuzzy matching if exact match fails
    if (searchIndex === -1) {
      // Try without punctuation
      const cleanSearchText = normalizedSearchText.replace(/[^\w가-힣\s]/g, '').trim()
      const cleanFullText = normalizedFullText.replace(/[^\w가-힣\s]/g, '')
      searchIndex = cleanFullText.indexOf(cleanSearchText)
      
      if (searchIndex === -1) {
        console.warn('Text not found:', normalizedSearchText)
        return null
      }
    }
    
    console.log('Found text at index:', searchIndex)
    
    // Find which text items contain our search text
    const searchEndIndex = searchIndex + normalizedSearchText.length
    const relevantItems = textItems.filter(item => 
      item.startIndex <= searchEndIndex && item.endIndex >= searchIndex
    )
    
    console.log('Relevant items:', relevantItems.length)
    
    if (relevantItems.length === 0) return null
    
    // Create individual bounding boxes for better text coverage
    const boundingBoxes = relevantItems.map(item => ({
      x: Math.max(0, item.x), // Ensure non-negative
      y: Math.max(0, item.y), // Ensure non-negative  
      width: Math.max(8, item.width), // Minimum width
      height: Math.max(12, item.height), // Minimum height
      text: item.text
    }))
    
    console.log('Created bounding boxes:', boundingBoxes)
    
    return {
      pageNumber,
      boundingBoxes: boundingBoxes,
      searchText: normalizedSearchText,
      viewport: { width: viewport.width, height: viewport.height }
    }
    
  } catch (error) {
    console.warn('Error finding text coordinates:', error)
    return null
  }
}

// PDF Viewer Component
function PDFViewer({ filePath, page, snippet, query }) {
  const containerRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(600)
  const [fileUrl, setFileUrl] = useState(null)
  const [numPages, setNumPages] = useState(null)
  const [pdfError, setPdfError] = useState(null)
  const [textRendererKey, setTextRendererKey] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [documentKey, setDocumentKey] = useState(0)
  const documentRef = useRef(null)
  const mountedRef = useRef(true)
  const loadingTaskRef = useRef(null)
  const previousFileRef = useRef(null)
  
  // State for coordinate-based highlighting
  const [textCoordinates, setTextCoordinates] = useState(null)
  
  // Zoom state
  const [scale, setScale] = useState(null) // null means fit-to-width
  const [isManualZoom, setIsManualZoom] = useState(false) // Track if user manually zoomed
  const [isZooming, setIsZooming] = useState(false) // For transient zoom UI state
  const [currentFitScale, setCurrentFitScale] = useState(1) // Track the current fit scale
  const [actualPageWidth, setActualPageWidth] = useState(600) // Track actual PDF page width
  const zoomEndTimeoutRef = useRef(null)


  const highlightTerms = useMemo(() => {
    if (!snippet) return []
    
    // Clean and normalize the snippet for better matching
    const cleanSnippet = snippet.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim()
    if (cleanSnippet.length < 10) return []
    
    // Only use the complete snippet for precise highlighting
    const normalizedSnippet = cleanSnippet.replace(/\s+/g, ' ').toLowerCase()
    return [normalizedSnippet]
  }, [snippet])

  // Create a fuzzy matching function for the exact context
  const createFuzzyMatcher = useMemo(() => {
    if (!highlightTerms.length) return null
    
    const term = highlightTerms[0] // Only use the complete snippet
    // Remove all non-letter characters for fuzzy matching
    const sanitizedTerm = term.replace(/[^a-zA-Z가-힣]/g, '')
    if (sanitizedTerm.length < 10) return null
    
    // Create a pattern that allows non-letter characters between each letter
    // but keeps the sequence intact for more precise matching
    const pattern = sanitizedTerm.split('').join('[^a-zA-Z가-힣]{0,3}') // Allow up to 3 non-letters between
    try {
      return new RegExp(`(${pattern})`, 'gi')
    } catch {
      return null
    }
  }, [highlightTerms])

  const highlightRegex = useMemo(() => {
    if (!highlightTerms.length) return null
    const escaped = highlightTerms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    return new RegExp(`(${escaped.join('|')})`, 'gi')
  }, [highlightTerms])

  // Find text coordinates when snippet changes and scroll to position
  useEffect(() => {
    async function searchTextCoordinates() {
      if (!documentRef.current || !page || !snippet) {
        setTextCoordinates(null)
        return
      }
      
      try {
        const coords = await findTextCoordinates(documentRef.current, page, snippet)
        setTextCoordinates(coords)
        
        // Scroll to the highlighted text position after coordinates are found
        if (coords && coords.boundingBoxes && coords.boundingBoxes.length > 0) {
          setTimeout(() => {
            scrollToHighlight(coords)
          }, 300) // Wait for highlight to render
        }
      } catch (error) {
        console.warn('Failed to find text coordinates:', error)
        setTextCoordinates(null)
      }
    }
    
    searchTextCoordinates()
  }, [snippet, page, documentKey])
  
  // Function to scroll to highlight position within the page
  const scrollToHighlight = useCallback((coords) => {
    if (!containerRef.current || !coords || !coords.boundingBoxes) return
    
    const currentScale = scale || (containerWidth / actualPageWidth)
    const firstBox = coords.boundingBoxes[0]
    
    // Calculate the absolute position of the highlight within the PDF container
    const pageContainer = containerRef.current.querySelector(`[data-page-number="${coords.pageNumber}"]`)?.parentElement
    if (!pageContainer) return
    
    const pageRect = pageContainer.getBoundingClientRect()
    const containerRect = containerRef.current.getBoundingClientRect()
    
    // Calculate target scroll position
    const highlightY = firstBox.y * currentScale
    const targetScrollTop = pageContainer.offsetTop + highlightY - (containerRect.height / 2)
    
    // Smooth scroll to the highlight position
    containerRef.current.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth'
    })
    
    console.log('Scrolled to highlight at page', coords.pageNumber, 'position', highlightY)
  }, [scale, containerWidth, actualPageWidth])

  // Force re-render of text layer when highlight terms change (but not on scale change)
  useEffect(() => {
    if (createFuzzyMatcher) {
      setTextRendererKey(prev => prev + 1)
    }
  }, [createFuzzyMatcher])

  const customTextRenderer = useCallback(({ str, itemIndex }) => {
    if (!str) return str
    
    try {
      // Try fuzzy matching for multiline context
      if (createFuzzyMatcher && createFuzzyMatcher.test(str)) {
        return str.replace(createFuzzyMatcher, (match) => {
          return `<mark style="background-color: rgba(250, 204, 21, 0.6); color: transparent; padding: 0; border-radius: 2px;">${match}</mark>`
        })
      }
      
      // Fallback to exact matching
      if (highlightRegex && highlightRegex.test(str)) {
        return str.replace(highlightRegex, (match) => {
          return `<mark style="background-color: rgba(250, 204, 21, 0.6); color: transparent; padding: 0; border-radius: 2px;">${match}</mark>`
        })
      }
      
      return str
    } catch (error) {
      console.warn('Highlight error:', error)
      return str
    }
  }, [createFuzzyMatcher, highlightRegex])

  // Clean up when file changes or component unmounts
  const cleanupDocument = useCallback(() => {
    // Destroy loading task if exists
    if (loadingTaskRef.current) {
      try {
        loadingTaskRef.current.destroy()
      } catch (e) {
        console.debug('Loading task cleanup error:', e)
      }
      loadingTaskRef.current = null
    }
    
    // Destroy document if exists
    if (documentRef.current) {
      try {
        if (documentRef.current._transport) {
          documentRef.current._transport.destroy()
        }
        if (typeof documentRef.current.destroy === 'function') {
          documentRef.current.destroy()
        }
      } catch (e) {
        console.debug('Document cleanup error:', e)
      }
      documentRef.current = null
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    let timeoutId = null
    
    async function loadFile() {
      if (!filePath) {
        cleanupDocument()
        setFileUrl(null)
        setPdfError(null)
        setNumPages(null)
        setIsLoading(false)
        return
      }
      
      // Skip if same file is already loaded
      if (previousFileRef.current === filePath && fileUrl && !pdfError) {
        return
      }
      
      try {
        setIsLoading(true)
        setPdfError(null)
        
        // Clean up previous document before loading new one
        cleanupDocument()
        
        // Use file:// URL approach
        if (!window.api?.resolveFileUrl) {
          throw new Error('PDF API not available')
        }

        const resolvedUrl = await window.api.resolveFileUrl(filePath)
        if (!mountedRef.current) return

        if (!resolvedUrl) {
          throw new Error('Failed to resolve file URL')
        }

        setFileUrl(resolvedUrl)
        previousFileRef.current = filePath
        // Increment key to force Document re-mount
        setDocumentKey(prev => prev + 1)
      } catch (error) {
        if (!mountedRef.current) return
        console.error('PDF load error:', error)
        setFileUrl(null)
        setNumPages(null)
        setPdfError(error?.message || 'PDF 로드 실패')
        previousFileRef.current = null
      } finally {
        if (mountedRef.current) {
          setIsLoading(false)
        }
      }
    }
    
    // Add delay to batch rapid changes
    timeoutId = setTimeout(loadFile, 100)
    
    return () => {
      mountedRef.current = false
      if (timeoutId) clearTimeout(timeoutId)
      cleanupDocument()
    }
  }, [filePath, cleanupDocument])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    
    let resizeTimeout
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        const width = element.clientWidth
        if (width) {
          const newWidth = Math.max(300, Math.min(1100, width - 32))
          // Only update if significantly different to prevent unnecessary re-renders
          setContainerWidth(prevWidth => {
            const diff = Math.abs(newWidth - prevWidth)
            return diff > 10 ? newWidth : prevWidth
          })
          
          // Reset to fit-to-width if window is resized and not in manual zoom mode
          if (!isManualZoom) {
            setScale(null)
          }
        }
      }, 150) // Debounce resize events
    })
    
    observer.observe(element)
    return () => {
      observer.disconnect()
      clearTimeout(resizeTimeout)
    }
  }, [isManualZoom])

  // Handle page jumping with proper timing (only for different pages)
  useEffect(() => {
    if (!containerRef.current || !page || !numPages) return
    
    const scrollToPage = () => {
      const target = containerRef.current.querySelector(`[data-page-number="${page}"]`)
      if (target?.scrollIntoView) {
        // Only do page-level jump if we don't have specific coordinates to scroll to
        // This will be overridden by scrollToHighlight if coordinates are found
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return true
      }
      return false
    }
    
    // Only do page jumping if we don't have text coordinates yet
    // The scrollToHighlight function will handle precise positioning
    if (!textCoordinates) {
      // Try immediate scroll first
      if (scrollToPage()) return
      
      // If not found, wait for pages to render
      const maxRetries = 10
      let retries = 0
      const retryScroll = () => {
        if (retries >= maxRetries) return
        if (scrollToPage()) return
        
        retries++
        setTimeout(retryScroll, 200)
      }
      
      setTimeout(retryScroll, 100)
    }
  }, [page, numPages, textCoordinates])
  
  // Reset zoom to fit-to-width when context (file or page) changes
  useEffect(() => {
    setScale(null)
    setIsManualZoom(false)
  }, [filePath, page])

  // Update fit scale when container width or actual page width changes
  useEffect(() => {
    const fitScale = containerWidth / actualPageWidth
    setCurrentFitScale(Math.max(0.1, fitScale))
  }, [containerWidth, actualPageWidth])
  
  // Zoom helpers
  const clampScale = useCallback((s) => Math.max(0.5, Math.min(3, s)), [])

  const applyZoomStep = useCallback((direction) => {
    // direction: +1 for in, -1 for out
    setIsManualZoom(true)
    setIsZooming(true)

    // Preserve horizontal center position during zoom
    const container = containerRef.current
    let centerRatio = 0
    if (container) {
      const prevSW = container.scrollWidth
      const prevCW = container.clientWidth
      const prevCenter = container.scrollLeft + prevCW / 2
      centerRatio = prevSW > 0 ? prevCenter / prevSW : 0
    }

    setScale(prevScale => {
      // If we're in FIT mode (scale is null), use current fit scale as base
      let base = prevScale || currentFitScale
      const next = clampScale(base + (direction > 0 ? 0.2 : -0.2))
      return next
    })

    // After pages resize, restore center position
    if (container) {
      const adjust = () => {
        const sw = container.scrollWidth
        const cw = container.clientWidth
        const desiredCenter = Math.max(0, Math.min(sw, centerRatio * sw))
        const newScrollLeft = Math.max(0, Math.min(sw - cw, desiredCenter - cw / 2))
        container.scrollLeft = newScrollLeft
      }
      // Double RAF to wait for layout, fallback to timeout
      requestAnimationFrame(() => requestAnimationFrame(adjust))
      setTimeout(adjust, 60)
    }

    // Debounce end-of-zoom state
    if (zoomEndTimeoutRef.current) clearTimeout(zoomEndTimeoutRef.current)
    zoomEndTimeoutRef.current = setTimeout(() => setIsZooming(false), 160)
  }, [clampScale, currentFitScale])

  // Zoom functions
  const handleZoomIn = useCallback(() => {
    applyZoomStep(+1)
  }, [applyZoomStep])
  
  const handleZoomOut = useCallback(() => {
    applyZoomStep(-1)
  }, [applyZoomStep])
  
  const handleZoomReset = useCallback(() => {
    setScale(null)
    setIsManualZoom(false)
    setIsZooming(false)
  }, [])
  
  const handleZoomFit = useCallback(() => {
    setScale(1)
    setIsManualZoom(true)
    setIsZooming(false)
  }, [])
  
  // Keyboard shortcuts for zoom
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!fileUrl || pdfError) return
      
      // Ctrl/Cmd + Plus for zoom in
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        handleZoomIn()
      }
      // Ctrl/Cmd + Minus for zoom out
      else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault()
        handleZoomOut()
      }
      // Ctrl/Cmd + 0 for reset zoom
      else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        handleZoomReset()
      }
    }
    
    // Add event listener to the container
    const container = containerRef.current
    if (container) {
      container.addEventListener('keydown', handleKeyDown)
      // Make container focusable
      container.tabIndex = -1
      
      return () => {
        container.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [fileUrl, pdfError, handleZoomIn, handleZoomOut, handleZoomReset])
  

  // Cleanup zoom timers
  useEffect(() => {
    return () => {
      if (zoomEndTimeoutRef.current) clearTimeout(zoomEndTimeoutRef.current)
    }
  }, [])

  // Handle text layer rendering completion with precise context highlighting
  const onRenderTextLayerSuccess = useCallback(() => {
    if (!containerRef.current || (!createFuzzyMatcher && !highlightRegex)) return
    
    // Apply highlighting to text spans in the text layer
    setTimeout(() => {
      const textLayers = containerRef.current.querySelectorAll('.react-pdf__Page__textContent')
      textLayers.forEach(textLayer => {
        const spans = textLayer.querySelectorAll('span:not([data-highlighted])')
        
        // Collect all text for context matching
        const allText = Array.from(spans).map(span => span.textContent || '').join(' ').replace(/\s+/g, ' ').toLowerCase()
        
        // Only proceed if the complete context exists in this text layer
        const contextExists = highlightTerms.some(term => allText.includes(term))
        if (!contextExists) return
        
        spans.forEach((span, index) => {
          let spanText = span.textContent
          if (!spanText) return
          
          let highlighted = false
          
          // Try fuzzy matching for multiline context
          if (createFuzzyMatcher && createFuzzyMatcher.test(spanText)) {
            const highlightedText = spanText.replace(createFuzzyMatcher, (match) => {
              return `<mark style="background-color: rgba(250, 204, 21, 0.6); color: transparent; padding: 0; border-radius: 2px;">${match}</mark>`
            })
            if (highlightedText !== spanText) {
              span.innerHTML = highlightedText
              highlighted = true
            }
          }
          
          // Fallback to exact matching
          if (!highlighted && highlightRegex && highlightRegex.test(spanText)) {
            span.innerHTML = spanText.replace(highlightRegex, (match) => {
              return `<mark style="background-color: rgba(250, 204, 21, 0.6); color: transparent; padding: 0; border-radius: 2px;">${match}</mark>`
            })
            highlighted = true
          }
          
          if (highlighted) {
            span.setAttribute('data-highlighted', 'true')
          }
        })
      })
    }, 100)
  }, [createFuzzyMatcher, highlightRegex, highlightTerms])

  // Coordinate-based highlight overlay component with improved positioning
  const CoordinateHighlightOverlay = ({ coords, scale, containerWidth, actualPageWidth }) => {
    if (!coords || coords.pageNumber !== page) return null
    
    const currentScale = scale || (containerWidth / actualPageWidth)
    const { boundingBoxes, viewport } = coords
    
    if (!boundingBoxes || boundingBoxes.length === 0) return null
    
    console.log('Rendering highlights with scale:', currentScale)
    console.log('Bounding boxes:', boundingBoxes)
    
    // Filter and validate boxes to ensure they're within reasonable bounds
    const validBoxes = boundingBoxes.filter(box => {
      const scaledX = box.x * currentScale
      const scaledY = box.y * currentScale
      const scaledWidth = box.width * currentScale
      const scaledHeight = box.height * currentScale
      
      // Check if box is within reasonable bounds
      return scaledX >= 0 && scaledY >= 0 && 
             scaledX < containerWidth * 2 && // Allow some overflow for zoom
             scaledY < viewport.height * currentScale * 2 &&
             scaledWidth > 0 && scaledHeight > 0
    })
    
    if (validBoxes.length === 0) {
      console.warn('No valid boxes to render')
      return null
    }
    
    // Merge overlapping boxes to avoid color stacking
    const mergedBoxes = []
    const threshold = 5 / currentScale // Adjust threshold based on scale
    
    validBoxes.forEach(box => {
      let merged = false
      for (let i = 0; i < mergedBoxes.length; i++) {
        const existingBox = mergedBoxes[i]
        // Check if boxes are close enough to merge (same line)
        if (Math.abs(box.y - existingBox.y) < threshold && 
            Math.abs(box.height - existingBox.height) < threshold) {
          // Extend the existing box to cover this one
          const minX = Math.min(existingBox.x, box.x)
          const maxX = Math.max(existingBox.x + existingBox.width, box.x + box.width)
          existingBox.x = minX
          existingBox.width = maxX - minX
          merged = true
          break
        }
      }
      if (!merged) {
        mergedBoxes.push({ ...box })
      }
    })
    
    console.log('Merged boxes:', mergedBoxes)
    
    return (
      <div style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
        {mergedBoxes.map((box, index) => {
          const left = Math.round(box.x * currentScale)
          const top = Math.round(box.y * currentScale)
          const width = Math.round(Math.max(box.width * currentScale, 8))
          const height = Math.round(Math.max(box.height * currentScale, 12))
          
          return (
            <div
              key={index}
              style={{
                position: 'absolute',
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
                backgroundColor: 'rgba(250, 204, 21, 0.25)', // More transparent for better text readability
                borderRadius: '2px',
                pointerEvents: 'none',
                zIndex: 10
              }}
              title={`Highlight ${index + 1}: "${box.text}"`}
            />
          )
        })}
      </div>
    )
  }

  return (
    <div className="pdf-viewer" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div className="pdf-header" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="text-truncate" title={filePath || ''} style={{ flex: 1 }}>
          {filePath ? filePath.split(/[\\\\/]/).pop() : 'PDF Viewer'}
        </div>
        
        {numPages && page && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{page} / {numPages}</span>
        )}
      </div>
      
      {/* Zoom Controls - Fixed position in bottom left of viewer */}
      {fileUrl && !pdfError && (
        <div style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'rgba(0, 0, 0, 0.8)',
          borderRadius: '4px',
          padding: '6px 8px',
          zIndex: 100,
          backdropFilter: 'blur(4px)'
        }}>
          <button
            onClick={handleZoomOut}
            style={{
              padding: '4px 8px',
              background: 'var(--vscode-button-bg)',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '24px',
              height: '24px'
            }}
            title="축소"
          >
            −
          </button>
          
          <span style={{ 
            fontSize: '11px', 
            color: 'white', 
            minWidth: '40px', 
            textAlign: 'center',
            fontWeight: '500'
          }}>
            {scale ? `${Math.round(scale * 100)}%` : `${Math.round(currentFitScale * 100)}%`}
          </span>
          
          <button
            onClick={handleZoomIn}
            style={{
              padding: '4px 8px',
              background: 'var(--vscode-button-bg)',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '24px',
              height: '24px'
            }}
            title="확대"
          >
            +
          </button>
          
          <button
            onClick={handleZoomReset}
            style={{
              padding: '4px 6px',
              background: 'var(--vscode-button-bg)',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              fontSize: '10px',
              cursor: 'pointer',
              marginLeft: '2px',
              height: '24px'
            }}
            title="화면에 맞춤"
          >
            Fit
          </button>
        </div>
      )}
      
      <div ref={containerRef} className={`pdf-content${isZooming ? ' zooming' : ''}`} style={{ 
        flex: 1, 
        overflow: 'auto',
        position: 'relative',
        width: '100%',
        height: '100%'
      }}>
        {fileUrl && !pdfError && !isLoading ? (
          <Document
            key={`${filePath}-${documentKey}`}
            file={fileUrl}
            onLoadSuccess={async (pdf) => {
              if (!mountedRef.current || !pdf) return
              
              // Store both loading task and document
              loadingTaskRef.current = pdf.loadingTask || pdf._pdfInfo?.loadingTask
              documentRef.current = pdf
              
              setNumPages(pdf.numPages || 0)
              setPdfError(null)
              
              // Get the first page to determine actual page dimensions
              try {
                const firstPage = await pdf.getPage(1)
                const viewport = firstPage.getViewport({ scale: 1 })
                setActualPageWidth(viewport.width)
                firstPage.cleanup()
              } catch (error) {
                console.warn('Could not get page dimensions:', error)
                // Fallback to default
                setActualPageWidth(600)
              }
              
              // Trigger page jump after document is loaded
              if (page && page !== 1) {
                setTimeout(() => {
                  const target = containerRef.current?.querySelector(`[data-page-number="${page}"]`)
                  if (target?.scrollIntoView) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }
                }, 500)
              }
              
              // Trigger text coordinate search after document is loaded
              if (snippet && page) {
                setTimeout(async () => {
                  try {
                    const coords = await findTextCoordinates(pdf, page, snippet)
                    setTextCoordinates(coords)
                    
                    // Scroll to highlight after finding coordinates
                    if (coords && coords.boundingBoxes && coords.boundingBoxes.length > 0) {
                      setTimeout(() => {
                        scrollToHighlight(coords)
                      }, 500) // Wait for pages and highlights to render
                    }
                  } catch (error) {
                    console.warn('Failed to find text coordinates on load:', error)
                  }
                }, 1000) // Wait longer for pages to render
              }
            }}
            onLoadError={(err) => {
              console.error('PDF load error:', err)
              if (!mountedRef.current) return
              
              cleanupDocument()
              setNumPages(null)
              
              const errorMsg = err?.message || 'PDF 로드 오류'
              // Don't auto-retry on these errors - let Error Boundary handle it
              setPdfError(errorMsg)
            }}
            onSourceError={(err) => {
              console.error('PDF source error:', err)
              if (!mountedRef.current) return
              
              cleanupDocument()
              setNumPages(null)
              setPdfError(err?.message || 'PDF 소스 오류')
            }}
            loading={
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '200px', 
                color: 'var(--text-muted)',
                fontSize: '13px'
              }}>
                PDF 로딩 중...
              </div>
            }
            error={
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '200px', 
                color: 'var(--text-muted)',
                fontSize: '13px',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div>PDF 로드 실패</div>
                <button 
                  style={{
                    padding: '4px 8px',
                    background: 'var(--vscode-button-bg)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setPdfError(null)
                    setDocumentKey(prev => prev + 1)
                  }}
                >
                  재시도
                </button>
              </div>
            }
            options={pdfOptions}
          >
            {numPages && numPages > 0 && documentRef.current ? (
              Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                <div key={`page-container-${documentKey}-${pageNum}`} style={{ 
                  marginBottom: '16px',
                  position: 'relative' // Enable positioning for overlay
                }}>
                  <Page
                    key={`${filePath}-${pageNum}`}
                    pageNumber={pageNum}
                    width={scale ? undefined : containerWidth}
                    scale={scale || undefined}
                    renderTextLayer={false} // Disable text layer to avoid conflicts with coordinate highlighting
                    renderAnnotationLayer={false}
                    onRenderSuccess={() => {
                      // Page rendered successfully
                    }}
                    onRenderError={(error) => {
                      console.warn(`Page ${pageNum} render error:`, error);
                      // Page-level errors are not critical - just log them
                    }}
                    onGetTextError={(error) => {
                      console.warn(`Page ${pageNum} text extraction error:`, error);
                      // Non-critical error, just log it
                    }}
                    loading={
                      <div style={{ 
                        width: scale ? `${scale * 600}px` : containerWidth, 
                        height: '200px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        backgroundColor: 'var(--vscode-panel-bg)',
                        color: 'var(--text-muted)',
                        fontSize: '12px',
                        border: '1px solid var(--border)'
                      }}>
                        페이지 {pageNum} 로딩 중...
                      </div>
                    }
                    error={
                      <div style={{ 
                        width: scale ? `${scale * 600}px` : containerWidth, 
                        height: '200px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        backgroundColor: 'var(--vscode-panel-bg)',
                        color: 'var(--text-muted)',
                        fontSize: '12px',
                        border: '1px solid var(--border)'
                      }}>
                        페이지 {pageNum} 로드 실패
                      </div>
                    }
                  />
                  {/* Add coordinate-based highlight overlay */}
                  {textCoordinates && textCoordinates.pageNumber === pageNum && (
                    <CoordinateHighlightOverlay
                      coords={textCoordinates}
                      scale={scale}
                      containerWidth={containerWidth}
                      actualPageWidth={actualPageWidth}
                    />
                  )}
                </div>
              ))
            ) : null}
          </Document>
        ) : (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%', 
            color: 'var(--text-muted)',
            fontSize: '13px',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {isLoading ? (
              <>
                <div>PDF 로딩 중...</div>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>잠시만 기다려주세요</div>
              </>
            ) : pdfError ? (
              <>
                <div>오류: {pdfError}</div>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>다른 PDF를 선택해보세요</div>
              </>
            ) : (
              <>
                <div>PDF를 선택하세요</div>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>검색 결과에서 "문서 보기"를 클릭하세요</div>
              </>
            )}
          </div>
        )}
        
      </div>
    </div>
  )
}

// Main App Component
export default function App() {
  // Add platform-specific class to body
  useEffect(() => {
    async function setPlatformClass() {
      if (window.api?.getPlatform) {
        try {
          const platform = await window.api.getPlatform()
          document.body.className = `platform-${platform}`
        } catch (error) {
          console.warn('Failed to get platform:', error)
        }
      }
    }
    setPlatformClass()
  }, [])

  // State Management
  const [workspace, setWorkspace] = useState(null)
  const [files, setFiles] = useState([])
  const [settings, setSettings] = useState({
    embeddingHost: '',
    embeddingModel: '',
    apiKey: '',
    chunkSize: 1200,
    chunkOverlap: 200,
    perDocN: 3,
    llmHost: '',
    llmModel: '',
    llmApiKey: '',
  })
  const [lastEmbedConfig, setLastEmbedConfig] = useState(null)

  const [processing, setProcessing] = useState(false)
  const [processed, setProcessed] = useState(false)
  const [progressData, setProgressData] = useState(null)
  
  // Multi-Doc State - automatically includes all documents
  const [multiDocState, setMultiDocState] = useState({
    query: '',
    results: [],
    status: null,
    exhaustiveSearchRunning: false,
    exhaustiveSearchProgress: null,
    exhaustiveSearchResults: { relevant: [], nonRelevant: [], uncertain: [] },
    showExhaustiveResults: false,
    exhaustiveActiveTab: 'relevant'
  })
  
  // Single-Doc State  
  const [singleDocState, setSingleDocState] = useState({
    selectedDocument: null,
    query: '',
    results: [],
    status: null,
    exhaustiveSearchRunning: false,
    exhaustiveSearchProgress: null,
    exhaustiveSearchResults: { relevant: [], nonRelevant: [], uncertain: [] },
    showExhaustiveResults: false,
    exhaustiveActiveTab: 'relevant'
  })
  
  // Shared State (common to both modes)
  const [activeDoc, setActiveDoc] = useState(null)
  const [activePage, setActivePage] = useState(null)
  const [activeSnippet, setActiveSnippet] = useState('')
  const [activeSnippetCoords, setActiveSnippetCoords] = useState(null)
  const [notes, setNotes] = useState({})
  const [showSettings, setShowSettings] = useState(false)
  const [showNotesCollection, setShowNotesCollection] = useState(false)
  const [showClearNotesConfirm, setShowClearNotesConfirm] = useState(false)
  
  // UI State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeView, setActiveView] = useState('files')
  const [documentMode, setDocumentMode] = useState('multi') // 'multi' or 'single'
  
  // Current mode state getters
  const currentState = documentMode === 'multi' ? multiDocState : singleDocState
  const setCurrentState = documentMode === 'multi' ? setMultiDocState : setSingleDocState
  
  // Convenience getters for current mode
  const selectedDocument = singleDocState.selectedDocument
  const query = currentState.query
  const results = currentState.results
  const status = currentState.status
  const exhaustiveSearchRunning = currentState.exhaustiveSearchRunning
  const exhaustiveSearchProgress = currentState.exhaustiveSearchProgress
  const exhaustiveSearchResults = currentState.exhaustiveSearchResults
  const showExhaustiveResults = currentState.showExhaustiveResults
  const exhaustiveActiveTab = currentState.exhaustiveActiveTab
  
  // Convenience setters for current mode - wrapped with useCallback to prevent stale closures
  const setQuery = useCallback((value) => {
    if (documentMode === 'multi') {
      setMultiDocState(prev => ({ ...prev, query: value }))
    } else {
      setSingleDocState(prev => ({ ...prev, query: value }))
    }
  }, [documentMode])

  const setResults = useCallback((value) => {
    if (documentMode === 'multi') {
      setMultiDocState(prev => ({ ...prev, results: value }))
    } else {
      setSingleDocState(prev => ({ ...prev, results: value }))
    }
  }, [documentMode])

  const setStatus = useCallback((value) => {
    if (documentMode === 'multi') {
      setMultiDocState(prev => ({ ...prev, status: value }))
    } else {
      setSingleDocState(prev => ({ ...prev, status: value }))
    }
  }, [documentMode])

  const setExhaustiveSearchRunning = useCallback((value) => {
    if (documentMode === 'multi') {
      setMultiDocState(prev => ({ ...prev, exhaustiveSearchRunning: value }))
    } else {
      setSingleDocState(prev => ({ ...prev, exhaustiveSearchRunning: value }))
    }
  }, [documentMode])

  const setExhaustiveSearchProgress = useCallback((value) => {
    if (documentMode === 'multi') {
      setMultiDocState(prev => ({ ...prev, exhaustiveSearchProgress: value }))
    } else {
      setSingleDocState(prev => ({ ...prev, exhaustiveSearchProgress: value }))
    }
  }, [documentMode])

  const setExhaustiveSearchResults = useCallback((valueOrCallback) => {
    if (documentMode === 'multi') {
      setMultiDocState(prev => ({ 
        ...prev, 
        exhaustiveSearchResults: typeof valueOrCallback === 'function' ? valueOrCallback(prev.exhaustiveSearchResults) : valueOrCallback
      }))
    } else {
      setSingleDocState(prev => ({ 
        ...prev, 
        exhaustiveSearchResults: typeof valueOrCallback === 'function' ? valueOrCallback(prev.exhaustiveSearchResults) : valueOrCallback
      }))
    }
  }, [documentMode])

  const setShowExhaustiveResults = useCallback((value) => {
    if (documentMode === 'multi') {
      setMultiDocState(prev => ({ ...prev, showExhaustiveResults: value }))
    } else {
      setSingleDocState(prev => ({ ...prev, showExhaustiveResults: value }))
    }
  }, [documentMode])

  const setExhaustiveActiveTab = useCallback((value) => {
    if (documentMode === 'multi') {
      setMultiDocState(prev => ({ ...prev, exhaustiveActiveTab: value }))
    } else {
      setSingleDocState(prev => ({ ...prev, exhaustiveActiveTab: value }))
    }
  }, [documentMode])
  
  // Single-doc specific setters  
  const setSelectedDocument = (value) => setSingleDocState(prev => ({ ...prev, selectedDocument: value }))

  // Event Handlers
  const selectWorkspace = async () => {
    setStatus('폴더 선택 중...')
    try {
      const result = await window.api.selectWorkspace()
      if (!result) {
        setStatus(null)
        return
      }
      setWorkspace(result.root)
      setFiles(result.files)
      setIncluded(new Set(result.files))
      await window.api.setIncludeFiles(result.files)
      setProcessed(false)
      setStatus(`워크스페이스 설정 완료 (${result.files.length}개 PDF)`)
    } catch (error) {
      setStatus(`오류: ${error.message}`)
    }
  }

  const saveSettings = async (newSettings) => {
    const hostChanged = settings.embeddingHost !== newSettings.embeddingHost || 
                       settings.embeddingModel !== newSettings.embeddingModel
    setSettings(newSettings)
    try {
      localStorage.setItem('litnav.settings', JSON.stringify(newSettings))
    } catch {}
    
    await window.api.setSettings({
      embeddingHost: newSettings.embeddingHost,
      embeddingModel: newSettings.embeddingModel,
      apiKey: newSettings.apiKey,
      chunkSize: newSettings.chunkSize,
      chunkOverlap: newSettings.chunkOverlap,
      llmHost: newSettings.llmHost,
      llmModel: newSettings.llmModel,
      llmApiKey: newSettings.llmApiKey,
    })
    
    if (hostChanged) {
      setProcessed(false)
      preprocess()
    }
  }


  const preprocess = async () => {
    try {
      setProcessing(true)
      setProcessed(false)
      setProgressData({ phase: 'extract', current: 0, total: files.length })
      setStatus('전처리 시작')
      
      const result = await window.api.preprocess()
      setProcessing(false)
      setProcessed(true)
      setProgressData(null)
      setStatus(`완료: 문서 ${result.docCount}개, 청크 ${result.chunkCount}개`)
    } catch (error) {
      setProcessing(false)
      setProgressData(null)
      setStatus(error?.message?.includes('취소') ? '전처리를 취소했습니다.' : `오류: ${error.message}`)
    }
  }

  const runSearch = async () => {
    try {
      if (!processed || processing) {
        setStatus('먼저 전처리를 완료하세요.')
        return
      }
      
      // Determine document filter based on mode
      let documentFilter = null
      if (documentMode === 'multi') {
        // Use all documents in multi-doc mode
        documentFilter = files
      } else if (documentMode === 'single' && singleDocState.selectedDocument) {
        documentFilter = [singleDocState.selectedDocument]
      } else if (documentMode === 'single' && !singleDocState.selectedDocument) {
        setStatus('Please select a document first.')
        return
      }
      
      setStatus('검색 중...')
      const searchResults = await window.api.search({ 
        query, 
        perDocN: settings.perDocN,
        documentFilter 
      })
      setResults(searchResults)
      setStatus(`검색 완료: ${searchResults.length}개 문서`)
    } catch (error) {
      setStatus(`오류: ${error.message}`)
    }
  }

  const handleExhaustiveSearch = async (searchQuery = query) => {
    if (!processed || processing) {
      setStatus('먼저 전처리를 완료하세요.')
      return
    }
    
    if (!settings.llmHost || !settings.llmModel) {
      setStatus('LLM 설정을 먼저 입력해주세요.')
      return
    }
    
    if (exhaustiveSearchRunning) {
      setStatus('이미 Exhaustive Search가 진행 중입니다.')
      return
    }
    
    if (!searchQuery) {
      setStatus('검색어를 입력해주세요.')
      return
    }
    
    // Determine document filter based on mode
    let documentFilter = null
    if (documentMode === 'multi') {
      // Use all documents in multi-doc mode
      documentFilter = files
    } else if (documentMode === 'single' && singleDocState.selectedDocument) {
      documentFilter = [singleDocState.selectedDocument]
    } else if (documentMode === 'single' && !singleDocState.selectedDocument) {
      setStatus('Please select a document first.')
      return
    }
    
    try {
      setExhaustiveSearchRunning(true)
      setExhaustiveSearchResults({ relevant: [], nonRelevant: [], uncertain: [] })
      setShowExhaustiveResults(true)
      setStatus('Exhaustive search started...')
      
      console.log('🔥 Starting exhaustive search with mode:', documentMode)
      await window.api.exhaustiveSearch({ 
        query: searchQuery,
        documentFilter,
        mode: documentMode 
      })
    } catch (error) {
      setExhaustiveSearchRunning(false)
      setStatus(`오류: ${error.message}`)
    }
  }
  
  const cancelExhaustiveSearch = async () => {
    try {
      await window.api.cancelExhaustiveSearch({ mode: documentMode })
      setExhaustiveSearchRunning(false)
      setStatus('Exhaustive search cancelled')
    } catch (error) {
      console.error('Failed to cancel exhaustive search:', error)
    }
  }
  
  // Helper functions to check if search is enabled
  const canSearch = () => {
    if (!processed || processing || !query.trim()) return false
    
    if (documentMode === 'multi') {
      // Multi-doc mode always uses all files, so just check if we have files
      return files.length > 0
    } else if (documentMode === 'single') {
      return singleDocState.selectedDocument !== null
    }
    return false
  }
  
  const canExhaustiveSearch = () => {
    return canSearch() && settings.llmHost && settings.llmModel && !currentState.exhaustiveSearchRunning
  }
  
  const classifyExhaustiveResult = (resultId, newClassification) => {
    setExhaustiveSearchResults(prev => {
      const allResults = [...(prev.relevant || []), ...(prev.nonRelevant || []), ...(prev.uncertain || [])]
      const result = allResults.find(r => `${r.docId}::${r.chunkId}` === resultId)
      
      if (!result) return prev
      
      const newResults = {
        relevant: (prev.relevant || []).filter(r => `${r.docId}::${r.chunkId}` !== resultId),
        nonRelevant: (prev.nonRelevant || []).filter(r => `${r.docId}::${r.chunkId}` !== resultId),
        uncertain: (prev.uncertain || []).filter(r => `${r.docId}::${r.chunkId}` !== resultId)
      }
      
      result.classification = newClassification
      
      if (newClassification === 1) {
        newResults.relevant.push(result)
      } else if (newClassification === 2) {
        newResults.nonRelevant.push(result)
      }
      
      return newResults
    })
  }
  
  const openContext = (docPath, page, snippet) => {
    setActiveDoc(docPath)
    setActivePage(page)
    setActiveSnippet(snippet)
  }

  const exitWorkspace = async () => {
    await window.api.resetWorkspace()
    setWorkspace(null)
    setFiles([])
    setIncluded(new Set())
    setResults([])
    setProcessed(false)
    setProcessing(false)
    setActiveDoc(null)
    setActivePage(null)
    setActiveSnippet('')
    setLastEmbedConfig(null)
    setStatus(null)
  }

  const handleViewChange = (view) => {
    if (activeView === view && !sidebarCollapsed) {
      setSidebarCollapsed(true)
    } else {
      setActiveView(view)
      setSidebarCollapsed(false)
    }
  }

  // Load settings on mount and initialize backend
  useEffect(() => {
    async function initializeSettings() {
      try {
        const savedSettings = localStorage.getItem('litnav.settings')
        if (savedSettings) {
          const parsed = JSON.parse(savedSettings)
          const newSettings = { ...settings, ...parsed }
          setSettings(newSettings)
          
          // Initialize backend with saved settings
          if (parsed.embeddingHost && parsed.embeddingModel) {
            await window.api.setSettings({
              embeddingHost: newSettings.embeddingHost,
              embeddingModel: newSettings.embeddingModel,
              apiKey: newSettings.apiKey,
              chunkSize: newSettings.chunkSize,
              chunkOverlap: newSettings.chunkOverlap,
              llmHost: newSettings.llmHost,
              llmModel: newSettings.llmModel,
              llmApiKey: newSettings.llmApiKey,
            })
            setLastEmbedConfig({ 
              embeddingHost: newSettings.embeddingHost, 
              embeddingModel: newSettings.embeddingModel 
            })
            // Check if workspace exists to determine if we should show as processed
            if (workspace && files.length > 0) {
              try {
                // Try to check if embeddings exist for current settings
                const testResult = await window.api.search({ query: 'test', perDocN: 1 })
                setProcessed(true)
              } catch {
                setProcessed(false)
              }
            }
          }
        }
      } catch (error) {
        console.warn('Failed to initialize settings:', error)
      }
    }
    
    if (workspace) {
      initializeSettings()
    }
  }, [workspace])

  // Set up event listeners
  useEffect(() => {
    const cleanup = [
      window.api.onPreprocessProgress(setProgressData),
      window.api.onPreprocessComplete(() => {
        setProcessing(false)
        setProcessed(true)
        setProgressData(null)
        setLastEmbedConfig({ 
          embeddingHost: settings.embeddingHost, 
          embeddingModel: settings.embeddingModel 
        })
      }),
      window.api.onPreprocessCancelled(() => {
        setProcessing(false)
        setProcessed(false)
        setProgressData(null)
      }),
      window.api.onPreprocessError((error) => {
        setProcessing(false)
        setProcessed(false)
        setProgressData(null)
        setStatus(`오류: ${error?.message || '전처리 실패'}`)
      }),
      window.api.onExhaustiveSearchStart((data) => {
        console.log('🚀 Search Start:', { dataMode: data.mode, currentMode: documentMode, match: data.mode === documentMode })
        if (data.mode === documentMode) {
          setExhaustiveSearchProgress({ current: 0, total: data.total })
        }
      }),
      window.api.onExhaustiveSearchProgress((data) => {
        console.log('⚡ Progress received:', { dataMode: data.mode, currentMode: documentMode, match: data.mode === documentMode, result: data.result })
        if (data.mode === documentMode) {
          setExhaustiveSearchProgress({ 
            current: data.current, 
            total: data.total,
            docPath: data.docPath 
          })
          
          // Classify and add result
          const result = data.result
          console.log('✅ Adding result:', result)
          console.log('🔥 About to call setExhaustiveSearchResults, current mode:', documentMode)
          console.log('🔥 setExhaustiveSearchResults function:', typeof setExhaustiveSearchResults, setExhaustiveSearchResults)
          
          setExhaustiveSearchResults(prev => {
            console.log('🔥 Inside setExhaustiveSearchResults callback, prev:', prev)
            const newResults = { ...prev }
            if (result.classification === 1) {
              newResults.relevant = [...(prev.relevant || []), result]
            } else if (result.classification === 2) {
              newResults.nonRelevant = [...(prev.nonRelevant || []), result]
            } else {
              newResults.uncertain = [...(prev.uncertain || []), result]
            }
            console.log('📊 New results state:', newResults)
            return newResults
          })
        } else {
          console.log('❌ Mode mismatch - skipping result')
        }
      }),
      window.api.onExhaustiveSearchComplete((data) => {
        console.log('🏁 Search Complete:', { dataMode: data.mode, currentMode: documentMode, match: data.mode === documentMode })
        if (data.mode === documentMode) {
          setExhaustiveSearchRunning(false)
          setExhaustiveSearchProgress(null)
          setShowExhaustiveResults(true)
          setStatus('Exhaustive search completed')
        }
      }),
      window.api.onExhaustiveSearchCancelled((data) => {
        if (data.mode === documentMode) {
          setExhaustiveSearchRunning(false)
          setExhaustiveSearchProgress(null)
          setStatus('Exhaustive search cancelled')
        }
      }),
      window.api.onExhaustiveSearchError((data) => {
        if (data.mode === documentMode) {
          setExhaustiveSearchRunning(false)
          setExhaustiveSearchProgress(null)
          setStatus(`Error: ${data?.message || 'Exhaustive search failed'}`)
        }
      })
    ]
    
    return () => cleanup.forEach(fn => fn())
  }, [settings.embeddingHost, settings.embeddingModel, documentMode, 
      setExhaustiveSearchResults, setExhaustiveSearchRunning, setExhaustiveSearchProgress, 
      setStatus, setShowExhaustiveResults])

  // Render
  if (!workspace) {
    return <WelcomeScreen onSelectWorkspace={selectWorkspace} />
  }

  return (
    <div className="app-container">
      <TitleBar />
      
      <div className="app-content">
        <ActivityBar
          activeView={activeView}
          onViewChange={handleViewChange}
          processing={processing}
          onSettings={() => setShowSettings(true)}
          onExit={exitWorkspace}
        />

      <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <SidebarContent
          view={activeView}
          workspace={workspace}
          files={files}
          activeDoc={activeDoc}
          notes={notes}
          onUpdateNotes={setNotes}
          onShowNotesCollection={() => setShowNotesCollection(true)}
          onClearAllNotes={() => setShowClearNotesConfirm(true)}
          documentMode={documentMode}
          onDocumentModeChange={(newMode) => {
            // Simply switch modes - each mode maintains its own independent state
            setDocumentMode(newMode)
          }}
          selectedDocument={selectedDocument}
          onDocumentSelect={(docPath) => {
            setSelectedDocument(docPath)
            // Open the document when selected in single mode
            if (documentMode === 'single') {
              setActiveDoc(docPath)
            }
          }}
        />
      </div>

      <div className="main-editor">
        <div className="editor-area">
          <div className="editor-main">
            <div className="search-container">
              <input
                className="search-input"
                placeholder="질문을 입력하세요 (예: BERT의 사전학습 목표는?)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && canSearch() && runSearch()}
                disabled={!processed || processing}
              />
              <button 
                className="search-button" 
                onClick={runSearch}
                disabled={!canSearch()}
              >
                Search
              </button>
              
              {processed && !exhaustiveSearchRunning && settings.llmHost && settings.llmModel && (
                <button 
                  className="search-button" 
                  onClick={() => handleExhaustiveSearch(query)}
                  disabled={!canExhaustiveSearch()}
                  style={{ marginLeft: '8px' }}
                >
                  Exhaustive Search
                </button>
              )}
              
              {exhaustiveSearchRunning && (
                <button 
                  className="search-button" 
                  onClick={cancelExhaustiveSearch}
                  style={{ marginLeft: '8px' }}
                >
                  Cancel Search
                </button>
              )}
              
              {!processed && !processing && (
                <button className="search-button" onClick={preprocess} style={{ marginLeft: '8px' }}>
                  Generate Embeddings
                </button>
              )}
              {processing && (
                <button className="search-button" onClick={() => window.api.cancelPreprocess()} style={{ marginLeft: '8px' }}>
                  Cancel
                </button>
              )}

              {status && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>{status}</div>
              )}
              
              {exhaustiveSearchProgress && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Exhaustive Search: {exhaustiveSearchProgress.current}/{exhaustiveSearchProgress.total} sections
                  {exhaustiveSearchProgress.docPath && (
                    <span> - {exhaustiveSearchProgress.docPath.split(/[\\/]/).pop()}</span>
                  )}
                </div>
              )}

              {processing && progressData && (
                <div className="progress-container">
                  <div className="progress-text">
                    {progressData.phase === 'extract' && '텍스트 추출 중'}
                    {progressData.phase === 'embed' && '임베딩 생성 중'}
                    {progressData.phase === 'index' && '인덱싱 중'}
                  </div>
                  {progressData.total && (
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${Math.floor((progressData.current / progressData.total) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Results Tabs */}
            {(results.length > 0 || Object.values(exhaustiveSearchResults).some(arr => arr && arr.length > 0) || showExhaustiveResults) && (
              <div className="results-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '8px' }}>
                <button 
                  className={`tab-button ${!showExhaustiveResults ? 'active' : ''}`}
                  onClick={() => setShowExhaustiveResults(false)}
                  style={{
                    padding: '8px 16px',
                    background: !showExhaustiveResults ? 'var(--background-secondary)' : 'transparent',
                    border: 'none',
                    borderBottom: !showExhaustiveResults ? '2px solid var(--accent-color)' : 'none',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Embedding Search
                </button>
                <button 
                  className={`tab-button ${showExhaustiveResults ? 'active' : ''}`}
                  onClick={() => setShowExhaustiveResults(true)}
                  style={{
                    padding: '8px 16px',
                    background: showExhaustiveResults ? 'var(--background-secondary)' : 'transparent',
                    border: 'none',
                    borderBottom: showExhaustiveResults ? '2px solid var(--accent-color)' : 'none',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Exhaustive Search ({(currentState.exhaustiveSearchResults.relevant?.length || 0) + (currentState.exhaustiveSearchResults.nonRelevant?.length || 0) + (currentState.exhaustiveSearchResults.uncertain?.length || 0)})
                </button>
              </div>
            )}
            
            {/* Embedding Search Results */}
            <div className="results-container" style={{ display: !showExhaustiveResults ? 'block' : 'none' }}>
              {results.length === 0 ? (
                <div style={{ 
                  textAlign: 'center', 
                  color: 'var(--text-muted)', 
                  padding: '32px',
                  fontSize: '13px'
                }}>
                  검색 결과가 여기에 표시됩니다
                </div>
              ) : (
                results.map((result) => (
                  <div key={result.docId} className="result-item">
                    <div className="result-header text-truncate" title={result.path}>
                      {result.path.split(/[\\\\/]/).pop()}
                    </div>
                    {result.hits && Array.isArray(result.hits) && result.hits.map((hit) => (
                      <div key={hit.id} className="result-hit">
                        <div className="result-meta">
                          페이지 {hit.page} • 점수: {hit.score.toFixed(3)}
                        </div>
                        <div 
                          className="result-text"
                          style={{ cursor: 'pointer' }}
                          onClick={() => openContext(result.path, hit.page, hit.text)}
                          title={hit.text}
                        >
                          {hit.text.length > 150 ? hit.text.substring(0, 150) + '...' : hit.text}
                        </div>
                        <button 
                          className="result-button"
                          onClick={() => openContext(result.path, hit.page, hit.text)}
                        >
                          문서 보기
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
            
            {/* Exhaustive Search Results */}
            <div className="results-container" style={{ display: showExhaustiveResults ? 'block' : 'none' }}>
              {(() => {
                // Direct access to avoid function reference issues
                let actualResults
                if (documentMode === 'multi') {
                  actualResults = multiDocState.exhaustiveSearchResults || { relevant: [], nonRelevant: [], uncertain: [] }
                } else {
                  actualResults = singleDocState.exhaustiveSearchResults || { relevant: [], nonRelevant: [], uncertain: [] }
                }
                const resultArrays = Object.values(actualResults)
                const hasNoResults = resultArrays.every(arr => !Array.isArray(arr) || arr.length === 0)

                console.log('🔍 UI State Check Comprehensive:', {
                  documentMode,
                  multiState: {
                    running: multiDocState.exhaustiveSearchRunning,
                    progress: multiDocState.exhaustiveSearchProgress,
                    resultCounts: {
                      relevant: multiDocState.exhaustiveSearchResults?.relevant?.length || 0,
                      nonRelevant: multiDocState.exhaustiveSearchResults?.nonRelevant?.length || 0,
                      uncertain: multiDocState.exhaustiveSearchResults?.uncertain?.length || 0
                    }
                  },
                  singleState: {
                    running: singleDocState.exhaustiveSearchRunning,
                    progress: singleDocState.exhaustiveSearchProgress,
                    resultCounts: {
                      relevant: singleDocState.exhaustiveSearchResults?.relevant?.length || 0,
                      nonRelevant: singleDocState.exhaustiveSearchResults?.nonRelevant?.length || 0,
                      uncertain: singleDocState.exhaustiveSearchResults?.uncertain?.length || 0
                    }
                  },
                  currentStateActive: documentMode,
                  actualResults, 
                  resultArrays,
                  hasNoResults,
                  exhaustiveSearchRunning
                })
                
                return hasNoResults
              })() ? (
                <div style={{ 
                  textAlign: 'center', 
                  color: 'var(--text-muted)', 
                  padding: '32px',
                  fontSize: '13px'
                }}>
                  {exhaustiveSearchRunning ? 'Searching...' : 'No exhaustive search results yet'}
                </div>
              ) : (
                <div className="exhaustive-results">
                  {/* Category Tabs */}
                  <div className="exhaustive-tabs" style={{ 
                    display: 'flex', 
                    borderBottom: '1px solid var(--border)', 
                    marginBottom: '12px',
                    background: 'var(--background-secondary)'
                  }}>
                    <button 
                      onClick={() => setExhaustiveActiveTab('relevant')}
                      style={{
                        padding: '8px 16px',
                        background: exhaustiveActiveTab === 'relevant' ? 'var(--success-bg)' : 'transparent',
                        color: exhaustiveActiveTab === 'relevant' ? 'var(--success-color)' : 'var(--text-secondary)',
                        border: 'none',
                        borderBottom: exhaustiveActiveTab === 'relevant' ? '2px solid var(--success-color)' : 'none',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: exhaustiveActiveTab === 'relevant' ? 'bold' : 'normal'
                      }}
                    >
                      Relevant ({documentMode === 'multi' ? (multiDocState.exhaustiveSearchResults.relevant?.length || 0) : (singleDocState.exhaustiveSearchResults.relevant?.length || 0)})
                    </button>
                    <button 
                      onClick={() => setExhaustiveActiveTab('nonRelevant')}
                      style={{
                        padding: '8px 16px',
                        background: exhaustiveActiveTab === 'nonRelevant' ? 'var(--error-bg)' : 'transparent',
                        color: exhaustiveActiveTab === 'nonRelevant' ? 'var(--error-color)' : 'var(--text-secondary)',
                        border: 'none',
                        borderBottom: exhaustiveActiveTab === 'nonRelevant' ? '2px solid var(--error-color)' : 'none',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: exhaustiveActiveTab === 'nonRelevant' ? 'bold' : 'normal'
                      }}
                    >
                      Non-relevant ({documentMode === 'multi' ? (multiDocState.exhaustiveSearchResults.nonRelevant?.length || 0) : (singleDocState.exhaustiveSearchResults.nonRelevant?.length || 0)})
                    </button>
                    <button 
                      onClick={() => setExhaustiveActiveTab('uncertain')}
                      style={{
                        padding: '8px 16px',
                        background: exhaustiveActiveTab === 'uncertain' ? 'var(--warning-bg)' : 'transparent',
                        color: exhaustiveActiveTab === 'uncertain' ? 'var(--warning-color)' : 'var(--text-secondary)',
                        border: 'none',
                        borderBottom: exhaustiveActiveTab === 'uncertain' ? '2px solid var(--warning-color)' : 'none',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: exhaustiveActiveTab === 'uncertain' ? 'bold' : 'normal'
                      }}
                    >
                      Uncertain ({documentMode === 'multi' ? (multiDocState.exhaustiveSearchResults.uncertain?.length || 0) : (singleDocState.exhaustiveSearchResults.uncertain?.length || 0)})
                    </button>
                  </div>
                  
                  {/* Tab Content */}
                  <div className="exhaustive-tab-content">
                    {(() => {
                      let actualResults
                      if (documentMode === 'multi') {
                        actualResults = multiDocState.exhaustiveSearchResults
                      } else {
                        actualResults = singleDocState.exhaustiveSearchResults
                      }
                      const currentResults = actualResults[exhaustiveActiveTab] || []
                      
                      if (currentResults.length === 0) {
                        return (
                          <div style={{ 
                            textAlign: 'center', 
                            color: 'var(--text-muted)', 
                            padding: '32px',
                            fontSize: '13px'
                          }}>
                            No {exhaustiveActiveTab} results
                          </div>
                        )
                      }
                      
                      // Group results by document
                      const groupedResults = currentResults.reduce((acc, result) => {
                        if (!acc[result.docId]) {
                          acc[result.docId] = {
                            path: result.path,
                            hits: []
                          }
                        }
                        acc[result.docId].hits.push(result)
                        return acc
                      }, {})
                      
                      return Object.entries(groupedResults).map(([docId, doc]) => (
                        <div key={docId} className="result-item">
                          <div className="result-header text-truncate" title={doc.path}>
                            {doc.path.split(/[\\\\/]/).pop()}
                          </div>
                          {doc.hits.map((hit) => (
                            <div key={`${hit.docId}::${hit.chunkId}`} className="result-hit">
                              <div className="result-meta">
                                페이지 {hit.page} {hit.reason && exhaustiveActiveTab === 'uncertain' && `• ${hit.reason}`}
                              </div>
                              <div 
                                className="result-text"
                                style={{ cursor: 'pointer' }}
                                onClick={() => openContext(hit.path, hit.page, hit.text)}
                                title={hit.text}
                              >
                                {hit.text.length > 150 ? hit.text.substring(0, 150) + '...' : hit.text}
                              </div>
                              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                <button 
                                  className="result-button"
                                  onClick={() => openContext(hit.path, hit.page, hit.text)}
                                >
                                  문서 보기
                                </button>
                                {exhaustiveActiveTab === 'uncertain' && (
                                  <>
                                    <button 
                                      className="result-button"
                                      onClick={() => classifyExhaustiveResult(`${hit.docId}::${hit.chunkId}`, 1)}
                                      style={{ background: 'var(--success-bg)', color: 'var(--success-color)' }}
                                    >
                                      Relevant
                                    </button>
                                    <button 
                                      className="result-button"
                                      onClick={() => classifyExhaustiveResult(`${hit.docId}::${hit.chunkId}`, 2)}
                                      style={{ background: 'var(--error-bg)', color: 'var(--error-color)' }}
                                    >
                                      Non-relevant
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          <ResizableSplitter />

          <div className="editor-sidebar">
            <PDFErrorBoundary filePath={activeDoc}>
              <PDFViewer
                filePath={activeDoc}
                page={activePage}
                snippet={activeSnippet}
                query={query}
              />
            </PDFErrorBoundary>
          </div>
        </div>
        
        <div className="status-bar">
          <div className="status-item">
            {workspace && `워크스페이스: ${workspace.split(/[\\\\/]/).pop()}`}
          </div>
          <div className="status-item">
            {files.length > 0 && `${files.length}개 PDF`}
          </div>
          <div className="status-item">
            {processed ? '임베딩 완료' : processing ? '처리 중...' : '임베딩 대기'}
          </div>
        </div>
      </div>
      
      </div> {/* app-content */}

      <SettingsModal
        isOpen={showSettings}
        settings={settings}
        onSave={saveSettings}
        onClose={() => setShowSettings(false)}
      />

      <NotesCollectionModal
        isOpen={showNotesCollection}
        notes={notes}
        files={files}
        onClose={() => setShowNotesCollection(false)}
        onClearAllNotes={() => setNotes({})}
      />

      <ConfirmationModal
        isOpen={showClearNotesConfirm}
        title="노트 초기화"
        message="모든 노트가 삭제됩니다. 이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?"
        confirmText="초기화"
        cancelText="취소"
        isDanger={true}
        onConfirm={() => {
          setNotes({})
          setShowClearNotesConfirm(false)
        }}
        onCancel={() => setShowClearNotesConfirm(false)}
      />
    </div>
  )
}
