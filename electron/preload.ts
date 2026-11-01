import { contextBridge, ipcRenderer } from 'electron'
import type { ProgressEvent, ScanReport, SystemInfo, WebRtcResult } from '../src/core/types.ts'
import type { UnlockResult, UnlockService } from '../src/core/probes/unlock.ts'

export interface HistoryEntry {
  id: string
  at: string
  score: number
  gradeLabel: string
  gradeTone: string
  ip?: string
  country?: string
  asn?: string
  durationMs: number
  report: ScanReport
}

export interface ExportResult {
  ok: boolean
  path?: string
  canceled?: boolean
  error?: string
}

export interface VersionInfo {
  app: string
  electron: string
  chrome: string
  node: string
  platform: string
}

export interface NetPurityApi {
  runScan: (webrtc?: WebRtcResult) => Promise<ScanReport & { error?: string }>
  onProgress: (cb: (p: ProgressEvent) => void) => () => void
  getSystem: () => Promise<SystemInfo>
  openExternal: (url: string) => Promise<void>
  version: () => Promise<string>
  versions: () => Promise<VersionInfo>
  listHistory: () => Promise<HistoryEntry[]>
  addHistory: (report: ScanReport) => Promise<HistoryEntry[]>
  clearHistory: () => Promise<HistoryEntry[]>
  exportJson: (report: ScanReport) => Promise<ExportResult>
  exportPdf: () => Promise<ExportResult>
  copyText: (text: string) => Promise<boolean>
  unlockServices: () => Promise<UnlockService[]>
  unlockTest: (id: string) => Promise<UnlockResult>
  unlockTestAll: () => Promise<UnlockResult[]>
  onUnlockProgress: (cb: (r: UnlockResult) => void) => () => void
}

const api: NetPurityApi = {
  runScan: (webrtc) => ipcRenderer.invoke('scan:run', { webrtc }),
  onProgress: (cb) => {
    const listener = (_e: unknown, p: ProgressEvent) => cb(p)
    ipcRenderer.on('scan:progress', listener as never)
    return () => ipcRenderer.removeListener('scan:progress', listener as never)
  },
  getSystem: () => ipcRenderer.invoke('system:info'),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  version: () => ipcRenderer.invoke('app:version'),
  versions: () => ipcRenderer.invoke('app:versions'),
  listHistory: () => ipcRenderer.invoke('history:list'),
  addHistory: (report) => ipcRenderer.invoke('history:add', report),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  exportJson: (report) => ipcRenderer.invoke('export:json', report),
  exportPdf: () => ipcRenderer.invoke('export:pdf'),
  copyText: (text) => ipcRenderer.invoke('clipboard:copy', text),
  unlockServices: () => ipcRenderer.invoke('unlock:services'),
  unlockTest: (id) => ipcRenderer.invoke('unlock:test', id),
  unlockTestAll: () => ipcRenderer.invoke('unlock:test-all'),
  onUnlockProgress: (cb) => {
    const listener = (_e: unknown, r: UnlockResult) => cb(r)
    ipcRenderer.on('unlock:progress', listener as never)
    return () => ipcRenderer.removeListener('unlock:progress', listener as never)
  }
}

contextBridge.exposeInMainWorld('netpurity', api)
