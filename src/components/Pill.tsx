import type { ReportReason } from '../api/types'
import { REASON_LABELS } from '../format'

/** 신고 사유 pill(정본 행 구성) — EXT 사유 칩과 같은 한국어 라벨. */
export default function Pill({ reason }: { reason: ReportReason }) {
  return <span className="pill">{REASON_LABELS[reason]}</span>
}
