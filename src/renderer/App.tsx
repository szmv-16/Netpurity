import { useCallback, useEffect, useState } from 'react'
import type { ProgressEvent, ScanReport, Status } from '../core/types.ts'
import type { UnlockResult, UnlockService } from '../core/probes/unlock.ts'
import type { HistoryEntry, VersionInfo } from '../../electron/preload.ts'
import { probeWebRtc } from './webrtc.ts'
import { createDemoApi } from './demo.ts'
import { applyTheme, loadTheme, type ThemeMode } from './theme.ts'
import { ScoreRing } from './components/ScoreRing.tsx'
import { SummaryRow } from './components/SummaryRow.tsx'
import { SettingsModal } from './components/SettingsModal.tsx'
import { DetailModal } from './components/DetailModal.tsx'
import { UnlockPage } from './components/UnlockPage.tsx'

type Phase = 'running' | 'done' | 'error'
type View = 'overview' | 'unlock'
type StepState = 'pending' | 'running' | Status

const STEPS: { id: string; title: string }[] = [
  { id: 'exit', title: '出口 IP' },
  { id: 'intel', title: 'IP 归属' },
  { id: 'ip-purity', title: 'IP 纯净度' },
  { id: 'reputation', title: '信誉与黑名单' },
  { id: 'dns', title: 'DNS 泄露' },
  { id: 'webrtc', title: 'WebRTC 泄露' },
  { id: 'consistency', title: '环境一致性' }
]

const CLASS_LABEL: Record<string, string> = {
  residential: '住宅宽带',
  mobile: '移动网络',
  datacenter: '机房 / 数据中心',
  vpn: '代理 / VPN',
  unknown: '未判定'
}

function initialSteps(): Record<string, StepState> {
  return Object.fromEntries(STEPS.map((s) => [s.id, 'pending']))
}

function summaryText(report: ScanReport): string {
  const lines = [
    'NetPurity 检测报告',
    `时间：${new Date(report.startedAt).toLocaleString()}`,
    `出口 IP：${report.intel?.ip ?? report.exit.ipv4 ?? '未知'}`,
    `归属：${[report.intel?.country, report.intel?.region, report.intel?.city].filter(Boolean).join(' · ')}`,
    `网络：${report.intel?.asn ?? '-'} ${report.intel?.asName ?? report.intel?.org ?? ''}`.trim(),
    `综合评分：${report.score} / 100（${report.grade.label}）`,
    ''
  ]
  for (const c of report.checks) {
    if (c.maxScore === 0) continue
    lines.push(`- ${c.title} ${c.score}/${c.maxScore}：${c.summary}`)
  }
  if (report.partial) lines.push('', `未完成：${report.skipped.join('、')}`)
  return lines.join('\n')
}

const isPreview = typeof window.netpurity === 'undefined'
const api = (window.netpurity ?? createDemoApi()) as typeof window.netpurity

// 预览模式下允许用 URL 直达某个状态，方便截图和设计评审：
//   ?view=unlock   ?panel=settings   ?theme=light
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
const initialView: View = params.get('view') === 'unlock' ? 'unlock' : 'overview'
const initialPanel = params.has('panel')
const initialTheme: ThemeMode = params.get('theme') === 'light' ? 'light' : loadTheme()

if (!isPreview) {
  document.body.classList.add('electron-shell')
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('running')
  const [report, setReport] = useState<ScanReport | null>(null)
  const [steps, setSteps] = useState<Record<string, StepState>>(initialSteps)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState('')
  const [versions, setVersions] = useState<VersionInfo | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [view, setView] = useState<View>(initialView)
  const [theme, setTheme] = useState<ThemeMode>(initialTheme)
  const [settingsOpen, setSettingsOpen] = useState(initialPanel)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailFocus, setDetailFocus] = useState<string | undefined>(undefined)

  const [services, setServices] = useState<UnlockService[]>([])
  const [unlockResults, setUnlockResults] = useState<Record<string, UnlockResult>>({})
  const [unlockTesting, setUnlockTesting] = useState<Record<string, boolean>>({})
  const [unlockAllRunning, setUnlockAllRunning] = useState(false)

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 2600)
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    api.version().then(setVersion).catch(() => undefined)
    api.versions?.()
      .then(setVersions)
      .catch(() => undefined)
    api.listHistory().then(setHistory).catch(() => undefined)
    api.unlockServices?.()
      .then(setServices)
      .catch(() => undefined)

    // 预览模式直达解锁页时，自动灌入演示结果
    if (isPreview && initialView === 'unlock') {
      void api.unlockTestAll().then((list) => {
        const map: Record<string, UnlockResult> = {}
        for (const r of list) map[r.id] = r
        setUnlockResults(map)
      })
    }

    const offProgress = api.onProgress((p: ProgressEvent) => {
      setSteps((prev) => {
        if (prev[p.id] === undefined) return prev
        const next: StepState = p.status === 'running' ? 'running' : p.status === 'done' ? 'ok' : p.status
        return { ...prev, [p.id]: next }
      })
    })
    const offUnlock = api.onUnlockProgress?.((r) => {
      setUnlockResults((prev) => ({ ...prev, [r.id]: r }))
      setUnlockTesting((prev) => ({ ...prev, [r.id]: false }))
    })
    return () => {
      offProgress?.()
      offUnlock?.()
    }
  }, [])

  const run = useCallback(async () => {
    setPhase('running')
    setReport(null)
    setError(null)
    setViewingId(null)
    setSteps(initialSteps())

    setSteps((s) => ({ ...s, webrtc: 'running' }))
    const webrtc = await probeWebRtc().catch(() => undefined)
    setSteps((s) => ({ ...s, webrtc: 'pending' }))

    const res = await api.runScan(webrtc)
    if (res && 'error' in res && res.error) {
      setError(res.error)
      setPhase('error')
      return
    }
    if (!res || !Array.isArray(res.checks)) {
      setError('检测引擎返回了异常结果')
      setPhase('error')
      return
    }
    setReport(res)
    setPhase('done')
    api.addHistory(res).then(setHistory).catch(() => undefined)
  }, [])

  useEffect(() => {
    void run()
  }, [run])

  const openHistory = (entry: HistoryEntry) => {
    setReport(entry.report)
    setPhase('done')
    setViewingId(entry.id)
    setView('overview')
  }

  const exportJson = async () => {
    if (!report) return
    const res = await api.exportJson(report)
    if (res.ok) notify(`已导出：${res.path}`)
    else if (!res.canceled) notify(`导出失败：${res.error ?? '未知错误'}`)
  }

  const exportPdf = async () => {
    const res = await api.exportPdf()
    if (res.ok) notify(`已导出：${res.path}`)
    else if (!res.canceled) notify(`导出失败：${res.error ?? '未知错误'}`)
  }

  const copySummary = async () => {
    if (!report) return
    const ok = await api.copyText(summaryText(report))
    notify(ok ? '摘要已复制到剪贴板' : '复制失败')
  }

  const testOne = async (id: string) => {
    setUnlockTesting((prev) => ({ ...prev, [id]: true }))
    try {
      const r = await api.unlockTest(id)
      setUnlockResults((prev) => ({ ...prev, [id]: r }))
    } finally {
      setUnlockTesting((prev) => ({ ...prev, [id]: false }))
    }
  }

  const testAll = async () => {
    setUnlockAllRunning(true)
    setUnlockTesting({})
    try {
      const list = await api.unlockTestAll()
      const map: Record<string, UnlockResult> = {}
      for (const r of list) map[r.id] = r
      setUnlockResults(map)
    } catch {
      notify('批量测试失败')
    } finally {
      setUnlockAllRunning(false)
    }
  }

  const openDetail = (focusId?: string) => {
    setDetailFocus(focusId)
    setDetailOpen(true)
  }

  const exit = report?.checks.find((c) => c.id === 'exit')
  const scored = report?.checks.filter((c) => c.maxScore > 0) ?? []
  const runningCount = Object.values(steps).filter((s) => s !== 'pending').length

  return (
    <div className="app">
      {!isPreview && <div className="titlebar-drag" aria-hidden />}

      <header className="topbar">
        <div className="brand">
          <div className="logo">NP</div>
          <div>
            <h1>NetPurity</h1>
            <p>网络纯净度 · DNS · WebRTC 泄露检测</p>
          </div>
        </div>

        <nav className="tabs">
          <button className={view === 'overview' ? 'active' : ''} onClick={() => setView('overview')}>
            概览
          </button>
          <button className={view === 'unlock' ? 'active' : ''} onClick={() => setView('unlock')}>
            解锁测试
          </button>
        </nav>

        <div className="actions">
          {isPreview && <span className="preview-badge">预览模式</span>}
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="设置" title="设置">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9.1a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03z" />
            </svg>
          </button>
          <button className="btn" onClick={() => void run()} disabled={phase === 'running'}>
            {phase === 'running' ? '检测中…' : '重新检测'}
          </button>
        </div>
      </header>

      <main>
        {view === 'overview' && (
          <>
            <section className={`hero ${phase}`}>
              {phase === 'running' && (
                <>
                  <div className="scanner" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="hero-body">
                    <h2>正在检测</h2>
                    <p className="hero-sub">
                      已完成 {runningCount} / {STEPS.length} 项
                    </p>
                    <ul className="steps">
                      {STEPS.map((s) => (
                        <li key={s.id} className={`step ${steps[s.id]}`}>
                          <i />
                          {s.title}
                          <b>{steps[s.id]}</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {phase === 'done' && report && (
                <>
                  <ScoreRing score={report.score} tone={report.grade.tone} />
                  <div className="hero-body">
                    <div className={`grade status-${report.grade.tone}`}>{report.grade.label}</div>
                    <p className="hero-sub">{report.grade.description}</p>
                    <div className="hero-meta">
                      <span>耗时 {(report.durationMs / 1000).toFixed(1)} s</span>
                      <span>检测于 {new Date(report.startedAt).toLocaleTimeString()}</span>
                      <span>v{version || '0.1.0'}</span>
                      {viewingId && <span className="viewing">正在查看历史记录</span>}
                    </div>
                    {report.partial && (
                      <p className="notice">未完成：{report.skipped.join('、')} — 结论只覆盖已完成的项目</p>
                    )}
                    {report.errors.length > 0 && <p className="notice dim">{report.errors.join('；')}</p>}

                    <div className="hero-actions">
                      <button className="btn ghost" onClick={() => void exportJson()}>
                        导出 JSON
                      </button>
                      <button className="btn ghost" onClick={() => void exportPdf()}>
                        导出 PDF
                      </button>
                      <button className="btn ghost" onClick={() => void copySummary()}>
                        复制摘要
                      </button>
                      {viewingId && (
                        <button className="btn ghost" onClick={() => void run()}>
                          重新检测
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}

              {phase === 'error' && (
                <div className="hero-body">
                  <h2 className="status-risk">检测失败</h2>
                  <p className="hero-sub">{error}</p>
                  <button className="btn" onClick={() => void run()}>
                    重试
                  </button>
                </div>
              )}
            </section>

            {report?.intel && (
              <section className="strip">
                <div className="strip-item">
                  <span className="k">出口 IPv4</span>
                  <span className="v mono">{report.intel.ip}</span>
                </div>
                <div className="strip-item">
                  <span className="k">归属</span>
                  <span className="v">
                    {[report.intel.country, report.intel.region, report.intel.city].filter(Boolean).join(' · ') ||
                      '未知'}
                  </span>
                </div>
                <div className="strip-item">
                  <span className="k">网络</span>
                  <span className="v">
                    {report.intel.asn ?? '—'} {report.intel.asName ?? report.intel.org ?? ''}
                  </span>
                </div>
                <div className="strip-item">
                  <span className="k">类型</span>
                  <span className={`v badge type-${report.intel.ipClass}`}>{CLASS_LABEL[report.intel.ipClass]}</span>
                </div>
                <div className="strip-item">
                  <span className="k">IPv6</span>
                  <span className="v mono">{report.exit.ipv6 ?? '无'}</span>
                </div>
              </section>
            )}

            {phase === 'done' && report && (
              <section className="summary">
                <header className="section-head compact">
                  <h2>检测结果</h2>
                  <button className="detail-btn" onClick={() => openDetail()} title="查看详细解析">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9">
                      <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
                    </svg>
                    详细解析
                  </button>
                </header>
                <div className="summary-list">
                  {scored.map((c) => (
                    <SummaryRow key={c.id} check={c} onOpen={() => openDetail(c.id)} />
                  ))}
                </div>
                {exit && exit.status !== 'ok' && <p className="inline-warn">{exit.summary}</p>}
              </section>
            )}

            {history.length > 0 && (
              <section className="history">
                <header>
                  <h3>
                    历史记录 <span className="count">{history.length}</span>
                  </h3>
                  <button
                    className="link-btn"
                    onClick={() => {
                      void api.clearHistory().then(setHistory)
                      notify('已清空历史记录')
                    }}
                  >
                    清空
                  </button>
                </header>
                <ul className="history-list">
                  {history.slice(0, 12).map((h, i) => {
                    const prev = history[i + 1]
                    const delta = prev ? h.score - prev.score : 0
                    return (
                      <li
                        key={h.id}
                        className={`history-item ${viewingId === h.id ? 'active' : ''}`}
                        onClick={() => openHistory(h)}
                      >
                        <span className={`h-score status-${h.gradeTone}`}>{h.score}</span>
                        <span className="h-main">
                          <b>{new Date(h.at).toLocaleString()}</b>
                          <small>
                            {h.ip} · {h.country ?? '未知'} · {h.gradeLabel}
                          </small>
                        </span>
                        {prev ? (
                          <span className={`h-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}>
                            {delta > 0 ? `+${delta}` : delta === 0 ? '±0' : delta}
                          </span>
                        ) : (
                          <span className="h-delta" />
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </>
        )}

        {view === 'unlock' && (
          <UnlockPage
            services={services}
            results={unlockResults}
            testing={unlockTesting}
            allRunning={unlockAllRunning}
            onTest={(id) => void testOne(id)}
            onTestAll={() => void testAll()}
          />
        )}
      </main>

      <footer className="foot">
        <span>AGPL-3.0 开源</span>
        <span className="sep">·</span>
        <span>检测只在本机进行，仅向公开情报源查询 IP 归属，不上传任何个人数据</span>
      </footer>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onTheme={setTheme}
        versions={versions}
        onOpenExternal={(url) => void api.openExternal(url)}
      />

      <DetailModal open={detailOpen} checks={scored} focusId={detailFocus} onClose={() => setDetailOpen(false)} />

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
