import type { CheckResult, Status } from '../../core/types.ts'

const ICON: Record<Status, string> = {
  ok: '✓',
  warn: '!',
  risk: '✕',
  error: '✕',
  skip: '–'
}

/** 概览里的精简行：一行看完结论，点开才是明细 */
export function SummaryRow({ check, onOpen }: { check: CheckResult; onOpen: () => void }) {
  const pct = check.maxScore > 0 ? Math.round((check.score / check.maxScore) * 100) : 0
  return (
    <button className={`summary-row status-${check.status}`} onClick={onOpen}>
      <span className={`dot status-${check.status}`}>{ICON[check.status]}</span>
      <span className="sr-main">
        <span className="sr-title">{check.title}</span>
        <span className="sr-summary">{check.summary}</span>
      </span>
      <span className="sr-meter" aria-hidden>
        <span style={{ width: `${check.status === 'skip' ? 0 : pct}%` }} />
      </span>
      <span className="sr-score">
        {check.status === 'skip' ? '未计分' : `${check.score}/${check.maxScore}`}
      </span>
      <span className="sr-chevron">›</span>
    </button>
  )
}
