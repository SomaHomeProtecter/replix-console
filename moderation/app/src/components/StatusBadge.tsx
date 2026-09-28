import type { ReportStatus, ResolutionAction } from '../api/types'
import { rowStatusLabel } from '../format'

const CLASSES: Record<ReportStatus, string> = {
  OPEN: 'st st-open',
  RESOLVED: 'st st-done',
  REJECTED: 'st st-rej',
}

/** 신고 상태 텍스트(시안 cm-st) — 처리됨은 동반 조치로 세분(✓ 가림/✓ 정지/✓ 처리). */
export default function StatusBadge({ status, resolvedAction = null }: {
  status: ReportStatus
  resolvedAction?: ResolutionAction | null
}) {
  return <span className={CLASSES[status]}>{rowStatusLabel(status, resolvedAction)}</span>
}
