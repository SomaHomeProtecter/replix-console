import { useCallback, useEffect, useRef, useState } from 'react'
import { blindMessage, listAuthorMessages } from '../api/admin'
import type { AuthorMessage, ReportItem } from '../api/types'

/**
 * 이미 사용자에게 안 보이는 상태와 그 이유(HP-298). Redis {@code status}는 네 값이다 —
 * {@code visible} · {@code blocked_profanity} · {@code blocked_hate}(클린봇 차단, ChatService) ·
 * {@code blinded}(운영자 가림). <b>blinded만 보면 클린봇이 막은 줄이 손 안 댄 글처럼 보여</b>
 * 운영자가 다시 골라 가리게 되고, 뜻 없는 감사 행만 쌓인다.
 */
const HIDDEN_LABELS: Record<string, string> = {
  blinded: '가림',
  blocked_profanity: '클린봇',
  blocked_hate: '클린봇',
}

/**
 * 작성자 글 일괄 보기·가림(HP-298).
 *
 * <p>도배·광고는 한 사람이 짧은 시간에 여러 줄을 쏟는 형태인데, 신고는 그중 <b>눈에 걸린 한
 * 줄</b>만 올라온다. 콘솔은 그 한 줄만 가릴 수 있었고 나머지 아홉 줄은 그대로 남았다.
 *
 * <p><b>전체 선택을 기본값으로 두지 않는다</b>(티켓 주의). 신고된 줄만 미리 체크하고 나머지는
 * 운영자가 눈으로 고른다 — 기본이 전체면 확인 없이 누르는 쪽으로 기울고, 그 순간 이 화면은
 * 판단 도구가 아니라 일괄 삭제 버튼이 된다. 도배 판정은 사람이 한다.
 *
 * <p><b>가림은 고른 건마다 단건 API를 부른다.</b> 일괄 엔드포인트를 만들면 감사가 한 행으로
 * 뭉쳐지는데, "모든 2xx 쓰기 조치가 1행씩 남긴다"는 {@code AdminAction} 원칙은 3인이 같은
 * admin 권한을 공유하는 한 되돌림 판단의 유일한 근거다.
 */
export default function AuthorMessages({
  report, busy, reloadKey, onWorkingChange, onActionDone,
}: {
  report: ReportItem
  /** 부모(상세 패널)가 다른 조치를 진행 중 — 그동안 여기서도 새 조치를 받지 않는다. */
  busy: boolean
  /**
   * 부모가 조치를 끝낼 때마다 올리는 값 — 이 목록도 함께 낡기 때문이다. 부모가 가림·해제를
   * 하면 같은 화면이 한 메시지에 대해 두 상태를 말하게 된다(메타 줄은 '표시 중', 목록은 '가림').
   */
  reloadKey: number
  /** 일괄 가림 중임을 부모에게 알린다 — 부모의 "한 번에 한 조치" 잠금에 합류하기 위함. */
  onWorkingChange: (working: boolean) => void
  onActionDone: () => void
}) {
  const authorId = report.targetUser?.id ?? null
  const [rows, setRows] = useState<AuthorMessage[]>([])
  const [total, setTotal] = useState(0)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  /**
   * 오류를 <b>두 칸으로 나눈다</b>. 하나로 두면 가림 뒤 재조회가 방금 띄운 실패 문구를 지워
   * "일부 실패"가 조용히 사라진다 — 운영자는 전부 가려진 줄 안다. 목록을 못 읽은 것과
   * 조치가 일부 실패한 것은 서로 다른 사실이라, 한쪽이 다른 쪽을 덮으면 안 된다.
   */
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  /**
   * 경합 가드 — 부모 {@code ReportQueuePage.load}와 같은 패턴이다(거기 주석: "경합 가드").
   * 신고를 빠르게 옮기면 두 조회가 겹치는데, 늦게 도착한 <b>이전</b> 신고의 응답이 지금 신고의
   * 목록과 미리 체크된 msgId를 덮어쓴다. 그 상태로 가림을 누르면 운영자가 본 적 없는 남의 글이
   * 가려진다. {@code alive}는 언마운트(모달 닫힘) 뒤 상태 갱신을 막는다.
   */
  const seq = useRef(0)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const load = useCallback(async () => {
    if (authorId === null) return
    const mine = ++seq.current
    setLoading(true)
    setLoadError(null)
    try {
      const page = await listAuthorMessages(report.episodeId, authorId, report.msgId)
      if (!alive.current || mine !== seq.current) return
      setRows(page.rows)
      setTotal(page.total)
      // 신고로 올라온 줄만 미리 고른다. 이미 가려졌거나 클린봇이 막은 것은 고르지 않는다 —
      // 다시 가려도 상태는 그대로고 감사에 뜻 없는 행만 쌓인다.
      const reported = page.rows.find(
          (r) => r.msgId === report.msgId && r.status === 'visible')
      setPicked(new Set(reported ? [reported.msgId] : []))
    } catch (e) {
      if (!alive.current || mine !== seq.current) return
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      if (alive.current && mine === seq.current) setLoading(false)
    }
  }, [report.episodeId, report.msgId, authorId])

  /**
   * 다른 신고로 옮기면 <b>새 응답을 기다리지 않고 즉시</b> 비운다. 남겨 두면 새 목록이 올
   * 때까지(조회가 실패하면 영영) 이전 작성자의 글이 체크된 채 떠 있고, 그 상태에서 누른
   * 가림은 지금 신고와 무관한 메시지로 나간다. 실패 배너도 함께 지운다 — 아무 조치도 하지
   * 않은 신고에 앞 신고의 실패 문구가 남으면 안 된다.
   */
  useEffect(() => {
    setRows([])
    setTotal(0)
    setPicked(new Set())
    setActionError(null)
  }, [report.id])

  // reloadKey는 부모 조치 후 재조회 신호다(위 prop 주석 참조).
  useEffect(() => { void load() }, [load, reloadKey])

  const toggle = (msgId: string) => setPicked((prev) => {
    const next = new Set(prev)
    if (!next.delete(msgId)) next.add(msgId)
    return next
  })

  /**
   * 고른 건을 하나씩 가린다. <b>하나가 실패해도 나머지를 멈추지 않는다</b> — 가림은 건별로
   * 확정되므로 앞선 성공을 되돌릴 수 없고, 중간에 멈추면 어디까지 됐는지도 알기 어렵다.
   * 실패 건수는 화면에 적는다: 조용히 넘어가면 운영자는 전부 가려진 줄 안다.
   *
   * <p><b>재조회가 커밋될 때까지 잠금을 유지한다.</b> 먼저 풀면 {@code picked}가 아직 낡은 채로
   * 버튼이 열려, 한 번 더 누르면 이미 가린 건에 또 요청이 나가고 감사에 중복 BLIND 행이 쌓인다.
   */
  const blindPicked = () => {
    if (picked.size === 0) return
    setWorking(true)
    onWorkingChange(true)
    setActionError(null)
    const targets = [...picked]
    void Promise.allSettled(targets.map((msgId) => blindMessage(report.episodeId, msgId)))
        .then(async (results) => {
          const failed = results.filter((r) => r.status === 'rejected').length
          // 언마운트(모달 닫힘) 뒤에는 알릴 화면이 없다 — 상태를 건드리지 않고 조용히 끝낸다.
          if (alive.current && failed > 0) {
            setActionError(`${targets.length}건 중 ${failed}건 실패했습니다`)
          }
          // 성공분을 화면에 반영하려면 다시 읽어야 한다 — 낙관적으로 고쳐 쓰면 실패분과 어긋난다.
          await load()
          if (alive.current) setWorking(false)
          onWorkingChange(false)
          onActionDone()
        })
  }

  if (authorId === null) {
    return <div className="hint">작성자 정보가 없어 글을 모아 볼 수 없습니다</div>
  }

  return (
    <div className="author-msgs">
      <h5 className="side-h">
        이 회차 이 사용자 메시지
        {total > rows.length && (
          // 조용히 자르면 "이게 전부"로 읽혀 남은 도배를 놓친다
          <span className="hint"> — {total}건 중 {rows.length}건만 표시</span>
        )}
      </h5>
      {actionError && <div className="error-box" role="alert">{actionError}</div>}
      {loadError && <div className="error-box" role="alert">{loadError}</div>}
      {loading && rows.length === 0 && <div className="hint">불러오는 중…</div>}
      {!loading && rows.length === 0 && !loadError && (
        <div className="hint">이 회차에 남긴 글이 없습니다</div>
      )}
      {rows.length > 0 && (
        <ul className="msg-picks">
          {rows.map((row) => {
            const hiddenLabel = HIDDEN_LABELS[row.status]
            return (
              <li key={row.msgId} className={hiddenLabel ? 'blinded' : undefined}>
                <label>
                  <input
                      type="checkbox"
                      checked={picked.has(row.msgId)}
                      // 이미 안 보이는 글은 고를 것이 없다(재가림은 감사에 뜻 없는 행만 남긴다)
                      disabled={hiddenLabel !== undefined || busy || working}
                      onChange={() => toggle(row.msgId)} />
                  <span className="pt">{Math.floor(row.playbackTime)}초</span>
                  <span className="txt">{row.message}</span>
                  {hiddenLabel && <span className="mark">{hiddenLabel}</span>}
                  {row.msgId === report.msgId && <span className="mark rep">신고됨</span>}
                </label>
              </li>
            )
          })}
        </ul>
      )}
      <button
          type="button" className="btn"
          disabled={picked.size === 0 || busy || working}
          onClick={blindPicked}>
        선택 {picked.size}건 가림
      </button>
    </div>
  )
}
