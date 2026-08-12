import { Link } from 'react-router'
import type { ReportItem } from '../api/types'
import { elapsedSince, formatKst, formatKstTime } from '../format'
import { useMinuteTick } from '../useMinuteTick'
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
                  // 행 안의 링크·버튼에서 난 키까지 삼키면 그것들이 키보드로 닿지 않는다 —
                  // 신고자 링크가 그 경우였다(2026-08-11 자체 리뷰). 행 자신에서 난 키만 처리한다.
                  if (e.target !== e.currentTarget) return
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
                  1건은 모든 행에 붙어 정보가 되지 않으므로 감춘다(HP-296).
                  ⚠️ 누계가 아니라 <b>열린 신고 수</b>다 — 지난주에 3번 신고돼 2건이 이미 종결된
                  메시지가, 실제로 2건이 열려 있는 메시지보다 급해 보이면 안 된다. */}
              <td className="excerpt">
                <div className="excerpt-row">
                  <span className="msg">{item.snapshotMessage}</span>
                  {item.openReportCount > 1 && (
                    <span
                        className="cnt"
                        title={`이 메시지에 지금 열려 있는 신고 ${item.openReportCount}건`
                          + ` (누계 ${item.sameMessageReportCount}건)`}>
                      묶음 ×{item.openReportCount}
                    </span>
                  )}
                </div>
              </td>
              {/* 신고자 이름이 그 사용자 상세로 가는 문이다(HP-270). 종전엔 상세로 가는 길이
                  <b>작성자 경유뿐</b>이라, 신고 남용을 보려 해도 남용자에게 닿을 수 없었다.
                  행 클릭은 상세 모달을 여는 동작이므로 전파를 끊는다 — 안 끊으면 링크를 눌러도
                  모달이 함께 떠서 어디로 가려던 것인지 알 수 없어진다. */}
              <td className="party reporter">
                {item.reporter ? (
                  <Link
                      className="btn-link" to={`/users/${item.reporter.id}`}
                      onClick={(e) => e.stopPropagation()}>
                    {item.reporter.displayName ?? `#${item.reporter.id}`}
                  </Link>
                ) : '—'}
              </td>
              <td><StatusBadge status={item.status} resolvedAction={item.resolvedAction} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
