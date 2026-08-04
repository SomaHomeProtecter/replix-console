import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getUserDetail, suspendUser, unsuspendUser } from '../api/admin'
import type { SuspendDuration, UserDetail, UserStatus } from '../api/types'
import Pill from '../components/Pill'
import StatusBadge from '../components/StatusBadge'
import SuspendDialog from '../components/SuspendDialog'
import {
  ACTION_LABELS, USER_STATUS_LABELS, formatKst, suspensionLabel,
} from '../format'

const USER_BADGE_CLASSES: Record<UserStatus, string> = {
  ACTIVE: 'badge badge-active',
  SUSPENDED: 'badge badge-suspended',
  WITHDRAWN: 'badge badge-withdrawn',
}

type Tab = 'reports' | 'actions' | 'suspensions'

const TAB_LABELS: Record<Tab, string> = {
  reports: '받은 신고', actions: '조치 이력', suspensions: '정지 이력',
}

/**
 * 사용자 상세(정본 ②) — 좌 기본 정보 블록(읽기 전용) / 우 탭 3개. 진입은 신고 큐 경유만
 * (검색·목록 없음). 정지 만료는 화면이 계산해 표기한다(lazy 설계 정직성). 정지/해제 버튼은
 * 정본이 침묵한 보완 — 해제 동선이 없으면 콘솔에서 정지를 되돌릴 수 없다(PR 명기).
 */
export default function UserDetailPage() {
  const { userId } = useParams()
  const id = Number(userId)
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('reports')

  const load = useCallback(async () => {
    setError(null)
    try {
      setDetail(await getUserDetail(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const run = (work: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    Promise.resolve()
        .then(work)
        .then(() => load())
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setBusy(false))
  }

  if (error && !detail) {
    return (
      <section className="user-detail" aria-label="사용자 상세">
        <div className="error-box" role="alert">{error}</div>
        <Link className="btn-link" to="/">← 신고 큐로</Link>
      </section>
    )
  }
  if (!detail) {
    return <div className="page-status">불러오는 중…</div>
  }

  const { profile } = detail
  const suspension = suspensionLabel(profile.status, profile.suspendedUntil)
  const suspensionRows = detail.actions.filter(
      (a) => a.action === 'SUSPEND' || a.action === 'UNSUSPEND')
  const name = profile.displayName ?? `#${profile.id}`

  return (
    <section className="user-detail" aria-label="사용자 상세">
      <Link className="btn-link" to="/">← 신고 큐로</Link>
      <div className="user-header">
        <h1>{name}</h1>
        <span className={USER_BADGE_CLASSES[profile.status]}>{USER_STATUS_LABELS[profile.status]}</span>
        {suspension && <span className="badge badge-suspended">{suspension}</span>}
        <div className="spacer" />
        {profile.status === 'SUSPENDED' && (
          <button type="button" className="btn" disabled={busy}
              onClick={() => run(() => unsuspendUser(id))}>
            정지 해제
          </button>
        )}
        {profile.status !== 'WITHDRAWN' && (
          <button type="button" className="btn btn-danger" disabled={busy}
              onClick={() => setDialogOpen(true)}>
            계정 정지…
          </button>
        )}
      </div>

      {error && <div className="error-box" role="alert">{error}</div>}

      <div className="user-columns">
        <div className="profile-block">
          <h2>기본 정보</h2>
          <dl className="meta-grid">
            <dt>ID</dt><dd>{profile.id}</dd>
            <dt>이메일</dt><dd>{profile.email ?? '—'}</dd>
            <dt>가입 경로</dt><dd>{profile.authProvider}</dd>
            <dt>가입일</dt><dd>{formatKst(profile.createdAt)}</dd>
            <dt>마지막 변경</dt><dd>{formatKst(profile.updatedAt)}</dd>
            {profile.suspendReason && (<><dt>정지 사유</dt><dd>{profile.suspendReason}</dd></>)}
          </dl>
        </div>

        <div className="history-tabs">
          <div className="tab-bar" role="tablist">
            {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key}
                  onClick={() => setTab(key)}>
                {TAB_LABELS[key]}
              </button>
            ))}
          </div>

          {tab === 'reports' && (
            detail.reportsReceived.length === 0
              ? <div className="empty-hint">받은 신고가 없습니다</div>
              : (
                <table className="history-table">
                  <thead>
                    <tr><th>시각</th><th>사유</th><th>상태</th><th>신고된 메시지</th><th>신고자</th></tr>
                  </thead>
                  <tbody>
                    {detail.reportsReceived.map((r) => (
                      <tr key={r.id}>
                        <td className="time">{formatKst(r.createdAt)}</td>
                        <td><Pill reason={r.reason} /></td>
                        <td><StatusBadge status={r.status} /></td>
                        <td>{r.snapshotMessage}</td>
                        <td>{r.reporterName ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
          )}

          {tab !== 'reports' && (() => {
            const rows = tab === 'actions' ? detail.actions : suspensionRows
            return rows.length === 0
              ? <div className="empty-hint">기록이 없습니다</div>
              : (
                <table className="history-table">
                  <thead>
                    <tr><th>시각</th><th>조치</th><th>사유</th><th>조치자</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id}>
                        <td className="time">{formatKst(a.createdAt)}</td>
                        <td>{ACTION_LABELS[a.action]}</td>
                        <td>{a.reason ?? '—'}</td>
                        <td>{a.adminName ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
          })()}
        </div>
      </div>

      {dialogOpen && (
        <SuspendDialog
            targetName={name}
            busy={busy}
            onConfirm={(duration: SuspendDuration, reason: string) => {
              setDialogOpen(false)
              run(() => suspendUser(id, duration, reason))
            }}
            onCancel={() => setDialogOpen(false)} />
      )}
    </section>
  )
}
