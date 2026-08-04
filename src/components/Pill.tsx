import type { ReportReason } from '../api/types'
import { REASON_LABELS } from '../format'

/** 사유별 컬러 pill(시안 cm-pill) — EXT 사유 칩과 같은 한국어 라벨. */
const CLASSES: Record<ReportReason, string> = {
  ABUSE: 'pill p-abuse',
  SPOILER: 'pill p-spoiler',
  SPAM: 'pill p-spam',
  OTHER: 'pill p-other',
}

export default function Pill({ reason }: { reason: ReportReason }) {
  return <span className={CLASSES[reason]}>{REASON_LABELS[reason]}</span>
}
