import type { ReportItem } from '../api/types'
import { formatKst } from '../format'
import Pill from './Pill'
import StatusBadge from './StatusBadge'

/** 신고 큐 테이블 — 행 = 시각 · 사유 pill · 스냅샷 발췌(작성자 포함) · 상태(정본 확정). */
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
            <th>신고된 메시지</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} aria-selected={selectedId === item.id} onClick={() => onSelect(item.id)}>
              <td className="time">{formatKst(item.createdAt)}</td>
              <td><Pill reason={item.reason} /></td>
              <td className="excerpt">{item.snapshotDisplayName}: {item.snapshotMessage}</td>
              <td><StatusBadge status={item.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
