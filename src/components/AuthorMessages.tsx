import { useCallback, useEffect, useState } from 'react'
import { blindMessage, listAuthorMessages } from '../api/admin'
import type { AuthorMessage, ReportItem } from '../api/types'

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

  const load = useCallback(async () => {
    if (authorId === null) return
    setLoading(true)
    setLoadError(null)
    try {
      const page = await listAuthorMessages(report.episodeId, authorId)
      setRows(page.rows)
      setTotal(page.total)
      // 신고로 올라온 줄만 미리 고른다. 이미 가려진 것은 고르지 않는다 — 다시 가려도 상태는
      // 그대로고 감사에 뜻 없는 행만 쌓인다.
      const reported = page.rows.find(
          (r) => r.msgId === report.msgId && r.status !== 'blinded')
      setPicked(new Set(reported ? [reported.msgId] : []))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [report.episodeId, report.msgId, authorId])

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
   */
  const blindPicked = () => {
    if (picked.size === 0) return
    setWorking(true)
    setActionError(null)
    const targets = [...picked]
    void Promise.allSettled(targets.map((msgId) => blindMessage(report.episodeId, msgId)))
        .then((results) => {
          const failed = results.filter((r) => r.status === 'rejected').length
          if (failed > 0) setActionError(`${targets.length}건 중 ${failed}건 실패했습니다`)
          setWorking(false)
          // 성공분을 화면에 반영하려면 다시 읽어야 한다 — 낙관적으로 고쳐 쓰면 실패분과
          // 어긋난다. 부모의 재조회(신고 큐 실황)도 함께 태운다.
          void load()
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
            const blinded = row.status === 'blinded'
            return (
              <li key={row.msgId} className={blinded ? 'blinded' : undefined}>
                <label>
                  <input
                      type="checkbox"
                      checked={picked.has(row.msgId)}
                      // 이미 가린 글은 고를 것이 없다(재가림은 감사에 뜻 없는 행만 남긴다)
                      disabled={blinded || busy || working}
                      onChange={() => toggle(row.msgId)} />
                  <span className="pt">{Math.floor(row.playbackTime)}초</span>
                  <span className="txt">{row.message}</span>
                  {blinded && <span className="mark">가림</span>}
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
