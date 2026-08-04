import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getUserDetail, suspendUser, unsuspendUser } from '../api/admin'
import type { SuspendDuration, UserDetail, UserStatus } from '../api/types'
import Pill from '../components/Pill'
import SuspendDialog from '../components/SuspendDialog'
import {
  ACTION_LABELS, formatKstShort, suspensionChip,
} from '../format'

const CHIP_CLASSES: Record<UserStatus, string> = {
  ACTIVE: 'ustatus',
  SUSPENDED: 'ustatus susp',
  WITHDRAWN: 'ustatus gone',
}

type Tab = 'reports' | 'actions' | 'suspensions'

/**
 * 사용자 상세(시안 cm2) — 헤더(아바타·이름·상태 칩(정지 만료 lazy 계산)·userId/provider) +
 * 좌 기본 정보 블록(읽기 전용) / 우 탭 3개(건수 표기). 진입은 신고 큐 경유만(검색·목록 없음).
 * 정지/해제 버튼은 정본이 침묵한 보완 — 해제 동선이 없으면 콘솔에서 정지를 되돌릴 수 없다.
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
        .catch(async (e: unknown) => {
          // 실패해도 다시 읽어 실상을 반영한다(리뷰 m3) — load가 error를 비우므로
          // 조치 실패 메시지는 재조회 뒤에 덮어쓴다.
          await load()
          setError(e instanceof Error ? e.message : String(e))
        })
        .finally(() => setBusy(false))
  }

  if (error && !detail) {
    return (
      <section className="user-detail" aria-label="사용자 상세">
        <div className="back-row"><Link className="btn-link" to="/">← 신고 큐로</Link></div>
        <div className="detail-panel"><div className="error-box" role="alert">{error}</div></div>
      </section>
    )
  }
  if (!detail) {
    return <div className="page-status">불러오는 중…</div>
  }

  const { profile } = detail
  const name = profile.displayName ?? `#${profile.id}`
  const tabLabels: Record<Tab, string> = {
    reports: `받은 신고 ${detail.reportsReceived.length}`,
    actions: `조치 이력 ${detail.actions.length}`,
    suspensions: `정지 이력 ${detail.suspensions.length}`,
  }

  return (
    <section className="user-detail" aria-label="사용자 상세">
      <div className="back-row"><Link className="btn-link" to="/">← 신고 큐로</Link></div>
      <div className="user-header">
        <span className="ua">{name.slice(0, 1)}</span>
        <div>
          <h1>
            {name}
            <span className={CHIP_CLASSES[profile.status]}>
              {suspensionChip(profile.status, profile.suspendedUntil)}
            </span>
          </h1>
          <div className="uid">userId {profile.id} · provider {profile.authProvider}</div>
        </div>
        <div className="top-act">
          {profile.status === 'SUSPENDED' && (
            <button type="button" className="btn" disabled={busy}
                onClick={() => run(async () => { await unsuspendUser(id) })}>
              정지 해제
            </button>
          )}
          {profile.status !== 'WITHDRAWN' && (
            <button type="button" className="btn btn-susp" disabled={busy}
                onClick={() => setDialogOpen(true)}>
              계정 정지…
            </button>
          )}
        </div>
      </div>

      {error && <div className="detail-panel"><div className="error-box" role="alert">{error}</div></div>}

      <div className="user-columns">
        <div className="profile-block">
          <h5 className="side-h">기본 정보</h5>
          <dl>
            <dt>가입일</dt><dd>{formatKstShort(profile.createdAt)}</dd>
            <dt>상태</dt><dd>{profile.status}</dd>
            {profile.suspendReason && (<><dt>정지 사유</dt><dd>{profile.suspendReason}</dd></>)}
            <dt>마지막 변경</dt><dd>{formatKstShort(profile.updatedAt)}</dd>
            <dt>이메일</dt><dd>{profile.email ?? '—'}</dd>
          </dl>
        </div>

        <div className="history-tabs">
          <div className="tab-bar" role="tablist">
            {(Object.keys(tabLabels) as Tab[]).map((key) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key}
                  onClick={() => setTab(key)}>
                {tabLabels[key]}
              </button>
            ))}
          </div>

          {tab === 'reports' && (
            detail.reportsReceived.length === 0
              ? <div className="empty-hint">받은 신고가 없습니다</div>
              : detail.reportsReceived.map((r) => (
                <div className="evrow" key={r.id}>
                  <span className="t">{formatKstShort(r.createdAt)}</span>
                  <span><Pill reason={r.reason} /></span>
                  <span>{r.snapshotMessage} <span className="who2">— {r.reporterName ?? '—'}</span></span>
                </div>
              ))
          )}

          {tab !== 'reports' && (() => {
            // 정지 이력은 BE의 별도 축(suspensions) — actions에서 클라이언트 필터로 만들면
            // actions 상한(50)에 밀려 거짓 "기록 없음"이 될 수 있다(리뷰 m9)
            const rows = tab === 'actions' ? detail.actions : detail.suspensions
            return rows.length === 0
              ? <div className="empty-hint">기록이 없습니다</div>
              : (
                <>
                  <div className="evrow act head2">
                    <span>시각</span><span>조치</span><span>대상 · 사유</span><span>처리자</span>
                  </div>
                  {rows.map((a) => (
                    <div className="evrow act" key={a.id}>
                      <span className="t">{formatKstShort(a.createdAt)}</span>
                      <span className="alabel">{ACTION_LABELS[a.action]}</span>
                      {/* 어떤 신고에 대한 조치인지 발췌로 직관 표기(2026-08-05 E2E 피드백 2회) */}
                      <span>
                        {a.targetType === 'REPORT'
                          ? <span title={`신고 #${a.targetId}`}>“{a.targetSummary ?? `신고 #${a.targetId}`}”</span>
                          : <span className="who2">이 사용자</span>}
                        {a.reason ? <span className="who2"> · {a.reason}</span> : null}
                      </span>
                      <span className="actor">{a.adminName ?? '—'}</span>
                    </div>
                  ))}
                </>
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
              run(async () => { await suspendUser(id, duration, reason) })
            }}
            onCancel={() => setDialogOpen(false)} />
      )}
    </section>
  )
}
