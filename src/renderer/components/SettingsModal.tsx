import type { ThemeMode } from '../theme.ts'
import type { VersionInfo } from '../../../electron/preload.ts'

export interface SourceItem {
  name: string
  purpose: string
  url?: string
}

const SOURCES: { group: string; items: SourceItem[] }[] = [
  {
    group: 'IP 情报',
    items: [
      { name: 'ipwho.is', purpose: 'IP 归属、ASN、时区、ISP', url: 'https://ipwho.is' },
      { name: 'ip-api.com', purpose: '代理 / 托管 / 移动网络标记', url: 'https://ip-api.com' },
      { name: 'ipapi.co', purpose: '前两个源失败时的兜底', url: 'https://ipapi.co' }
    ]
  },
  {
    group: 'DNS 观测',
    items: [
      { name: 'Google o-o.myaddr', purpose: '回显递归解析器出口地址' },
      { name: 'Akamai whoami', purpose: '回显递归解析器出口地址' },
      { name: 'Cloudflare DoH', purpose: '与系统解析结果做污染比对', url: 'https://cloudflare-dns.com' }
    ]
  },
  {
    group: '反滥用黑名单',
    items: [
      { name: 'DroneBL', purpose: 'DNSBL 黑名单', url: 'https://dronebl.org' },
      { name: 'SpamCop', purpose: 'DNSBL 黑名单', url: 'https://www.spamcop.net' },
      { name: 'S5H', purpose: 'DNSBL 黑名单', url: 'https://s5h.net' },
      { name: 'UCEPROTECT L1', purpose: 'DNSBL 黑名单', url: 'http://www.uceprotect.net' }
    ]
  },
  {
    group: 'WebRTC 检测',
    items: [
      { name: 'Cloudflare STUN', purpose: '收集 srflx 候选地址' },
      { name: 'Google STUN', purpose: '备用 STUN 服务' }
    ]
  }
]

const THEMES: { id: ThemeMode; label: string }[] = [
  { id: 'dark', label: '深色' },
  { id: 'light', label: '浅色' },
  { id: 'system', label: '跟随系统' }
]

export function SettingsModal({
  open,
  onClose,
  theme,
  onTheme,
  versions,
  onOpenExternal
}: {
  open: boolean
  onClose: () => void
  theme: ThemeMode
  onTheme: (t: ThemeMode) => void
  versions: VersionInfo | null
  onOpenExternal: (url: string) => void
}) {
  if (!open) return null

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>设置</h2>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <section className="setting-block">
            <h3>外观</h3>
            <div className="segmented">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className={theme === t.id ? 'active' : ''}
                  onClick={() => onTheme(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="setting-hint">浅色模式适合白天和投屏，深色模式更省眼。</p>
          </section>

          <section className="setting-block">
            <h3>情报源公示</h3>
            <p className="setting-hint">
              检测只查询以下公开服务，不上传任何个人数据。点击名称可在浏览器中查看其隐私政策。
            </p>
            {SOURCES.map((g) => (
              <div key={g.group} className="source-group">
                <div className="source-group-title">{g.group}</div>
                <ul className="source-list">
                  {g.items.map((s) => (
                    <li key={s.name}>
                      {s.url ? (
                        <button className="source-name link" onClick={() => onOpenExternal(s.url!)}>
                          {s.name}
                        </button>
                      ) : (
                        <span className="source-name">{s.name}</span>
                      )}
                      <span className="source-purpose">{s.purpose}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="setting-block">
            <h3>版本</h3>
            <ul className="version-list">
              <li>
                <span>NetPurity</span>
                <b>{versions?.app ?? '0.1.0'}</b>
              </li>
              <li>
                <span>Electron</span>
                <b>{versions?.electron ?? '—'}</b>
              </li>
              <li>
                <span>Chromium</span>
                <b>{versions?.chrome ?? '—'}</b>
              </li>
              <li>
                <span>Node.js</span>
                <b>{versions?.node ?? '—'}</b>
              </li>
              <li>
                <span>平台</span>
                <b>{versions?.platform ?? '—'}</b>
              </li>
            </ul>
            <p className="setting-hint">AGPL-3.0 开源 · 检测全部在本机完成</p>
          </section>
        </div>
      </div>
    </div>
  )
}
