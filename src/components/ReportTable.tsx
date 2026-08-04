import type { ReportItem } from '../api/types'
import { formatKst, formatKstTime } from '../format'
import Pill from './Pill'
import StatusBadge from './StatusBadge'

/** 신고 큐 테이블(시안 cm-tr) — 시각(HH:mm) · 사유 pill · 스냅샷 발췌(작성자 포함) · 상태. */
export default function ReportTable({ items, selectedId, onSelect }: {
  items: ReportItem[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  if (items.length === 0) {
    return <div className="empty-hint">표시할 신고가 없습니다</div>
  }
  return (
    <div className="report-table-wrap">
      <table className="report-table">
        <thead>
          <tr>
            <th>시각</th>
            <th>사유</th>
            <th>신고된 채팅 (스냅샷)</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            // aria-selected는 grid 전용이라 일반 table에선 유효하지 않다(리뷰 m4) —
            // aria-current + tabIndex/키보드 선택으로 콘솔 유일 진입 동선을 키보드에도 연다.
            <tr
                key={item.id}
                tabIndex={0}
                aria-current={selectedId === item.id ? 'true' : undefined}
                onClick={() => onSelect(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(item.id)
                  }
                }}>
              <td className="time" title={formatKst(item.createdAt)}>{formatKstTime(item.createdAt)}</td>
              <td><Pill reason={item.reason} /></td>
              <td className="excerpt"><span className="who">{item.snapshotDisplayName}</span>{item.snapshotMessage}</td>
              <td><StatusBadge status={item.status} resolvedAction={item.resolvedAction} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
