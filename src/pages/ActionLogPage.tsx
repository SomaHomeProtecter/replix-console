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
              {items.map((row) => (
                <tr key={row.id}>
                  <td className="time">{formatKstShort(row.createdAt)}</td>
                  <td className="admin">{row.adminName ?? `#${row.adminId}`}</td>
                  <td className="action">{actionLabel(row.action, row.outcome)}</td>
                  <td className="target">
                    {row.targetUserName && row.targetUserId !== null
                      ? <Link className="btn-link" to={`/users/${row.targetUserId}`}>
                          {row.targetUserName}
                        </Link>
                      : targetText(row)}
                  </td>
                  <td className="why" title={row.reason ?? undefined}>{row.reason ?? '—'}</td>
                </tr>
              ))}
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
