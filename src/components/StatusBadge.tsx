import type { ReportStatus } from '../api/types'
import { ROW_STATUS_LABELS } from '../format'

const CLASSES: Record<ReportStatus, string> = {
  OPEN: 'st st-open',
  RESOLVED: 'st st-done',
  REJECTED: 'st st-rej',
}

/** 신고 상태 텍스트(시안 cm-st — ● OPEN / ✓ 처리 / — 기각). OPEN 빨강은 시안 확정. */
export default function StatusBadge({ status }: { status: ReportStatus }) {
  return <span className={CLASSES[status]}>{ROW_STATUS_LABELS[status]}</span>
}
