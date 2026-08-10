import { useEffect, useState } from 'react'
import type { ReportItem } from '../api/types'
import { elapsedSince, formatKst, formatKstTime } from '../format'
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

/**
 * 1분마다 지금 시각을 새로 준다.
 *
 * <p>없으면 경과 뱃지가 <b>렌더 시점에 굳는다</b> — 콘솔을 열어 둔 채 두는 흔한 사용(벽에 띄운
 * 큐 화면)에서 24h·48h 경계를 넘긴 신고가 계속 옛 톤으로 남아, 나이가 유일한 신호인 바로 그
 * 상황에서 이 기능이 무의미해진다. 분 단위면 충분하다 — 경계가 시간·일 단위다.
 */
function useMinuteTick(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

/**
 * 접수 이후 경과(HP-296) — 시각 옆에 붙어 "3일 묵은 건과 방금 건"을 목록에서 가른다.
 * 색은 스타일시트가 톤 이름으로 정한다(빨강은 정지 전용이라 여기 쓰지 않는다).
 */
function ElapsedBadge({ createdAt, now }: { createdAt: string; now: Date }) {
  const { label, tone } = elapsedSince(createdAt, now)
  return <span className={`agebadge ${tone}`}>{label}</span>
}

export default function ReportTable({ items, selectedId, onSelect }: {
  items: ReportItem[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  const now = useMinuteTick()
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
              <td className="time" title={formatKst(item.createdAt)}>
                {formatKstTime(item.createdAt)}
                <ElapsedBadge createdAt={item.createdAt} now={now} />
              </td>
              <td><Pill reason={item.reason} /></td>
              {/* 계정 이름이 정본 — 신고 시점 이름과 다르면(닉 변경) 그 사실을 title로 남긴다 */}
              <td className="party" title={authorTitle(item)}>
                {item.targetUser?.displayName ?? item.snapshotDisplayName ?? '—'}
              </td>
              {/* 여러 사람이 동시에 신고한 건이 가장 급하다 — 그 수가 상세를 열어야만 보였다.
                  1건은 모든 행에 붙어 정보가 되지 않으므로 감춘다(HP-296). */}
              <td className="excerpt">
                <div className="excerpt-row">
                  <span className="msg">{item.snapshotMessage}</span>
                  {item.sameMessageReportCount > 1 && (
                    <span className="cnt">묶음 ×{item.sameMessageReportCount}</span>
                  )}
                </div>
              </td>
              <td className="party reporter">{item.reporter?.displayName ?? '—'}</td>
              <td><StatusBadge status={item.status} resolvedAction={item.resolvedAction} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
