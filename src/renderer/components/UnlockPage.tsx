import type { UnlockResult, UnlockService } from '../../core/probes/unlock.ts'

const STATE_LABEL: Record<string, string> = {
  idle: '待检测',
  testing: '检测中…',
  ok: '可访问',
  blocked: '地区受限',
  unreachable: '不可达',
  unknown: '需人工确认'
}

export function UnlockPage({
  services,
  results,
  testing,
  allRunning,
  onTest,
  onTestAll
}: {
  services: UnlockService[]
  results: Record<string, UnlockResult>
  testing: Record<string, boolean>
  allRunning: boolean
  onTest: (id: string) => void
  onTestAll: () => void
}) {
  return (
    <section className="unlock">
      <header className="section-head">
        <div>
          <h2>解锁测试</h2>
          <p className="section-sub">
            对常见流媒体与 AI 服务发起真实请求，看当前出口能否正常访问。判定基于 HTTP 状态码与页面文案，
            <b>属于实验性功能</b>，请以状态码和提示为准。
          </p>
        </div>
        <button className="btn" onClick={onTestAll} disabled={allRunning}>
          {allRunning ? '测试中…' : '测试全部'}
        </button>
      </header>

      <div className="svc-grid">
        {services.map((s) => {
          const r = results[s.id]
          const busy = testing[s.id] || allRunning
          const state = busy ? 'testing' : (r?.state ?? 'idle')
          return (
            <button
              key={s.id}
              className={`svc-card status-${state}`}
              onClick={() => onTest(s.id)}
              disabled={busy}
              title={s.note}
            >
              <span className="svc-top">
                <span className="svc-name">{s.name}</span>
                <span className="svc-group">{s.group}</span>
              </span>
              <span className="svc-state">
                <i />
                {STATE_LABEL[state]}
              </span>
              <span className="svc-detail">
                {r?.detail ?? (busy ? '正在发起请求…' : s.note)}
              </span>
              <span className="svc-foot">
                {r ? (
                  <>
                    {r.status ? <b>HTTP {r.status}</b> : <b>无响应</b>}
                    <em>{r.ms} ms</em>
                  </>
                ) : (
                  <em>{busy ? '' : '点击单独测试'}</em>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <p className="unlock-legend">
        <span className="lg ok" /> 可访问
        <span className="lg blocked" /> 地区受限
        <span className="lg unreachable" /> 不可达
        <span className="lg unknown" /> 需人工确认（403 / 人机验证）
      </p>
    </section>
  )
}
