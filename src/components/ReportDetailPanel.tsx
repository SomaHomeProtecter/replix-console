import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  blindMessage, fixSpoilerScore, reopenReport, resolveReport, suspendUser, unblindMessage,
} from '../api/admin'
import type { ReportItem, SuspendDuration } from '../api/types'
import { DURATION_LABELS, REASON_LABELS, formatKstShort } from '../format'
import { isTypingTarget, shortcutKey } from '../queueKeys'
import Avatar from './Avatar'
import SuspendDialog from './SuspendDialog'

/** 채점 스키마(HP-109)와 같은 범위 — BE가 `@Min(0) @Max(10)`으로 되돌려 보내므로 화면이 먼저 막는다. */
const SCORE_CHOICES = Array.from({ length: 11 }, (_, i) => i)

/** Redis 실황 표기 — null은 이미 사라진 메시지(TTL·삭제)라는 뜻이다(계약). */
function liveStatusLabel(currentStatus: string | null): string {
  if (currentStatus === null) return '사라짐(만료·삭제)'
  if (currentStatus === 'blinded') return '가림'
  if (currentStatus === 'visible') return '표시 중'
  return currentStatus
}

/**
 * 우측 상세 패널(시안 cm-side) — 스냅샷 원문(호박색 인용) + 메타 한 줄 + 대상 카드 +
 * 조치 2×2 그리드([가림][계정 정지…] / [조치 없이 종결][기각]) + 처리 메모 + 집계·처리 이력.
 * 조치는 신고 종결까지 한 번에 간다: 가림 = blind→RESOLVED, 정지 = suspend→RESOLVED,
 * 기각 = REJECTED. 재종결은 BE가 멱등(마지막 판정 갱신)이라 종결분에도 버튼을 남겨 둔다.
 * [가림 해제]·[신고 재오픈]은 시안 3버튼 밖의 보조 기능 — 오조치 복구 동선이 없으면 콘솔이
 * 반쪽이다. 둘은 <b>서로 독립</b>이다(HP-268): 가림 해제는 메시지만 풀고, 신고를 큐로 되돌리는
 * 것은 재오픈 버튼이 한다. 종전에는 가림 해제가 재오픈까지 자동으로 해 "판정"과 "제재 상태"가
 * 엉켰다 — 자세한 근거는 {@code unblind} 주석.
 */
export default function ReportDetailPanel({ report, onActionDone, onNavigate }: {
  report: ReportItem
  /**
   * 조치가 끝났다 — {@code closed}는 <b>이 조치로 신고가 실제로 닫혔는지</b>다. 페이지가 그걸
   * 보고 다음 건으로 넘길지 정한다(HP-295). 점수 정정·가림 해제처럼 신고를 닫지 않는 조치는
   * false여서, 고쳐 놓고 화면이 제멋대로 다음 건으로 넘어가지 않는다.
   */
  onActionDone: (closed: boolean) => void
  /** 모달을 연 채 앞뒤 건으로 이동(J/K). 페이지가 목록을 알고 있으므로 위임한다. */
  onNavigate?: (delta: number) => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [score, setScore] = useState<number | null>(report.spoilerScore)
  /**
   * 방금 정정해 보낸 값. {@code busy}는 왕복이 끝나면 바로 풀리는데 {@code report.spoilerScore}는
   * 재조회가 와야 갱신되므로, 그 사이 버튼이 다시 활성이 되어 같은 값으로 한 번 더 눌리면
   * 감사에 <b>{@code score=3→3}</b>이 남는다 — 그 창을 이 값으로 덮는다(2026-08-11 리뷰).
   */
  const [sentScore, setSentScore] = useState<number | null>(null)
  /**
   * 신고별 미저장 초안(메모·고른 점수). J/K로 옮기면 아래 [report.id] 효과가 상태를 초기화해
   * <b>쓰던 메모와 고른 정정이 경고도 없이 사라졌다</b>. 나갈 때 담아 두고 돌아오면 되살린다.
   */
  const draftsRef = useRef<Record<number, { note: string; score: number | null }>>({})
  const noteRef = useRef(note)
  const scoreRef = useRef(score)
  noteRef.current = note
  scoreRef.current = score

  useEffect(() => {
    // 다른 신고로 옮기면 입력·오류는 이전 것이므로 비우되, 그 신고의 초안이 있으면 되살린다.
    const id = report.id
    const draft = draftsRef.current[id]
    setNote(draft?.note ?? '')
    setScore(draft ? draft.score : report.spoilerScore)
    setError(null)
    setDialogOpen(false)
    setSentScore(null)
    // 정리 함수가 <b>먼저</b> 돌아 떠나는 신고의 초안을 담는다. 최신값을 ref로 읽는 이유는
    // 클로저가 이 렌더 시점 값에 갇혀 있어서다.
    return () => { draftsRef.current[id] = { note: noteRef.current, score: scoreRef.current } }
    // report.spoilerScore는 의도적으로 의존성에서 뺀다 — 재조회로 같은 신고가 새 객체로 와도
    // 운영자가 고르던 점수를 되돌리지 않는다(선택은 화면의 상태지 서버의 상태가 아니다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id])

  const noteOrNull = () => {
    const trimmed = note.trim()
    return trimmed ? trimmed : null
  }

  const run = (work: () => Promise<void>, closes = false) => {
    setBusy(true)
    setError(null)
    work()
        .then(() => onActionDone(closes))
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : String(e))
          // 부분 실패(예: 가림 성공·종결 실패)면 화면이 실상과 어긋난 채 남는다 —
          // 실패해도 다시 읽어 실제 상태를 반영한다(리뷰 m3). 다만 <b>넘어가지는 않는다</b>:
          // 실패한 건을 화면에서 치우면 운영자가 못 봤다는 사실째로 사라진다.
          onActionDone(false)
        })
        .finally(() => setBusy(false))
  }

  const blind = () => run(async () => {
    await blindMessage(report.episodeId, report.msgId)
    await resolveReport(report.id, 'RESOLVED', noteOrNull(), 'BLIND')
  }, true)

  const reject = () => run(async () => {
    await resolveReport(report.id, 'REJECTED', noteOrNull(), null)
  }, true)

  /**
   * 조치 없이 종결(HP-268) — 신고는 타당하나 가림·정지까지는 하지 않고 닫는다.
   *
   * <p>이 버튼이 없던 동안에는 그런 신고도 <b>기각</b>으로 닫을 수밖에 없었다. 그런데
   * HP-270이 <b>신고자별 기각률</b>을 남용 판별 지표로 쓸 예정이라, 타당한 신고가 기각으로
   * 쌓이면 그 신고자의 기각률이 부당하게 올라간다 — 그리고 <b>나중에 버튼을 추가해도 이미
   * 쌓인 기록은 되돌릴 수 없다.</b> 지표를 만들기 전에 어휘를 정확히 해두는 것이 순서다.
   *
   * <p>"경고"라 부르지 않는 이유: 사용자에게 아무것도 전달되지 않는다. 경고라 적으면 화면이
   * 거짓말을 한다.
   */
  const resolveWithoutAction = () => run(async () => {
    await resolveReport(report.id, 'RESOLVED', noteOrNull(), null)
  }, true)

  /**
   * 가림 해제 — 메시지만 푼다. <b>신고 상태는 건드리지 않는다.</b>
   *
   * <p>2026-08-05 김지호 결정으로 자동 재오픈을 뗐다. 종전에는 가림을 풀면 신고가 큐로 돌아갔는데,
   * 그 결과 <b>가림 해제만 신고 상태를 건드리고 정지 해제·기각 번복은 안 건드리는</b> 비대칭이 생겨
   * "종결"이 판정인지 제재 스위치인지 모호해졌다.
   *
   * <p>기준은 {@code AdminAction.outcome}을 시점 값으로 박은 것과 같다 — <b>판정은 시점 사실,
   * 조치 상태는 현재 사실이고 둘을 섞지 않는다.</b> 큐는 "아직 안 본 신고"를 담는 곳인데, 가림을
   * 풀었다고 그 신고를 안 본 것이 되지는 않는다. 실제 가림 여부는 큐 행의 "현재 상태"가 따로 보여준다.
   *
   * <p>재오픈이 필요하면 아래 "신고 재오픈" 버튼으로 명시적으로 한다 — 되돌리는 행위와 다시 심사하는
   * 판단은 별개다.
   */
  const unblind = () => run(async () => {
    await unblindMessage(report.episodeId, report.msgId)
  })

  /** 판정을 되돌려 큐로 보낸다 — 운영자가 명시적으로 누를 때만(자동 아님). */
  const reopen = () => run(async () => {
    await reopenReport(report.id)
  })

  /**
   * 점수 정정(HP-294) — 메시지는 괜찮은데 <b>점수만 틀린</b> 건을 고친다.
   *
   * <p>이 손이 없던 동안 스포일러 신고의 선택지는 가림 아니면 기각뿐이었다. 점수는 Bedrock
   * 비동기 채점이라 오탐이 나고, 높은 점수는 확장에서 블러 처리되므로 <b>오탐이 멀쩡한 대화를
   * 가린다</b>. 신고를 종결하지는 않는다 — 점수를 고친 것과 신고를 어떻게 닫을지는 별개 판단이다.
   */
  const fixScore = () => {
    if (score === null) return
    run(async () => {
      await fixSpoilerScore(report.episodeId, report.msgId, score)
      setSentScore(score)
    })
  }

  const suspend = (duration: SuspendDuration, reason: string) => {
    const target = report.targetUser
    if (!target) return
    setDialogOpen(false)
    run(async () => {
      await suspendUser(target.id, duration, reason)
      // 처리 메모가 비어 있으면 감사 추적이 이어지도록 정지 내용을 자동 메모로 남긴다
      await resolveReport(report.id, 'RESOLVED',
          noteOrNull() ?? `계정 정지(${DURATION_LABELS[duration]}) — ${reason}`, 'SUSPEND')
    }, true)
  }

  const canSuspend = !!report.targetUser && report.targetUser.status !== 'WITHDRAWN'

  /**
   * 큐 단축키(HP-295) — 조치가 끝나면 손이 마우스로 돌아가지 않게 한다.
   *
   * <p>의존성 배열을 두지 않아 렌더마다 다시 건다: 아래 조치 함수들은 렌더마다 새로 만들어지므로
   * 배열로 묶으면 낡은 클로저가 옛 신고에 조치를 날린다.
   *
   * <p><b>S는 다이얼로그를 여는 데까지만</b> 한다 — 파괴적 조치는 확인 한 겹을 남긴다.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 함정 ②: 확인 겹이 떠 있는 동안 뒤의 큐가 움직이면 확인의 의미가 사라진다
      if (dialogOpen || busy) return
      // 함정 ③: 메모에 "b"를 치는 순간 메시지가 가려지면 안 된다
      if (isTypingTarget(e.target)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const key = shortcutKey(e)
      // 이동은 눌러 두고 훑어도 되지만 조치는 아니다 — OS 키 반복이 ~30ms마다 keydown을 쏘고
      // 그 사이 busy가 풀리며 선택이 다음 건으로 옮겨 가, 화면에 뜬 적도 없는 신고까지 줄줄이
      // 닫힌다(2026-08-11 리뷰 실측: X 한 번 눌러 두니 5건 기각). 조치 키만 반복을 막는다.
      const navigating = key === 'j' || key === 'k'
      if (e.repeat && !navigating) return
      switch (key) {
        case 'b': e.preventDefault(); blind(); break
        case 'n': e.preventDefault(); resolveWithoutAction(); break
        case 'x': e.preventDefault(); reject(); break
        case 's': if (canSuspend) { e.preventDefault(); setDialogOpen(true) } break
        case 'j': e.preventDefault(); onNavigate?.(1); break
        case 'k': e.preventDefault(); onNavigate?.(-1); break
        default: break
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return (
    <div className="detail-panel">
      <h5 className="side-h">신고 #{report.id} · 스냅샷 원문</h5>
      <blockquote className="snapshot">{report.snapshotMessage}</blockquote>
      <div className="meta-line" title={`msgId ${report.msgId}`}>
        신고 {formatKstShort(report.createdAt)}
        {' '}· 회차 ep.{report.episodeId} · 현재 상태 {liveStatusLabel(report.currentStatus)}
        {' '}· 스포일러 점수 {report.spoilerScore ?? '—'}
      </div>
      {report.detail && (
        <div className="meta-line">신고 사유({REASON_LABELS[report.reason]}) — {report.detail}</div>
      )}

      {report.targetUser ? (
        <div className="target-card">
          <Avatar
              url={report.targetUser.profileImageUrl}
              name={report.targetUser.displayName} />
          <span className="un">{report.targetUser.displayName ?? `#${report.targetUser.id}`}</span>
          <Link className="btn-link ul" to={`/users/${report.targetUser.id}`}>사용자 상세 →</Link>
        </div>
      ) : (
        <div className="target-card"><span className="hint">대상 사용자 정보 없음</span></div>
      )}

      {/* 신고자도 작성자와 같은 카드로 읽는다(HP-268) — 종전에는 메타 줄 안에 이름만 섞여 있어
          당사자 둘을 나란히 보기 어려웠고, 거기에 아바타를 끼우면 줄이 넘쳐 뒤가 잘렸다.
          반복 신고자를 알아보는 데는 이름보다 얼굴이 빠르다(HP-270 남용 대응의 선행). */}
      <div className="target-card reporter-card">
        <Avatar
            url={report.reporter?.profileImageUrl ?? null}
            name={report.reporter?.displayName ?? null} />
        <span className="un">{report.reporter?.displayName ?? '(알 수 없음)'}</span>
        <span className="role">신고자</span>
      </div>

      {/* 판단 재료(점수)와 조치를 같은 눈높이에 둔다 — 점수 줄이 조치 그리드 바로 위다(HP-294). */}
      <h5 className="side-h">스포일러 점수</h5>
      <div className="score-row">
        <span className="score-now">{report.spoilerScore ?? '—'}</span>
        <span className="score-arrow" aria-hidden="true">→</span>
        <div className="score-picker" role="radiogroup" aria-label="정정할 스포일러 점수">
          {SCORE_CHOICES.map((n) => (
            <label key={n} className={`score-chip${score === n ? ' on' : ''}`}>
              <input
                  type="radio" name={`spoiler-score-${report.id}`} value={n}
                  checked={score === n}
                  // 사라진 메시지는 BE가 404로 되돌려 보낸다 — 눌러 보고 실패하지 않게 미리 막는다
                  disabled={busy || report.currentStatus === null}
                  onChange={() => setScore(n)} />
              <span>{n}</span>
            </label>
          ))}
        </div>
        <button
            type="button" className="btn btn-score"
            // 같은 값으로 정정하면 감사에 `score=8→8` 한 줄만 쌓인다 — 기록을 흐린다
            // 서버가 아는 값 = 방금 보낸 값(재조회 전) ?? 마지막으로 읽어 온 값
            disabled={busy || report.currentStatus === null || score === null
              || score === (sentScore ?? report.spoilerScore)}
            onClick={fixScore}>
          점수 정정
        </button>
      </div>

      <h5 className="side-h">조치</h5>
      {error && <div className="error-box" role="alert">{error}</div>}
      <div className="acts">
        <button type="button" className="btn btn-blind" disabled={busy} onClick={blind}>가림</button>
        <button
            type="button" className="btn btn-susp"
            // WITHDRAWN은 BE가 409로 거부한다 — 다이얼로그까지 갔다 실패하지 않게 미리 막는다(리뷰 m6)
            disabled={busy || !report.targetUser || report.targetUser.status === 'WITHDRAWN'}
            title={report.targetUser?.status === 'WITHDRAWN' ? '탈퇴한 계정에는 조치할 수 없습니다' : undefined}
            onClick={() => setDialogOpen(true)}>
          계정 정지…
        </button>
        {/* "조치 없음"은 별개 상태 이름이라 기각 버튼에 괄호로 붙어 있으면 둘이 뒤섞여 읽힌다 */}
        <button type="button" className="btn" disabled={busy} onClick={resolveWithoutAction}>
          조치 없이 종결
        </button>
        <button type="button" className="btn" disabled={busy} onClick={reject}>기각</button>
      </div>

      <label className="note-in">
        <textarea
            aria-label="처리 메모" rows={2} maxLength={500} value={note}
            placeholder="처리 메모 (감사 로그에 남습니다)"
            onChange={(e) => setNote(e.target.value)} />
      </label>

      <div className="hist">
        <span>같은 메시지 신고 <b>{report.sameMessageReportCount}건</b></span>
        {report.currentStatus === 'blinded' && (
          <> · <button type="button" className="btn-link" disabled={busy} onClick={unblind}>가림 해제</button></>
        )}
        {/* 재오픈은 종결된 신고에만, 그리고 명시적으로만(HP-268) — 가림 해제가 자동으로 하던 일을
            운영자 판단으로 옮겼다. 되돌리는 행위와 다시 심사하는 판단은 별개다. */}
        {report.status !== 'OPEN' && (
          <> · <button type="button" className="btn-link" disabled={busy} onClick={reopen}>신고 재오픈</button></>
        )}
        {/* 아래 처리 정보는 조치 이력 라벨과 같은 어휘를 쓴다(HP-268) —
            같은 사실을 두 화면이 다르게 부르지 않는다 */}
        {report.handledBy && (
          <><br />{report.status === 'REJECTED' ? '기각'
            : report.resolvedAction === 'BLIND' ? '가림'
            : report.resolvedAction === 'SUSPEND' ? '정지' : '조치 없음'}
          : <b>{report.handledBy.displayName}</b> · {formatKstShort(report.handledAt)}
            {report.resolutionNote ? ` · ${report.resolutionNote}` : ''}</>
        )}
      </div>

      {dialogOpen && report.targetUser && (
        <SuspendDialog
            targetName={report.targetUser.displayName ?? `#${report.targetUser.id}`}
            busy={busy}
            onConfirm={suspend}
            onCancel={() => setDialogOpen(false)} />
      )}
    </div>
  )
}
