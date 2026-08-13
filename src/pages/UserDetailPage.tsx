import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { effectiveActions, mergeSuspendResolve } from '../actionHistory'
import { getUserDetail, suspendUser, unsuspendUser } from '../api/admin'
import type { SuspendDuration, UserDetail, UserStatus } from '../api/types'
import Avatar from '../components/Avatar'
import Pill from '../components/Pill'
import SuspendDialog from '../components/SuspendDialog'
import {
  actionLabel, formatKstShort, isSuspensionActive, reporterTrustLine, suspensionChip, withRo,
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
  const location = useLocation()
  const id = Number(userId)
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('reports')
  // 기본은 끔(전량) — 조치 이력은 감사 기록이라 "무엇이 있었나"가 정본이고,
  // 숨김은 "지금 뭐가 걸려 있나"를 볼 때의 보조 뷰다(HP-268).
  const [effectiveOnly, setEffectiveOnly] = useState(false)

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

  // 상세로 오는 길이 셋이라(신고 큐·정지 현황판·조치 로그) 돌아가는 길을 하나로 굳히면
  // 온 곳이 아닌 데로 되돌려보낸다. 보낸 화면이 state로 알려 주면 그리로 돌린다.
  const origin = location.state as { from?: string; label?: string } | null
  const back = origin?.from && origin.label
      ? { to: origin.from, label: origin.label }
      : { to: '/', label: '신고 큐' }

  if (error && !detail) {
    return (
      <section className="user-detail" aria-label="사용자 상세">
        <div className="back-row"><Link className="btn-link" to={back.to}>← {withRo(back.label)}</Link></div>
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
      <div className="back-row"><Link className="btn-link" to={back.to}>← {withRo(back.label)}</Link></div>
      <div className="user-header">
        <Avatar url={profile.profileImageUrl} name={name} />
        <div>
          <h1>
            {name}
            <span className={CHIP_CLASSES[profile.status]}>
              {suspensionChip(profile.status, profile.suspendedUntil)}
            </span>
          </h1>
          <div className="uid">userId {profile.id} · provider {profile.authProvider}</div>
          {/* 보낸 신고 집계(HP-270) — 받은 신고 탭과 <b>반대 축</b>이라 라벨 없이는 어느 쪽
              수인지 알 수 없다. 정지 여부를 인상이 아니라 이 수로 판단하라는 자리다. */}
          <div className="sent-trust">{reporterTrustLine(detail.reportsSent)}</div>
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

      {/* 기본 정보는 헤더 아래 가로 스트립(HP-268) — 좌측 240px 칸에선 이메일이 두 줄로 접혔고,
          칸을 넓히면 그만큼 조치 이력이 좁아져 돌려막기가 됐다. 항목이 다섯뿐이라 한 줄로 펴면
          이메일이 한 줄에 들어가고 탭이 화면 전체 폭을 쓴다(조치 이력 5칼럼의 전제). */}
      <dl className="info-strip">
        <div><dt>가입일</dt><dd>{formatKstShort(profile.createdAt)}</dd></div>
        <div><dt>상태</dt><dd>{profile.status}</dd></div>
        {profile.suspendReason && (
          <div><dt>정지 사유</dt><dd>{profile.suspendReason}</dd></div>
        )}
        <div><dt>마지막 변경</dt><dd>{formatKstShort(profile.updatedAt)}</dd></div>
        <div><dt>이메일</dt><dd>{profile.email ?? '—'}</dd></div>
      </dl>

      <div className="user-columns">
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
            const all = tab === 'actions' ? detail.actions : detail.suspensions
            // 정지의 "적용 중" 판정은 감사 상쇄가 아니라 계정의 현재 상태로 한다 — 기간 만료는
            // 해제 행을 남기지 않아 상쇄로는 영영 안 걸러진다(HP-268).
            const rows = effectiveOnly
              ? effectiveActions(all, isSuspensionActive(profile.status, profile.suspendedUntil))
              : all
            const hidden = all.length - rows.length
            // "유효 조치"는 그것만 봐서는 무슨 뜻인지 알 수 없다(2026-08-05 김지호 피드백) —
            // 이름을 동작 그대로 바꾸고, 무엇을 숨기는지 한 줄로 밝힌다.
            const toggle = (
              <div className="eff-row">
                <div className="eff-main">
                  <label>
                    <input
                        type="checkbox" aria-label="지금 적용 중인 조치만 보기" checked={effectiveOnly}
                        onChange={(e) => setEffectiveOnly(e.target.checked)} />
                    지금 적용 중인 조치만 보기
                  </label>
                  {/* 이력이 조용히 줄면 기록이 사라진 줄 안다 — 몇 건을 왜 감췄는지 밝힌다 */}
                  {effectiveOnly && hidden > 0 && (
                    <span className="hidden-count">되돌려진 {hidden}건 숨김</span>
                  )}
                </div>
                {/* 역쌍을 툴팁이 아니라 화면에 적는다 — 아무도 안 올리는 툴팁은 설명이 아니다 */}
                <p className="eff-hint">
                  되돌려진 조치를 짝지어 숨깁니다 (가림↔해제 · 정지↔해제 · 종결↔재오픈)
                </p>
              </div>
            )
            if (all.length === 0) {
              return <div className="empty-hint">기록이 없습니다</div>
            }
            return rows.length === 0
              ? <>{toggle}<div className="empty-hint">지금 적용 중인 조치가 없습니다</div></>
              : (
                <>
                  {toggle}
                  {/* 대상과 사유를 나눈다(HP-268) — 머리글은 "대상 · 사유"인데 한 칸에 발췌와
                      사유가 섞여 머리글과 내용이 어긋났다. 나누면 행마다 같은 자리에 같은 종류가
                      와서 세로로 훑을 수 있다. */}
                  <div className="evrow act head2">
                    <span>시각</span><span>조치</span><span>대상</span><span>사유</span><span>처리자</span>
                  </div>
                  {mergeSuspendResolve(rows).map(({ row: a, suspend }) => (
                    <div className="evrow act" key={a.id}>
                      <span className="t">{formatKstShort(a.createdAt)}</span>
                      {/* 종결은 결과까지 붙여 `<조치> · 신고 종결` 한 규칙으로 읽힌다(HP-268).
                          정지로 종결한 건은 정지 행과 한 줄로 합쳐도 라벨은 같다 — 합침은 줄 수의
                          문제이지 이름의 문제가 아니다. */}
                      <span className="alabel">{actionLabel(a.action, a.outcome)}</span>
                      {/* 어떤 신고에 대한 조치인지 발췌로 직관 표기(2026-08-05 E2E 피드백 2회) */}
                      <span className="tgt">
                        {a.targetType === 'REPORT'
                          ? <span title={`신고 #${a.targetId}`}>“{a.targetSummary ?? `신고 #${a.targetId}`}”</span>
                          : <span className="who2">이 사용자</span>}
                      </span>
                      {/* 합친 줄은 정지 사유를 먼저 — "왜 정지했나"가 종결 메모보다 구체적이다.
                          둘이 다르면 종결 메모도 함께 남긴다(합치면서 잃는 정보가 없어야 한다). */}
                      <span className="who2">
                        {[suspend?.reason, a.reason !== suspend?.reason ? a.reason : null]
                            .filter(Boolean).join(' · ') || '—'}
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
