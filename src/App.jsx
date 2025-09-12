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
  included, 
  onToggleFile, 
  onSelectAll, 
  onClearAll,
  activeDoc,
  notes,
  onUpdateNotes
}) {
  if (view === 'files') {
    return (
      <div className="sidebar-content">
        <div className="file-tree">
          <div className="file-tree-header">
            <span>PDF FILES ({files.length})</span>
            <div className="flex gap-2">
              <button className="btn btn-secondary" style={{ fontSize: '10px', padding: '2px 6px' }} onClick={onSelectAll}>
                All
              </button>
              <button className="btn btn-secondary" style={{ fontSize: '10px', padding: '2px 6px' }} onClick={onClearAll}>
                None
              </button>
            </div>
          </div>
          {files.map((file) => (
            <div key={file} className="file-item">
              <input
                type="checkbox"
                checked={included.has(file)}
                onChange={() => onToggleFile(file)}
              />
              <div 
                className="file-name" 
                title={file}
                style={{ cursor: 'pointer' }}
                onClick={() => onToggleFile(file)}
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
    
    return (
      <div className="sidebar-content">
        <div className="notes-section" style={{ height: '100%', borderTop: 'none' }}>
          <div className="notes-header">
            NOTES
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

  // Handle page jumping with proper timing
  useEffect(() => {
    if (!containerRef.current || !page || !numPages) return
    
    const scrollToPage = () => {
      const target = containerRef.current.querySelector(`[data-page-number="${page}"]`)
      if (target?.scrollIntoView) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return true
      }
      return false
    }
    
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
  }, [page, numPages])
  
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
                  marginBottom: '16px'
                }}>
                  <Page
                    key={`${filePath}-${pageNum}`}
                    pageNumber={pageNum}
                    width={scale ? undefined : containerWidth}
                    scale={scale || undefined}
                    renderTextLayer={true}
                    renderAnnotationLayer={false}
                    customTextRenderer={(createFuzzyMatcher || highlightRegex) ? customTextRenderer : undefined}
                    onRenderTextLayerSuccess={onRenderTextLayerSuccess}
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
  // State Management
  const [workspace, setWorkspace] = useState(null)
  const [files, setFiles] = useState([])
  const [included, setIncluded] = useState(new Set())
  const [settings, setSettings] = useState({
    embeddingHost: '',
    embeddingModel: '',
    apiKey: '',
    chunkSize: 1200,
    chunkOverlap: 200,
    perDocN: 3,
  })
  const [lastEmbedConfig, setLastEmbedConfig] = useState(null)

  const [status, setStatus] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [processed, setProcessed] = useState(false)
  const [progressData, setProgressData] = useState(null)
  
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  
  const [activeDoc, setActiveDoc] = useState(null)
  const [activePage, setActivePage] = useState(null)
  const [activeSnippet, setActiveSnippet] = useState('')
  
  const [notes, setNotes] = useState({})
  const [showSettings, setShowSettings] = useState(false)
  
  // UI State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeView, setActiveView] = useState('files')

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
    })
    
    if (hostChanged) {
      setProcessed(false)
      preprocess()
    }
  }

  const toggleFileIncluded = async (file) => {
    const newIncluded = new Set(included)
    if (newIncluded.has(file)) {
      newIncluded.delete(file)
    } else {
      newIncluded.add(file)
    }
    setIncluded(newIncluded)
    await window.api.setIncludeFiles(Array.from(newIncluded))
    setProcessed(false)
  }

  const selectAllFiles = async () => {
    const newIncluded = new Set(files)
    setIncluded(newIncluded)
    await window.api.setIncludeFiles(files)
    setProcessed(false)
  }

  const clearAllFiles = async () => {
    setIncluded(new Set())
    await window.api.setIncludeFiles([])
    setProcessed(false)
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
      setStatus('검색 중...')
      const searchResults = await window.api.search({ query, perDocN: settings.perDocN })
      setResults(searchResults)
      setStatus(`검색 완료: ${searchResults.length}개 문서`)
    } catch (error) {
      setStatus(`오류: ${error.message}`)
    }
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
      })
    ]
    
    return () => cleanup.forEach(fn => fn())
  }, [settings.embeddingHost, settings.embeddingModel])

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
          included={included}
          onToggleFile={toggleFileIncluded}
          onSelectAll={selectAllFiles}
          onClearAll={clearAllFiles}
          activeDoc={activeDoc}
          notes={notes}
          onUpdateNotes={setNotes}
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
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                disabled={!processed || processing}
              />
              <button 
                className="search-button" 
                onClick={runSearch}
                disabled={!processed || processing}
              >
                검색
              </button>
              
              {!processed && !processing && (
                <button className="search-button" onClick={preprocess} style={{ marginLeft: '8px' }}>
                  임베딩 생성
                </button>
              )}
              {processing && (
                <button className="search-button" onClick={() => window.api.cancelPreprocess()} style={{ marginLeft: '8px' }}>
                  취소
                </button>
              )}

              {status && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>{status}</div>
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

            <div className="results-container">
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
                    {result.hits.map((hit) => (
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
    </div>
  )
}
