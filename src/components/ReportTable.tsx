import type { ReportItem } from '../api/types'
import { formatKst, formatKstTime } from '../format'
import Pill from './Pill'
import StatusBadge from './StatusBadge'

/**
 * 신고 큐 테이블(시안 cm-tr) — 시각(HH:mm) · 사유 pill · 작성자 · 스냅샷 발췌 · 신고자 · 상태.
 *
 * <p>작성자·신고자를 독립 칸으로 뺐다(HP-268, 2026-08-05 김지호 피드백) — 종전에는 작성자 이름이
 * 발췌 앞에 작은 회색 글씨로 붙어 본문과 이어 읽혀 "누구 채팅인지" 눈에 들어오지 않았다.
 * 신고자 칸은 새로 추가한 것으로, <b>같은 사람이 반복해서 신고하는지</b>가 목록에서 바로 보인다
 * (무분별한 신고 판별의 1차 단서 — 지금은 이걸 보려면 건마다 상세를 열어야 했다).
 */
/** 신고 시점 이름이 지금 계정 이름과 다르면 그 사실을 알린다 — 닉을 바꿔 추적을 흐리는 경우가 있다. */
function authorTitle(item: ReportItem): string | undefined {
  const current = item.targetUser?.displayName
  if (!item.snapshotDisplayName || !current || current === item.snapshotDisplayName) {
    return undefined
  }
  return `신고 시점 이름: ${item.snapshotDisplayName}`
}

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
            <th>작성자</th>
            <th>신고된 채팅 (스냅샷)</th>
            <th>신고자</th>
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
              {/* 계정 이름이 정본 — 신고 시점 이름과 다르면(닉 변경) 그 사실을 title로 남긴다 */}
              <td className="party" title={authorTitle(item)}>
                {item.targetUser?.displayName ?? item.snapshotDisplayName ?? '—'}
              </td>
              <td className="excerpt">{item.snapshotMessage}</td>
              <td className="party reporter">{item.reporter?.displayName ?? '—'}</td>
              <td><StatusBadge status={item.status} resolvedAction={item.resolvedAction} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
