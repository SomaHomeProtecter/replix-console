import { useCallback, useEffect, useRef, useState } from 'react'
import { blindMessage, listAuthorMessages } from '../api/admin'
import type { AuthorMessage, ReportItem } from '../api/types'

/**
 * 상태 표식(HP-298). Redis {@code status}는 네 값이다 — {@code visible} ·
 * {@code blocked_profanity} · {@code blocked_hate}(클린봇 차단) · {@code blinded}(운영자 가림).
 */
const STATUS_LABELS: Record<string, string> = {
  blinded: '가림',
  blocked_profanity: '클린봇',
  blocked_hate: '클린봇',
}

/**
 * 다시 가려도 뜻이 없는 것은 <b>운영자 가림뿐</b>이다.
 *
 * <p>클린봇 차단({@code blocked_*})은 <b>사용자에게 숨겨지지 않는다</b> — 서버가 본문을 지우는
 * 것은 {@code blinded}뿐이고, {@code blocked_*}는 본문을 그대로 내려보내 FE가 클린봇 토글에
 * 따라 가린다(ChatHistoryService). 즉 <b>사용자가 필터를 끄면 보이므로</b> 운영자가 가려야 할
 * 대상이다. 한때 이것도 선택 불가로 막았는데, 표식만 보고 "이미 안 보인다"고 단정한 탓이었다.
 */
function alreadyBlinded(status: string): boolean {
  return status === 'blinded'
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
export default function AuthorMessages({ report, busy, onActionDone }: {
  /**
   * ⚠️ 부모는 이 컴포넌트를 {@code key={report.id}}로 그린다 — 신고가 바뀌면 <b>새로 마운트</b>된다.
   * 상태 초기화 효과로 처리하지 않는 이유: 같은 메시지에 신고가 둘이면(묶음 ×N) 두 신고의
   * episodeId·msgId·작성자가 모두 같아, 목록만 비고 재조회 축이 하나도 안 바뀌어 영영 빈 채로
   * 남았다(2026-08-11 2라운드 지적). 리마운트는 그 경우를 구조적으로 없앤다.
   */
  report: ReportItem
  /** 부모(상세 패널)가 다른 조치를 진행 중 — 그동안 여기서도 새 조치를 받지 않는다. */
  busy: boolean
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
    // currentStatus를 축에 넣는다 — 부모가 신고된 메시지를 가리거나 풀면 이 목록도 낡는다.
    // 별도 신호(reloadKey)를 두지 않는 이유: 그건 <b>모든</b> 부모 조치에 재조회를 걸어,
    // 점수 정정처럼 이 목록과 무관한 조치까지 운영자가 골라 둔 선택을 지웠다(2라운드 지적).
  }, [report.episodeId, report.msgId, report.currentStatus, authorId])

  /**
   * 언제나 <b>최신</b> load를 가리킨다. 아래 일괄 가림의 콜백이 클릭 시점 클로저를 그대로
   * await 하면, 그 낡은 load가 {@code ++seq}를 해 오히려 최신이 되어 <b>자기 경합 가드를
   * 통과</b>하고 이전 신고의 목록을 덮어썼다(2라운드 지적 — 가드를 넣으면서 우회로를 함께 만든 셈).
   */
  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load }, [load])

  useEffect(() => { void load() }, [load])

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
    setActionError(null)
    const targets = [...picked]
    // 보내는 즉시 선택을 비운다 — 이걸로 "같은 건이 두 번 나가는" 창이 닫힌다. 잠금을
    // 재조회까지 끌지 않는 이유: 그러면 조회가 멎었을 때 화면이 무기한 잠긴다(HP-294에서
    // 이미 같은 실패를 겪고 되돌렸던 구조를 2라운드에서 다시 지적받았다).
    setPicked(new Set())
    void Promise.allSettled(targets.map((msgId) => blindMessage(report.episodeId, msgId)))
        .then((results) => {
          const failed = results.filter((r) => r.status === 'rejected').length
          // 언마운트(모달 닫힘) 뒤에는 <b>이 컴포넌트의</b> 상태만 건드리지 않는다.
          if (alive.current) {
            if (failed > 0) setActionError(`${targets.length}건 중 ${failed}건 실패했습니다`)
            setWorking(false)
            // 성공분을 화면에 반영하려면 다시 읽어야 한다(낙관적으로 고쳐 쓰면 실패분과 어긋난다).
            // 반드시 최신 load여야 한다 — 이유는 loadRef 주석 참조.
            void loadRef.current()
          }
          // 큐 재조회는 <b>언마운트와 무관하게</b> 나간다 — 갱신 대상이 사라진 이 컴포넌트가
          // 아니라 부모 페이지이기 때문이다. 가드 안에 넣으면 가림 도중 모달을 닫았을 때
          // 서버는 바뀌었는데 큐만 낡아 방금 가린 메시지가 '표시 중'으로 남는다.
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
            const label = STATUS_LABELS[row.status]
            const blinded = alreadyBlinded(row.status)
            return (
              <li key={row.msgId} className={blinded ? 'blinded' : undefined}>
                <label>
                  <input
                      type="checkbox"
                      checked={picked.has(row.msgId)}
                      // 이미 운영자가 가린 글만 고를 것이 없다(재가림은 감사에 뜻 없는 행만
                      // 남긴다). 클린봇 차단은 사용자가 필터를 끄면 보이므로 고를 수 있다.
                      disabled={blinded || busy || working}
                      onChange={() => toggle(row.msgId)} />
                  <span className="pt">{Math.floor(row.playbackTime)}초</span>
                  <span className="txt">{row.message}</span>
                  {label && <span className="mark">{label}</span>}
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
