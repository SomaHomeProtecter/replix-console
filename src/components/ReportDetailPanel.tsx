import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  blindMessage, fixSpoilerScore, reopenReport, resolveReport, suspendUser, unblindMessage, warnUser,
} from '../api/admin'
import type { ReportItem, SuspendDuration, WarningReason } from '../api/types'
import { DURATION_LABELS, REASON_LABELS, formatKstShort } from '../format'
import AuthorMessages from './AuthorMessages'
import Avatar from './Avatar'
import SuspendDialog from './SuspendDialog'
import WarningDialog from './WarningDialog'
import type { QueueCommand } from '../queueKeys'

/** 채점 스키마(HP-109)와 같은 범위 — BE가 `@Min(0) @Max(10)`으로 되돌려 보내므로 화면이 먼저 막는다. */
const SCORE_CHOICES = Array.from({ length: 11 }, (_, i) => i)

/**
 * Redis 실황 표기 — null은 이미 사라진 메시지(TTL·삭제)라는 뜻이다(계약).
 *
 * <p>클린봇 차단({@code blocked_*})도 <b>이름을 붙여</b> 준다. 종전에는 폴백으로 원문
 * `blocked_profanity`가 그대로 찍혔는데, 바로 아래 작성자 글 목록은 같은 값을 `클린봇`으로
 * 부른다 — 한 모달 안에서 같은 사실을 두 어휘로 말하는 꼴이었다(이 패널이 스스로 정한 규칙:
 * "같은 사실을 두 화면이 다르게 부르지 않는다").
 */
function liveStatusLabel(currentStatus: string | null): string {
  if (currentStatus === null) return '사라짐(만료·삭제)'
  if (currentStatus === 'blinded') return '가림'
  if (currentStatus === 'visible') return '표시 중'
  if (currentStatus.startsWith('blocked_')) return '클린봇 차단'
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
export default function ReportDetailPanel({
  report, onActionDone, onReportClosed, shortcutCommand = null, onBusyChange,
}: {
  report: ReportItem
  /**
   * 조치 후 부모가 목록을 다시 읽는다. 인자로 <b>결과 문구</b>가 올 수 있다(HP-298 일괄 가림) —
   * 그 문구는 이 패널이 사라진 뒤에도 남아야 해서 페이지가 들고 있는다.
   */
  onActionDone: (notice?: string) => void
  /** 신고를 닫는 조치가 성공했을 때만 호출 — 부모가 모달을 닫고 다음 행에 포커스한다. */
  onReportClosed?: (reportId: number) => void
  /** 상세 모달이 소유한 조치 단축키. 같은 키 연타를 구분하려 sequence를 함께 받는다. */
  shortcutCommand?: QueueCommand | null
  /**
   * 쓰기가 도는 동안 페이지가 모달을 닫지 못하게 한다(HP-298).
   *
   * <p>모달은 백드롭 클릭·Esc·✕로 닫히는데, 쓰기 도중 닫히면 이 패널이 언마운트돼 결과를
   * <b>알릴 곳이 사라진다</b> — 일부 실패한 일괄 가림이 조용히 넘어가면 운영자는 전부 가려진 줄
   * 안다. 백드롭은 특히 잘못 눌리기 쉽다.
   *
   * <p><b>얼마나 잠기나</b>: 요청 하나는 {@code API_TIMEOUT_MS}에 끊긴다. 다만 일괄 가림은
   * 여러 물결로 나뉘어 나가므로 <b>전체는 그 상한의 배수</b>가 될 수 있다(40건이면 7물결).
   * 그래서 자동 상한만 믿지 않고 일괄 가림에 <b>취소</b> 버튼을 둔다 — 갇히는 경우를 없애는 것은
   * 그쪽이다. 부모는 렌더마다 바뀌지 않는 함수를 줘야 한다(setState 함수 등).
   */
  onBusyChange: (busy: boolean) => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  /**
   * 자식(작성자 글 일괄 가림)이 쓰기 중 — 그동안 여기 조치 버튼도 막는다.
   *
   * <p>안 막으면 일괄 가림이 도는 중에 [기각]이 눌려, 한 신고에 "타당해서 가리는 중"과
   * "부당해서 기각"이 동시에 기록된다. 게다가 기각은 신고를 큐에서 빼 이 패널을 언마운트하므로
   * 가림의 성패를 알릴 화면도 함께 사라진다. HP-270의 신고자 기각률은 <b>되돌릴 수 없어</b>
   * 잘못 쌓인 기각 한 건이 그 신고자의 지표를 영구히 오염시킨다.
   *
   * <p>막는 범위는 <b>규칙 하나</b>로 둔다 — 쓰기가 도는 동안에는 다른 쓰기를 시작하지 않는다.
   * 어떤 조합만 예외로 두면 그 예외마다 "이건 왜 되지?"를 다시 따져야 하고, 그 되묻기가 이
   * 화면을 세 라운드 흔든 원인이었다.
   */
  const [bulkBusy, setBulkBusy] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [warningOpen, setWarningOpen] = useState(false)
  /** React가 disabled를 다시 그리기 전의 빠른 연타까지 막는 동기 잠금. */
  const writeLock = useRef(false)
  const consumedCommand = useRef(0)
  /**
   * 운영자가 고른 점수. <b>null = 아직 안 골랐다</b>(화면엔 서버 값이 그대로 보인다).
   *
   * <p>서버 값을 복사해 두지 않는다(2026-08-11 재설계). 종전에는 서버 값을 상태로 복사하고,
   * 거기에 "방금 보낸 값"까지 따로 기억했다. 사실 하나를 세 곳(서버·복사본·보낸 값)에 두니
   * 셋이 어긋나는 조합마다 버그가 났다 — 낡은 복사본이 새 서버 값을 덮거나, 지워지지 않는
   * "보낸 값" 때문에 그 점수로 되돌리는 길이 영영 막히거나. 정본은 {@code report.spoilerScore}
   * 하나이고, 이 상태는 <b>거기서 얼마나 벗어났는가</b>만 들고 있는다.
   */
  const [picked, setPicked] = useState<number | null>(null)
  /** 화면에 선택으로 보이는 값 — 고른 것이 있으면 그것, 없으면 서버가 아는 값. */
  const score = picked ?? report.spoilerScore

  // 비우는 기준이 둘로 갈린다 — 무엇이 바뀌었느냐가 아니라 <b>무엇이 무효가 됐느냐</b>가 기준이다.

  useEffect(() => {
    // 다른 신고로 옮기면 입력·오류·열린 겹은 전부 이전 신고의 것이다.
    // 손으로 쓴 메모가 여기 있는 이유: 메모를 무효로 만드는 것은 '다른 신고'뿐이다.
    setNote('')
    setError(null)
    setDialogOpen(false)
    setWarningOpen(false)
  }, [report.id])

  useEffect(() => {
    // 서버 점수가 바뀌면 고르던 값을 버린다. 점수는 조치의 <b>판단 근거</b>인데, 그 사이
    // 채점 배치나 다른 운영자가 바꿨다면 근거가 달라진 것이다 — 운영자는 8→3을 고친다고
    // 믿지만 실제로는 5→3을 고치게 된다. 근거가 바뀌면 그 근거로 만든 선택도 무효다.
    // 메모는 여기서 건드리지 않는다 — 점수와 무관한 글이라, 채점 한 번에 날아가면 안 된다.
    setPicked(null)
    // currentStatus도 축에 넣는다 — 메시지가 사라지면 고르던 점수의 <b>대상</b>이 없어진 것이다.
    // 점수만 보면 미채점 메시지가 사라지는 경우 null → null이라 아무 일도 안 일어나, 이미 없는
    // 메시지에 대한 선택이 화면에 남는다(4차 리뷰).
  }, [report.id, report.spoilerScore, report.currentStatus])

  /**
   * 쓰기를 새로 시작할 수 없는 상태 — 내 조치가 돌거나({@code busy}) 자식의 일괄 가림이
   * 돌거나({@code bulkBusy}). <b>규칙 하나로 둔다: 쓰기가 도는 동안에는 다른 쓰기를 시작하지
   * 않는다.</b> 어떤 조합만 예외로 두면 그 예외마다 "이건 왜 되지?"를 다시 따져야 한다.
   */
  const locked = busy || bulkBusy

  // 부모(페이지)에게도 같은 사실을 알린다 — 모달이 쓰기 도중 닫히지 않게.
  useEffect(() => { onBusyChange(locked) }, [locked, onBusyChange])
  useEffect(() => () => onBusyChange(false), [onBusyChange])

  const noteOrNull = () => {
    const trimmed = note.trim()
    return trimmed ? trimmed : null
  }

  const run = (work: () => Promise<void>, closesReport = false) => {
    // setBusy는 다음 렌더 전까지 반영되지 않는다. 같은 틱의 클릭/키 입력은 ref로 즉시 막는다.
    if (writeLock.current) return
    writeLock.current = true
    setBusy(true)
    setError(null)
    work()
        .then(() => {
          if (closesReport && onReportClosed) onReportClosed(report.id)
          else onActionDone()
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : String(e))
          // 부분 실패(예: 가림 성공·종결 실패)면 화면이 실상과 어긋난 채 남는다 —
          // 실패해도 다시 읽어 실제 상태를 반영한다(리뷰 m3).
          onActionDone()
        })
        .finally(() => {
          writeLock.current = false
          setBusy(false)
        })
  }

  const blind = () => {
    if (report.source === 'GROUP_ROOM') return
    run(async () => {
      await blindMessage(report.episodeId, report.msgId)
      await resolveReport(report.id, 'RESOLVED', noteOrNull(), 'BLIND')
    }, true)
  }

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
    if (picked === null) return
    run(async () => {
      await fixSpoilerScore(report.episodeId, report.msgId, picked)
      // 보냈으면 선택을 푼다 — 이걸로 "왕복 직후 같은 값으로 한 번 더 눌리는" 창이 닫힌다.
      // 화면의 report.spoilerScore는 재조회가 와야 갱신되지만, 선택이 없으면 버튼은 어차피
      // 비활성이므로 <b>재조회를 기다리지 않아도</b> 중복이 나가지 않는다.
      //
      // 한때 이 창을 busy가 재조회까지 이어지게 해서 닫으려 했는데, 재조회가 펼친 페이지 수만큼
      // 순차 왕복이라 조치 한 번에 패널 전체가 그 사슬 내내 얼었고(한 요청이 멈추면 무기한),
      // 재조회가 실패하면 창이 그대로 다시 열렸다. 화면을 얼리는 대신 선택을 푸는 편이,
      // 성공·실패 어느 쪽에서도 같은 값이 두 번 나가지 않게 하면서 아무것도 막지 않는다.
      setPicked(null)
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

  // 상세 모달 안에서만 도착하는 조치 키. 보조 다이얼로그와 타이핑 경계는 부모가 차단한다.
  useEffect(() => {
    if (!shortcutCommand || shortcutCommand.sequence === consumedCommand.current) return
    consumedCommand.current = shortcutCommand.sequence
    if (locked || dialogOpen || warningOpen) return
    switch (shortcutCommand.key) {
      case 'b':
        if (report.source !== 'GROUP_ROOM') blind()
        break
      case 'n':
        resolveWithoutAction()
        break
      case 'x':
        reject()
        break
      case 's':
        if (report.targetUser && report.targetUser.status !== 'WITHDRAWN') setDialogOpen(true)
        break
    }
  }, [shortcutCommand])

  return (
    <div className="detail-panel">
      <h5 className="side-h">신고 #{report.id} · 스냅샷 원문</h5>
      <blockquote className="snapshot">{report.snapshotMessage}</blockquote>
      <div className="meta-line" title={`msgId ${report.msgId}`}>
        신고 {formatKstShort(report.createdAt)}
        {' '}· 출처 {report.source === 'GROUP_ROOM' ? '그룹방' : '회차'}
        {' '}· ep.{report.episodeId} · 현재 상태 {liveStatusLabel(report.currentStatus)}
        {report.source === 'EPISODE' && <> · 스포일러 점수 {report.spoilerScore ?? '—'}</>}
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
        {/* 작성자 카드에만 있던 상세 진입을 신고자 쪽에도 연다(HP-270) — 신고 남용은
            신고자 화면에서만 판단할 수 있는데 거기 가는 길이 없었다. */}
        {report.reporter && (
          <Link className="btn-link ul" to={`/users/${report.reporter.id}`}>사용자 상세 →</Link>
        )}
      </div>

      {/* 그룹방은 스포일러 채점·공개 작성자 글 조회 대상이 아니다. 신고가 가져온 스냅샷과
          작성자만 보여 주며 방/멤버를 열거하는 새 경로를 만들지 않는다(HP-304). */}
      {report.source === 'EPISODE' && <>
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
                  disabled={locked || report.currentStatus === null}
                  onChange={() => setPicked(n)} />
              <span>{n}</span>
            </label>
          ))}
        </div>
        <button
            type="button" className="btn btn-score"
            // 기준은 하나다 — <b>지금 서버가 아는 값과 다르면</b> 보낼 수 있다. 같은 값이면
            // 감사에 `score=8→8` 한 줄만 쌓여 기록을 흐린다.
            //
            // ⚠️ 왕복 직후 중복을 막는 것은 locked가 아니다 — locked는 쓰기가 끝나는 순간
            // 풀리고(run의 finally) 재조회까지 이어지지 않는다. 그 창을 닫는 것은 아래
            // `picked === report.spoilerScore`와 보낸 뒤의 setPicked(null)이다(fixScore 주석).
            disabled={locked || report.currentStatus === null || picked === null
              || picked === report.spoilerScore}
            onClick={fixScore}>
          점수 정정
        </button>
        </div>

      {/* 작성자가 이 회차에 남긴 다른 글(HP-298) — 조치 그리드 <b>앞</b>에 둔다. 도배인지
          아닌지는 나머지 줄을 봐야 정해지므로 이것도 판단 재료이고, 판단 재료는 조치보다
          위에 온다(점수 줄과 같은 규칙). */}
      {/* key로 신고마다 새로 마운트한다 — 같은 메시지에 신고가 둘일 때 목록이 빈 채 남던
          문제를 구조적으로 없앤다(AuthorMessages의 report prop 주석 참조). */}
        <AuthorMessages
            key={report.id} report={report} busy={busy}
            onActionDone={onActionDone} onBusyChange={setBulkBusy} />
      </>}

      <h5 className="side-h">조치</h5>
      {error && <div className="error-box" role="alert">{error}</div>}
      <div className="acts">
        <button
            type="button" className="btn btn-blind"
            disabled={locked || report.source === 'GROUP_ROOM'}
            title={report.source === 'GROUP_ROOM' ? '그룹방 메시지는 가림 대상이 아닙니다' : undefined}
            onClick={blind}>가림</button>
        <button
            type="button" className="btn btn-warn"
            disabled={locked || report.source === 'GROUP_ROOM'
              || !report.targetUser || report.targetUser.status === 'WITHDRAWN'}
            title={report.source === 'GROUP_ROOM' ? '그룹방 신고는 정지·종결·기각으로 처리합니다'
              : report.targetUser?.status === 'WITHDRAWN' ? '탈퇴한 계정에는 조치할 수 없습니다' : undefined}
            onClick={() => setWarningOpen(true)}>
          경고…
        </button>
        <button
            type="button" className="btn btn-susp"
            // WITHDRAWN은 BE가 409로 거부한다 — 다이얼로그까지 갔다 실패하지 않게 미리 막는다(리뷰 m6)
            disabled={locked || !report.targetUser || report.targetUser.status === 'WITHDRAWN'}
            title={report.targetUser?.status === 'WITHDRAWN' ? '탈퇴한 계정에는 조치할 수 없습니다' : undefined}
            onClick={() => setDialogOpen(true)}>
          계정 정지…
        </button>
        {/* "조치 없음"은 별개 상태 이름이라 기각 버튼에 괄호로 붙어 있으면 둘이 뒤섞여 읽힌다 */}
        <button type="button" className="btn" disabled={locked} onClick={resolveWithoutAction}>
          조치 없이 종결
        </button>
        <button type="button" className="btn" disabled={locked} onClick={reject}>기각</button>
      </div>

      <label className="note-in">
        <textarea
            aria-label="처리 메모" rows={2} maxLength={500} value={note}
            placeholder="처리 메모 (감사 로그에 남습니다)"
            onChange={(e) => setNote(e.target.value)} />
      </label>

      <div className="hist">
        {/* 목록의 "묶음 ×N" 칩은 <b>열린</b> 신고를, 여기 "신고 N건"은 <b>누계</b>를 센다.
            둘이 다른 수를 말하면서 어느 쪽이 무엇인지 화면에 없으면, 같은 신고에서 2와 5를 본
            운영자가 무엇을 믿을지 알 수 없다 — 다를 때만 둘을 함께 밝힌다(같으면 군더더기). */}
        <span>같은 메시지 신고 <b>{report.sameMessageReportCount}건</b>
          {typeof report.openReportCount === 'number'
            && report.openReportCount !== report.sameMessageReportCount
            && ` (열림 ${report.openReportCount}건)`}</span>
        {report.currentStatus === 'blinded' && (
          <> · <button type="button" className="btn-link" disabled={locked} onClick={unblind}>가림 해제</button></>
        )}
        {/* 재오픈은 종결된 신고에만, 그리고 명시적으로만(HP-268) — 가림 해제가 자동으로 하던 일을
            운영자 판단으로 옮겼다. 되돌리는 행위와 다시 심사하는 판단은 별개다. */}
        {report.status !== 'OPEN' && (
          <> · <button type="button" className="btn-link" disabled={locked} onClick={reopen}>신고 재오픈</button></>
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
            busy={locked}
            onConfirm={suspend}
            onCancel={() => setDialogOpen(false)} />
      )}
      {warningOpen && report.targetUser && (
        <WarningDialog
            targetName={report.targetUser.displayName ?? `#${report.targetUser.id}`}
            busy={locked}
            onConfirm={(reason: WarningReason, warningNote: string | null) => {
              setWarningOpen(false)
              run(async () => { await warnUser(report.targetUser!.id, reason, warningNote) })
            }}
            onCancel={() => setWarningOpen(false)} />
      )}
    </div>
  )
}
