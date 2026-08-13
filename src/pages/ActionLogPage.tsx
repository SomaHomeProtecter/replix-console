import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { listActions, type ActionLogFilters } from '../api/admin'
import type { AdminActionLogRow, AdminActionType, AdminActor } from '../api/types'
import { ACTION_LABELS, actionLabel, formatKstShort } from '../format'

interface FilterInputs {
  adminUserId: number | ''
  action: AdminActionType | ''
  fromDate: string
  toDate: string
}

const EMPTY_FILTERS: FilterInputs = {
  adminUserId: '', action: '', fromDate: '', toDate: '',
}

/** date input의 KST 하루를 BE Instant 포함 경계로 바꾼다. 콘솔의 시각 표기(formatKstShort)와 같은 기준. */
function fromInstant(date: string): string {
  return date ? new Date(`${date}T00:00:00+09:00`).toISOString() : ''
}

function toInstant(date: string): string {
  return date ? new Date(`${date}T23:59:59.999+09:00`).toISOString() : ''
}

function targetText(row: AdminActionLogRow) {
  return row.targetSummary ?? row.targetId
}


/**
 * 상세로 오는 길이 셋이라(신고 큐·정지 현황판·조치 로그) 상세의 "돌아가기"가 하나로 굳어 있으면
 * 온 곳이 아닌 데로 되돌려보낸다. 어디서 보냈는지를 링크에 실어 상세가 그리로 돌리게 한다.
 */
const BACK_TO_LOG = { from: '/actions', label: '조치 로그' }

/** 전역 운영 조치 스트림(HP-299) — 읽기 전용이며 서버가 준 순서를 화면에서 다시 정렬하지 않는다. */
export default function ActionLogPage() {
  const [inputs, setInputs] = useState<FilterInputs>(EMPTY_FILTERS)
  const [items, setItems] = useState<AdminActionLogRow[]>([])
  const [admins, setAdmins] = useState<AdminActor[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadSeq = useRef(0)

  const filters = useMemo<ActionLogFilters>(() => ({
    adminUserId: inputs.adminUserId,
    action: inputs.action,
    from: fromInstant(inputs.fromDate),
    to: toInstant(inputs.toDate),
  }), [inputs])

  const load = useCallback(async (target: ActionLogFilters, cursor: string | null) => {
    // 필터 변경과 더 불러오기가 겹쳐도 늦은 응답이 새 목록을 오염시키지 않게 최신 요청만 반영한다.
    const seq = ++loadSeq.current
    setLoading(true)
    setError(null)
    try {
      const page = await listActions(target, cursor)
      if (seq !== loadSeq.current) return
      setItems((previous) => cursor ? [...previous, ...page.items] : page.items)
      setNextCursor(page.nextCursor)
      setAdmins(page.admins)
    } catch (failure) {
      if (seq === loadSeq.current) {
        setError(failure instanceof Error ? failure.message : String(failure))
      }
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(filters, null)
  }, [filters, load])

  return (
    <section className="action-log" aria-label="조치 로그">
      <div className="board-head">
        <h1>조치 로그</h1>
        <span className="filter-note">최신순 · 커서 페이징</span>
      </div>

      <div className="action-filters" aria-label="조치 로그 필터">
        <label>
          <span>처리자</span>
          <select
              aria-label="처리자" value={inputs.adminUserId}
              onChange={(event) => setInputs((current) => ({
                ...current,
                adminUserId: event.target.value === '' ? '' : Number(event.target.value),
              }))}>
            <option value="">전체</option>
            {admins.map((admin) => (
              <option key={admin.id} value={admin.id}>{admin.displayName ?? `#${admin.id}`}</option>
            ))}
          </select>
        </label>
        <label>
          <span>조치</span>
          <select
              aria-label="조치" value={inputs.action}
              onChange={(event) => setInputs((current) => ({
                ...current, action: event.target.value as AdminActionType | '',
              }))}>
            <option value="">전체</option>
            {(Object.keys(ACTION_LABELS) as AdminActionType[]).map((action) => (
              <option key={action} value={action}>{ACTION_LABELS[action]}</option>
            ))}
          </select>
        </label>
        <label>
          <span>시작일</span>
          <input
              aria-label="시작일" type="date" value={inputs.fromDate}
              onChange={(event) => setInputs((current) => ({
                ...current, fromDate: event.target.value,
              }))} />
        </label>
        <label>
          <span>종료일</span>
          <input
              aria-label="종료일" type="date" value={inputs.toDate}
              onChange={(event) => setInputs((current) => ({
                ...current, toDate: event.target.value,
              }))} />
        </label>
      </div>

      {error && <div className="error-box" role="alert">{error}</div>}
      {loading && items.length === 0 && <div className="page-status">불러오는 중…</div>}
      {!loading && !error && items.length === 0 && (
        <div className="empty-hint">조건에 맞는 조치 이력이 없습니다</div>
      )}

      {items.length > 0 && (
        <div className="report-table-wrap">
          <table className="action-table">
            <thead>
              <tr><th>시각</th><th>처리자</th><th>조치</th><th>대상</th><th>사유</th></tr>
            </thead>
            <tbody>
              {items.map((row) => {
                // 대상 사용자를 아는 행만 상세로 건다 — MESSAGE나 사라진 신고는 걸 곳이 없다.
                const linked = row.targetUserName !== null && row.targetUserId !== null
                // 이름만으로는 어느 신고인지 못 가린다 — 같은 사람의 정지와 신고 종결이 대상
                // 칸에서 똑같아진다. 사용자 상세와 같은 발췌·따옴표를 함께 싣는다.
                const excerpt = linked && row.targetSummary ? `“${row.targetSummary}”` : null
                // 열은 폭이 고정이라 넘치면 잘린다(styles.css) — 감사 로그에서 대상 식별자가
                // 잘린 채 확인할 방법이 없으면 그 행은 읽을 수 없으므로 전문을 title로 남긴다.
                const title = [linked ? row.targetUserName : targetText(row), excerpt]
                    .filter((part): part is string => part !== null).join(' · ')
                return (
                  <tr key={row.id}>
                    <td className="time">{formatKstShort(row.createdAt)}</td>
                    <td className="admin">{row.adminName ?? `#${row.adminId}`}</td>
                    <td className="action">{actionLabel(row.action, row.outcome)}</td>
                    <td className="target" title={title}>
                      {linked
                        ? <Link
                              className="btn-link" to={`/users/${row.targetUserId}`}
                              state={BACK_TO_LOG}>
                            {row.targetUserName}
                          </Link>
                        : targetText(row)}
                      {excerpt && <span className="target-excerpt">{excerpt}</span>}
                    </td>
                    <td className="why" title={row.reason ?? undefined}>{row.reason ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <button
            type="button" className="btn load-more" disabled={loading}
            onClick={() => void load(filters, nextCursor)}>
          더 불러오기
        </button>
      )}
    </section>
  )
}
