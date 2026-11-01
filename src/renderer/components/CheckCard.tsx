import { useState } from 'react'
import type { CheckResult, Status } from '../../core/types.ts'

const LABEL: Record<Status, string> = {
  ok: '正常',
  warn: '注意',
  risk: '风险',
  error: '失败',
  skip: '跳过'
}

const ICON: Record<Status, string> = {
  ok: '✓',
  warn: '!',
  risk: '✕',
  error: '✕',
  skip: '–'
}

export function CheckCard({ check }: { check: CheckResult }) {
  const [open, setOpen] = useState(false)
  const visible = open ? check.findings : check.findings.slice(0, 3)
  const hidden = check.findings.length - visible.length
  const pct = check.maxScore > 0 ? Math.round((check.score / check.maxScore) * 100) : 0

  return (
    <article className={`card status-${check.status}`}>
      <header className="card-head">
        <div className="card-title">
          <span className={`dot status-${check.status}`}>{ICON[check.status]}</span>
          <div>
            <h3>{check.title}</h3>
            <p>{check.subtitle}</p>
          </div>
        </div>
        <div className="card-score">
          {check.status === 'skip' ? (
            <span className="score-max">未计分</span>
          ) : (
            <>
              <span className="score-num">{check.score}</span>
              <span className="score-max">/ {check.maxScore}</span>
            </>
          )}
        </div>
      </header>

      {check.status !== 'skip' && (
        <div className="meter" title={`${pct}%`}>
          <span style={{ width: `${pct}%` }} />
        </div>
      )}

      <p className="card-summary">{check.summary}</p>

      <ul className="findings">
        {visible.map((f, i) => (
          <li key={`${f.label}-${i}`}>
            <span className={`fdot status-${f.status}`} />
            <span className="flabel">{f.label}</span>
            <span className="fvalue" title={f.value}>
              {f.value}
            </span>
            {f.hint ? <span className="fhint">{f.hint}</span> : null}
          </li>
        ))}
      </ul>

      {hidden > 0 ? (
        <button className="more" onClick={() => setOpen(true)}>
          展开其余 {hidden} 项
        </button>
      ) : null}
      {open && check.findings.length > 3 ? (
        <button className="more" onClick={() => setOpen(false)}>
          收起
        </button>
      ) : null}

      <footer className="card-foot">
        <span className={`pill status-${check.status}`}>{LABEL[check.status]}</span>
        <span className="ms">{check.durationMs} ms</span>
      </footer>
    </article>
  )
}
