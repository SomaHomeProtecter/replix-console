import type { ReportStatus } from '../api/types'
import { STATUS_LABELS } from '../format'

const CLASSES: Record<ReportStatus, string> = {
  OPEN: 'badge badge-open',
  RESOLVED: 'badge badge-resolved',
  REJECTED: 'badge badge-rejected',
}

/** 신고 상태 배지 — 잉크 톤 유지(빨강 금지: 빨강은 정지 전용). */
export default function StatusBadge({ status }: { status: ReportStatus }) {
  return <span className={CLASSES[status]}>{STATUS_LABELS[status]}</span>
}
