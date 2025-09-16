const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  selectWorkspace: () => ipcRenderer.invoke('select-workspace'),
  setSettings: (settings) => ipcRenderer.invoke('set-settings', settings),
  setIncludeFiles: (files) => ipcRenderer.invoke('set-include-files', files),
  resetWorkspace: () => ipcRenderer.invoke('reset-workspace'),
  preprocess: () => ipcRenderer.invoke('preprocess'),
  cancelPreprocess: () => ipcRenderer.invoke('preprocess-cancel'),
  search: (args) => ipcRenderer.invoke('search', args),
  exhaustiveSearch: (args) => ipcRenderer.invoke('exhaustive-search', args),
  cancelExhaustiveSearch: (args) => ipcRenderer.invoke('exhaustive-search-cancel', args),
  resolveFileUrl: (filePath) => ipcRenderer.invoke('resolve-file-url', filePath),
  loadPdfData: (filePath) => ipcRenderer.invoke('load-pdf-data', filePath),
  onPreprocessProgress: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('preprocess-progress', listener)
    return () => ipcRenderer.off('preprocess-progress', listener)
  },
  onPreprocessComplete: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('preprocess-complete', listener)
    return () => ipcRenderer.off('preprocess-complete', listener)
  },
  onPreprocessCancelled: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('preprocess-cancelled', listener)
    return () => ipcRenderer.off('preprocess-cancelled', listener)
  },
  onPreprocessError: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('preprocess-error', listener)
    return () => ipcRenderer.off('preprocess-error', listener)
  },
  onExhaustiveSearchStart: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('exhaustive-search-start', listener)
    return () => ipcRenderer.off('exhaustive-search-start', listener)
  },
  onExhaustiveSearchProgress: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('exhaustive-search-progress', listener)
    return () => ipcRenderer.off('exhaustive-search-progress', listener)
  },
  onExhaustiveSearchComplete: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('exhaustive-search-complete', listener)
    return () => ipcRenderer.off('exhaustive-search-complete', listener)
  },
  onExhaustiveSearchCancelled: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('exhaustive-search-cancelled', listener)
    return () => ipcRenderer.off('exhaustive-search-cancelled', listener)
  },
  onExhaustiveSearchError: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('exhaustive-search-error', listener)
    return () => ipcRenderer.off('exhaustive-search-error', listener)
  },
})
