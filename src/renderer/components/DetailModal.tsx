import type { CheckResult } from '../../core/types.ts'
import { CheckCard } from './CheckCard.tsx'

export function DetailModal({
  open,
  checks,
  focusId,
  onClose
}: {
  open: boolean
  checks: CheckResult[]
  focusId?: string
  onClose: () => void
}) {
  if (!open) return null

  const ordered = [...checks].sort((a, b) => {
    if (a.id === focusId) return -1
    if (b.id === focusId) return 1
    return 0
  })

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal detail" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>详细解析</h2>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>
        <div className="modal-body">
          <div className="grid">
            {ordered.map((c) => (
              <CheckCard key={c.id} check={c} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
