import type { ReportFilters } from '../api/admin'
import type { ReportReason, ReportStatus } from '../api/types'
import { REASON_LABELS, STATUS_LABELS } from '../format'

/** 필터 = 상태 세그먼트 + 사유 select(정본 확정). 기본은 접수(OPEN) — 큐의 목적이 미처리분이라. */
const STATUS_SEGMENTS: Array<{ value: ReportStatus | ''; label: string }> = [
  { value: 'OPEN', label: STATUS_LABELS.OPEN },
  { value: 'RESOLVED', label: STATUS_LABELS.RESOLVED },
  { value: 'REJECTED', label: STATUS_LABELS.REJECTED },
  { value: '', label: '전체' },
]

export default function FilterBar({ filters, onChange }: {
  filters: ReportFilters
  onChange: (next: ReportFilters) => void
}) {
  return (
    <div className="filter-bar">
      <div className="segmented" role="group" aria-label="상태 필터">
        {STATUS_SEGMENTS.map((seg) => (
          <button
              key={seg.label}
              type="button"
              aria-pressed={filters.status === seg.value}
              onClick={() => onChange({ ...filters, status: seg.value })}>
            {seg.label}
          </button>
        ))}
      </div>
      <select
          aria-label="사유 필터"
          value={filters.reason}
          onChange={(e) => onChange({ ...filters, reason: e.target.value as ReportReason | '' })}>
        <option value="">사유 전체</option>
        {(Object.keys(REASON_LABELS) as ReportReason[]).map((reason) => (
          <option key={reason} value={reason}>{REASON_LABELS[reason]}</option>
        ))}
      </select>
    </div>
  )
}
