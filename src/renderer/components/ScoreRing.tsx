import type { Status } from '../../core/types.ts'

const TONE: Record<string, string> = {
  ok: '#3fb950',
  warn: '#d29922',
  risk: '#f85149',
  error: '#f85149',
  skip: '#6e7c8f'
}

export function ScoreRing({ score, tone }: { score: number; tone: Status | string }) {
  const r = 78
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.max(0, Math.min(100, score)) / 100)
  const color = TONE[tone] ?? '#58a6ff'

  return (
    <div className="ring" style={{ ['--ring-color' as string]: color }}>
      <svg viewBox="0 0 190 190" aria-hidden>
        <circle className="ring-track" cx="95" cy="95" r={r} />
        <circle
          className="ring-value"
          cx="95"
          cy="95"
          r={r}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-center">
        <span className="ring-score">{score}</span>
        <span className="ring-unit">/ 100</span>
      </div>
    </div>
  )
}
