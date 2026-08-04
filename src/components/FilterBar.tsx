import type { ReportFilters } from '../api/admin'
import type { ReportReason, ReportStatus } from '../api/types'
import { REASON_LABELS, STATUS_LABELS } from '../format'

/**
 * 필터 툴바(시안 cm-toolbar) — 상태·사유 모두 pill 칩. 켜진 칩을 다시 누르면 해제(=전체).
 * 초기값은 열림(OPEN)만 — 큐의 목적이 미처리분이라.
 */
export default function FilterBar({ filters, onChange }: {
  filters: ReportFilters
  onChange: (next: ReportFilters) => void
}) {
  const toggleStatus = (value: ReportStatus) =>
    onChange({ ...filters, status: filters.status === value ? '' : value })
  const toggleReason = (value: ReportReason) =>
    onChange({ ...filters, reason: filters.reason === value ? '' : value })

  return (
    <div className="filter-bar">
      {(Object.keys(STATUS_LABELS) as ReportStatus[]).map((status) => (
        <button
            key={status} type="button" className="chip-f"
            aria-pressed={filters.status === status}
            onClick={() => toggleStatus(status)}>
          {STATUS_LABELS[status]}
        </button>
      ))}
      <span className="filter-gap" />
      {(Object.keys(REASON_LABELS) as ReportReason[]).map((reason) => (
        <button
            key={reason} type="button" className="chip-f"
            aria-pressed={filters.reason === reason}
            onClick={() => toggleReason(reason)}>
          {REASON_LABELS[reason]}
        </button>
      ))}
      <span className="filter-note">최신순 · 커서 페이징</span>
    </div>
  )
}
