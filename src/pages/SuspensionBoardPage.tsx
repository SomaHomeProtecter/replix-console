import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { listSuspendedUsers, unsuspendUser } from '../api/admin'
import type { SuspendedUserRow, SuspendedUsers } from '../api/types'
import Avatar from '../components/Avatar'
import {
  SUSPENSION_STATE_LABELS, formatKstShort, suspensionState, type SuspensionState,
} from '../format'
import { useMinuteTick } from '../useMinuteTick'
import { useWriting } from '../writing'

/** 화면에 세는 갈래(정지가 아닌 것은 애초에 오지 않는다). 선언 순서 = 칩 순서 = 세는 순서. */
type Counted = Exclude<SuspensionState, 'none'>

const COUNTED: Counted[] = Object.keys(SUSPENSION_STATE_LABELS) as Counted[]

const listFailureMessage = (reason: string) =>
  `목록 갱신 실패 — 화면이 최신이 아닙니다. ${reason}`

function ErrorBox({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null
  return (
    <div className="error-box" role="alert">
      {messages.map((message) => <div key={message}>{message}</div>)}
    </div>
  )
}

/**
 * 상세로 오는 길이 셋이라(신고 큐·정지 현황판·조치 로그) 상세의 "돌아가기"가 하나로 굳어 있으면
 * 온 곳이 아닌 데로 되돌려보낸다. 어디서 보냈는지를 링크에 실어 상세가 그리로 돌리게 한다.
 */
const BACK_TO_BOARD = { from: '/suspensions', label: '정지 현황' }

/**
 * 정지 현황판(HP-300) — <b>지금 누가 정지 상태인가</b>를 한 화면에서 본다.
 *
 * <p>종전에는 정지된 계정에 닿는 길이 신고 큐 경유뿐이었다. 그래서 "지금 몇 명이 정지 중인지",
 * "곧 풀리는 사람이 누구인지"를 아무도 알 수 없었고, 특히 <b>만료됐는데 status만 SUSPENDED로
 * 남은 계정</b>은 그 사실을 볼 자리조차 없었다(만료 배치가 없는 lazy 설계라 DB는 영영 SUSPENDED로
 * 남는다). 이 화면이 그 세 갈래를 갈라 센다.
 *
 * <p>정렬은 손대지 않는다 — <b>서버가 정본</b>이다(만료 임박순, 무기한은 뒤). 화면에서 다시 정렬하면
 * 상한에 잘린 목록을 잘린 뒤에 재배열하는 꼴이라, "가장 임박한 N건"이 아니라 "임의의 N건을
 * 정렬한 것"이 된다.
 */
export default function SuspensionBoardPage() {
  const [data, setData] = useState<SuspendedUsers | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  /** 이미 그린 목록이 최신인지 확신할 수 없으면, 성공한 읽기가 올 때까지 조치를 잠근다. */
  const [stale, setStale] = useState(false)
  /** 쓰기가 도는 중 — <b>모든</b> 행의 해제를 잠근다(아래 unsuspend 주석). */
  const [busy, setBusy] = useState(false)
  /** 해제를 누른 행(userId). 확인을 한 번 더 받는 자리 — null이면 확인 중인 행이 없다. */
  const [confirming, setConfirming] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const { writing, setWriting } = useWriting()
  const dataRef = useRef<SuspendedUsers | null>(null)
  /**
   * 최신 읽기만 커밋한다. 언마운트에서도 올려, 화면이 사라진 뒤 도착한 응답이 상태를 건드리지
   * 않게 한다(한 장치로 낡음·언마운트를 함께 막는다).
   *
   * <p><b>지금은 방어선일 뿐이다</b> — 새로고침은 읽는 동안 잠기고 쓰기는 한 번에 하나라, 현재
   * 화면에서 읽기가 겹칠 길이 없어 이 가드가 없어도 결과가 같다(2026-08-12 변이 테스트로도
   * 확인 불가). 자동 갱신이나 병렬 읽기를 붙이는 순간 필요해지므로 남긴다.
   */
  const seq = useRef(0)

  /**
   * 목록을 읽고 <b>실패 사유를 돌려준다</b>(성공이면 null).
   *
   * <p>스스로 error를 세우지 않는 이유: 조치 뒤 재조회에서는 <b>조치 실패와 재조회 실패가 각각</b>
   * 알릴 값이 있어, 어느 하나가 다른 하나를 덮으면 운영자가 실제로 무엇이 실패했는지 모른다.
   * 사유를 돌려주고 합치는 일은 부르는 쪽이 한다.
   */
  const load = useCallback(async (): Promise<string | null> => {
    const mine = ++seq.current
    setLoading(true)
    try {
      const page = await listSuspendedUsers()
      if (mine !== seq.current) return null
      dataRef.current = page
      setData(page)
      // 낡음 잠금은 읽기 <b>성공</b>만 푼다. 버튼을 다시 누를 수 있다는 것은 최신 목록을
      // 확인했다는 뜻이어야 감사 로그의 중복 해제를 막을 수 있다.
      setStale(false)
      // 목록이 새로 깔리면 열어 둔 확인을 닫는다 — 그 확인은 <b>방금 사라진 목록</b>을 보고 연
      // 것이라, 그대로 두면 그새 바뀐(또는 없어진) 행에 대고 [해제 확인]을 누르게 된다.
      setConfirming(null)
      return null
    } catch (e) {
      if (mine !== seq.current) return null
      if (dataRef.current !== null) setStale(true)
      return e instanceof Error ? e.message : String(e)
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load().then((failure) => setErrors(failure ? [listFailureMessage(failure)] : []))
  }, [load])

  useEffect(() => () => {
    seq.current++
    // ReportDetailPanel의 onBusyChange와 같은 방어선 — 페이지가 사라져도 톱바 잠금은 남기지 않는다.
    setWriting(false)
  }, [setWriting])

  /**
   * 정지 해제 — 한 건이 도는 동안 <b>모든 행</b>의 해제를 잠근다.
   *
   * <p>조치 뒤 목록을 통째로 다시 읽으므로, 첫 요청이 끝나기 전에 다른 행을 누르면 <b>곧 사라질
   * 수도 있는 화면</b>을 보고 조치하는 셈이 된다. 감사 로그는 계정 하나를 공유해 쓰므로(3인 1계정)
   * 그렇게 새어 나간 조치는 나중에 누가 왜 했는지 되짚을 수 없다.
   *
   * <p>잠금이 영구히 남지 않는 근거는 {@code API_TIMEOUT_MS}다 — 요청 하나가 상한에서 끊기고,
   * 여기서 나가는 요청은 <b>한 번에 하나</b>라 잠금도 그 상한을 넘지 않는다(HP-298에서 배운 것:
   * 끊을 수 없는 요청 위에 잠금을 얹으면 화면이 영영 갇힌다).
   *
   * <p>조치가 실패해도 목록은 다시 읽는다 — 실패한 줄 알았는데 서버에는 닿았을 수 있고, 그 경우
   * 화면만 옛 상태로 남으면 운영자가 한 번 더 누른다.
   */
  const unsuspend = useCallback(async (row: SuspendedUserRow) => {
    setBusy(true)
    setWriting(true)
    setErrors([])
    let actionFailure: string | null = null
    try {
      try {
        await unsuspendUser(row.userId)
      } catch (e) {
        actionFailure = e instanceof Error ? e.message : String(e)
      }
      const reloadFailure = await load()
      setErrors([
        actionFailure && `정지 해제 실패 — ${actionFailure}`,
        // 재조회 실패는 조치 성패와 별개로 반드시 알린다 — 화면이 조치 <b>전</b> 목록이라
        // 방금 푼 계정이 그대로 남아 있고, 그러면 아무 일도 없었던 것처럼 보인다.
        reloadFailure && listFailureMessage(reloadFailure),
      ].filter((message): message is string => message !== null))
    } finally {
      setConfirming(null)
      setBusy(false)
      setWriting(false)
    }
  }, [load, setWriting])

  // 한 화면은 한 시각을 본다 — 칩이 센 갈래와 행이 말하는 갈래가 어긋나지 않게, 시각을 한 번만
  // 얻어 판정 함수에 넘긴다. 1분마다 갱신돼 열어 둔 화면에서도 만료가 제때 넘어간다.
  const now = useMinuteTick()
  const rows = data?.rows ?? []
  const states = rows.map((r) => suspensionState(r.status, r.suspendedUntil, now))
  const counts: Record<Counted, number> = { active: 0, indefinite: 0, expired: 0 }
  for (const state of states) {
    if (state !== 'none') counts[state]++
  }
  const truncated = data !== null && data.total > rows.length

  if (errors.length > 0 && data === null) {
    return (
      <section className="susp-board" aria-label="정지 현황판">
        <ErrorBox messages={errors} />
        <button
            type="button" className="btn" disabled={loading}
            onClick={() => void load().then((failure) =>
              setErrors(failure ? [listFailureMessage(failure)] : []))}>
          새로고침
        </button>
      </section>
    )
  }
  if (data === null) {
    return <div className="page-status">불러오는 중…</div>
  }

  return (
    <section className="susp-board" aria-label="정지 현황판">
      <div className="board-head">
        <h1>정지 현황</h1>
        <ul className="susp-chips" aria-label="정지 갈래별 수">
          {COUNTED.map((key) => (
            <li key={key} className={`susp-chip ${key}`}>
              <span className="n">{counts[key]}</span> {SUSPENSION_STATE_LABELS[key]}
            </li>
          ))}
        </ul>
        {/* 읽기를 다시 거는 유일한 손잡이다. 실패했을 때만 두면, <b>해제는 됐는데 재조회가
            실패한</b> 경우(화면이 조치 전 목록으로 남는다) 운영자가 화면을 최신으로 되돌릴
            방법이 화면을 떠나는 것뿐이다 — "최신이 아닙니다"라고 알리면서 고칠 손잡이를 주지
            않는 꼴이 된다. 현황판은 "지금 어떤가"를 보는 화면이라 평소에도 쓸 일이 있다. */}
        {/* 낡음(stale)을 여기서 다시 보지 않는다 — stale이 서는 것은 읽기가 <b>실패해 끝난</b>
            뒤라 그 시점엔 busy·loading이 모두 내려가 있어 어차피 열린다. 조건을 더하면 읽기가
            도는 찰나에만 갈리는 가지가 생기는데, 그 찰나엔 오히려 잠기는 편이 연타를 막는다
            (2026-08-12 변이 테스트에서 등가로 확인). */}
        <button
            type="button" className="btn refresh"
            disabled={busy || loading}
            onClick={() => void load().then((failure) =>
              setErrors(failure ? [listFailureMessage(failure)] : []))}>
          새로고침
        </button>
      </div>

      <ErrorBox messages={errors} />
      {truncated && (
        <div className="notice-box" role="status">
          정지 {data.total}건 중 {rows.length}건만 표시합니다 —
          위 수는 <b>표시된 것만</b> 센 값입니다.
        </div>
      )}

      {rows.length === 0
        ? <div className="empty-hint">정지 중인 계정이 없습니다</div>
        : (
          <div className="report-table-wrap">
            <table className="susp-table">
              <thead>
                <tr>
                  {/* "해제 예정"이 아니라 <b>만료 시각</b>이다 — 만료돼도 자동으로 해제되지
                      않으므로(lazy) "예정"은 일어나지 않을 일을 약속하는 말이 된다. */}
                  <th>사용자</th><th>갈래</th><th>만료 시각</th><th>사유</th><th>조치</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const state = states[i]
                  const name = row.displayName ?? `#${row.userId}`
                  return (
                    <tr key={row.userId}>
                      <td className="party">
                        <Avatar url={row.profileImageUrl} name={name} />
                        <Link
                            className="btn-link" to={`/users/${row.userId}`}
                            state={BACK_TO_BOARD} aria-disabled={writing || undefined}
                            title={writing
                              ? '정지 해제를 처리하는 중입니다 — 끝나면 이동할 수 있습니다'
                              : undefined}
                            onClick={(event) => { if (writing) event.preventDefault() }}>
                          {name}
                        </Link>
                      </td>
                      <td>
                        <span className={`sstate ${state}`}>
                          {state === 'none' ? row.status : SUSPENSION_STATE_LABELS[state]}
                        </span>
                      </td>
                      {/* 무기한은 "—"이다. 빈 칸으로 두면 값이 없는 것인지 못 읽은 것인지 모른다. */}
                      <td className="time">
                        {row.suspendedUntil ? formatKstShort(row.suspendedUntil) : '—'}
                      </td>
                      <td className="why">{row.suspendReason ?? '—'}</td>
                      <td className="act">
                        {confirming === row.userId ? (
                          <>
                            <button
                                type="button" className="btn btn-susp" disabled={busy || stale}
                                onClick={() => void unsuspend(row)}>
                              해제 확인
                            </button>
                            <button
                                type="button" className="btn" disabled={busy && !stale}
                                onClick={() => setConfirming(null)}>
                              취소
                            </button>
                          </>
                        ) : (
                          /* 확인을 한 번 더 받는다 — 사용자 상세와 달리 여기선 <b>줄이 촘촘하고
                             옆 줄이 남</b>이라, 한 칸 빗나간 클릭이 엉뚱한 사람의 정지를 푼다.
                             되돌리려면 다시 정지해야 하는데 원래 기간(duration)은 이 화면에 없어
                             (해제 예정 시각만 있다) 그대로 복원할 수 없다. */
                          <button
                              type="button" className="btn" disabled={busy || stale}
                              title={state === 'expired'
                                ? '이미 기간이 지나 제한은 풀려 있습니다 — 남아 있는 정지 표시를'
                                  + ' 정리합니다'
                                : undefined}
                              onClick={() => setConfirming(row.userId)}>
                            정지 해제
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
    </section>
  )
}
