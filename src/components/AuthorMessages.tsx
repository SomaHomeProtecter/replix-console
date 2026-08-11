import { useCallback, useEffect, useRef, useState } from 'react'
import { blindMessage, listAuthorMessages } from '../api/admin'
import type { AuthorMessage, ReportItem } from '../api/types'

/**
 * 상태 표식(HP-298). Redis {@code status}는 네 값이다 — {@code visible} ·
 * {@code blocked_profanity} · {@code blocked_hate}(클린봇 차단) · {@code blinded}(운영자 가림).
 */
const STATUS_LABELS: Record<string, string | undefined> = {
  blinded: '가림',
  blocked_profanity: '클린봇',
  blocked_hate: '클린봇',
}

/**
 * 가려서 뜻이 있는 줄인가 — <b>"가릴 수 있다"를 정하는 이 파일의 유일한 자리</b>.
 *
 * <p>미리 체크·체크박스 활성·행 표시가 각자 판단하면 셋이 어긋난다. 실제로 어긋났었다: 렌더는
 * 클린봇 줄을 고를 수 있게 고쳤는데 <b>미리 체크만</b> {@code visible} 조건으로 남아, 클린봇이
 * 막은 줄이 신고되면 정작 신고된 그 줄이 하나도 안 골라진 채 열렸다(2026-08-11 3라운드).
 * 그래서 판정을 함수 하나로 모으고, 쓰는 쪽은 이것만 부른다.
 *
 * <p>기준은 {@code blinded}뿐이다. 클린봇 차단({@code blocked_*})은 <b>사용자에게 숨겨지지
 * 않는다</b> — 서버가 본문을 지우는 것은 {@code blinded}뿐이고 {@code blocked_*}는 본문을 그대로
 * 내려보내 FE가 클린봇 토글에 따라 가린다(ChatHistoryService). 즉 사용자가 필터를 끄면 보이므로
 * 운영자가 가려야 할 대상이다. 이미 가린 것만 다시 가려도 상태가 그대로고 감사에 뜻 없는 행만
 * 쌓인다.
 */
function canBlind(status: string): boolean {
  return status !== 'blinded'
}

/**
 * 동시에 띄우는 가림 요청 수.
 *
 * <p><b>진행 표시가 실제 진행을 뜻하게 하려고</b> 나눠 보낸다. 전부 동시에 띄우면 "n/N"이
 * 순식간에 N 근처까지 갔다가 한참 멈춰 있어, 진행 표시가 진행을 알려주지 못한다. 겸해서
 * 관리 API에 한 번에 200건을 몰아치지 않는다.
 *
 * <p>(커넥션 상한을 근거로 삼지 않는다 — 호스트당 6개는 HTTP/1.1 이야기고 이 콘솔은 h2로
 * 붙는다. 근거가 틀린 채로 숫자만 맞는 주석은 다음 사람을 잘못된 방향으로 고치게 만든다.)
 */
const BLIND_CONCURRENCY = 6

/** 일괄 가림의 결과 — 무엇이 <b>남았는지</b>가 핵심이다. */
interface BlindOutcome {
  /** 보냈는데 실패한 건(취소로 끊긴 것 포함 — 서버에 닿았는지는 재조회가 판정한다). */
  failed: string[]
  /** 취소돼 아예 보내지 않은 건. */
  skipped: string[]
}

/**
 * 고른 건을 {@code BLIND_CONCURRENCY}개씩 흘려보내며 <b>어느 건이 남았는지</b> 돌려준다.
 *
 * <p>하나가 실패해도 나머지를 멈추지 않는다 — 가림은 건별로 확정되므로 앞선 성공을 되돌릴 수 없고,
 * 중간에 멈추면 어디까지 됐는지 알기도 어렵다. 실패 <b>건수</b>가 아니라 <b>어느 건</b>인지를
 * 돌려주는 이유는 호출부 주석 참조(다시 골라 둔다).
 *
 * <p>{@code signal}이 끊기면 <b>새로 보내지 않고</b> 멈춘다. 이미 나간 요청도 함께 끊기지만,
 * 서버에 닿은 것은 처리될 수 있으므로 "취소했으니 아무 일도 없었다"고 단정하지 않는다 —
 * 실제 상태는 뒤이은 재조회가 말해 준다.
 */
async function blindEach(
  episodeId: number, targets: string[], signal: AbortSignal, onEach: () => void,
): Promise<BlindOutcome> {
  const failed: string[] = []
  let next = 0
  const worker = async () => {
    // next++는 await 사이에 끼지 않는다 — 단일 스레드라 두 일꾼이 같은 번호를 집을 수 없다.
    while (next < targets.length && !signal.aborted) {
      const msgId = targets[next++]
      try {
        await blindMessage(episodeId, msgId, signal)
      } catch {
        failed.push(msgId)
      }
      onEach()
    }
  }
  await Promise.all(
      Array.from({ length: Math.min(BLIND_CONCURRENCY, targets.length) }, worker))
  return { failed, skipped: targets.slice(next) }
}

/** 진행 중인 일괄 가림. null = 놀고 있음. 이 값 하나가 진행 표시이자 잠금이다. */
interface Progress {
  done: number
  total: number
  /**
   * 아직 <b>요청을 보내는</b> 단계인가. 다 보낸 뒤에는 목록을 다시 읽는 단계로 넘어간다.
   *
   * <p>둘을 구분하는 이유는 [취소] 때문이다. 취소가 하는 일은 "더 보내지 않는다"인데,
   * 다 보낸 뒤에도 버튼이 남아 있으면 눌러도 아무 일이 없다 — 멎은 것처럼 보이는 화면에서
   * 유일한 손잡이가 반응조차 안 하면 운영자는 화면이 고장 났다고 판단한다. 그래서 보내는
   * 동안만 내놓고, 그 뒤에는 무엇을 기다리는 중인지(목록 갱신) 이름을 밝힌다.
   */
  sending: boolean
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
 *
 * <h4>상태 설계 — 세 라운드를 왕복하고 정한 것(2026-08-11)</h4>
 * <ol>
 *   <li><b>운영자가 손으로 고른 것({@code picked})은 재조회가 지우지 않는다.</b> 사라졌거나
 *       이미 가려진 것만 뺀다. 종전에는 재조회가 선택을 통째로 갈아 끼워, 목록을 새로 읽어야 할
 *       때마다 운영자가 고른 것이 날아갔다. 그래서 "재조회를 언제 거느냐"가 지뢰가 됐고 리뷰가
 *       그 축을 넣었다 뺐다 했다. 재조회가 무해해지면 그 다툼 자체가 사라진다.</li>
 *   <li><b>쓰기가 도는 동안에는 잠근다</b>({@code onBusyChange}로 부모까지). 안 잠그면 일괄 가림
 *       도중 [기각]이 눌려 "신고가 타당해서 가리는 중"과 "신고가 부당해서 기각"이 한 건에
 *       동시에 기록된다. 잠글 수 있게 된 것은 <b>끊는 수단이 생긴</b> 덕이다 — 그전에는 잠그면
 *       얼고 안 잠그면 중복이라 어느 쪽으로 가도 결함이었다. 끊는 수단은 둘이다: 요청 하나는
 *       {@code API_TIMEOUT_MS}가 끊고, 배치 전체가 그 배수만큼 길어지는 경우는 [취소]가 받는다.
 *       <b>상한 하나로 전체가 보장되지는 않는다</b> — 그렇게 적으면 안 된다.</li>
 * </ol>
 */
export default function AuthorMessages({ report, busy, onActionDone, onBusyChange }: {
  /**
   * ⚠️ 부모는 이 컴포넌트를 {@code key={report.id}}로 그린다 — 신고가 바뀌면 <b>새로 마운트</b>된다.
   * 상태 초기화 효과로 처리하지 않는 이유: 같은 메시지에 신고가 둘이면(묶음 ×N) 두 신고의
   * episodeId·msgId·작성자가 모두 같아, 목록만 비고 재조회 축이 하나도 안 바뀌어 영영 빈 채로
   * 남았다(2026-08-11 2라운드 지적). 리마운트는 그 경우를 구조적으로 없앤다.
   */
  report: ReportItem
  /** 부모(상세 패널)가 다른 조치를 진행 중 — 그동안 여기서도 새 조치를 받지 않는다. */
  busy: boolean
  /**
   * 조치가 끝났으니 큐를 다시 읽으라는 신호. <b>결과 문구를 함께 올린다</b> — 일부 실패한 사실이
   * 이 컴포넌트 안에만 있으면 신고가 큐에서 빠져 패널이 언마운트되는 순간 함께 사라져,
   * 운영자는 전부 가려진 줄 안다. 페이지에 올려 두면 모달이 닫혀도 화면에 남는다.
   */
  onActionDone: (notice?: string) => void
  /**
   * 여기서 쓰기가 도는 동안 부모의 조치 버튼도 막는다.
   *
   * <p>부모는 렌더마다 바뀌지 않는 함수를 주는 편이 좋다(setState 함수 등). 매 렌더 새로 만들면
   * 아래 효과가 매번 다시 돈다 — 같은 값으로 setState 하면 React가 빠져나가므로 무한 루프까지
   * 가지는 않지만 불필요한 왕복이 쌓인다. 강제할 수단은 없으니 <b>보호 장치로 여기지 말 것</b>.
   */
  onBusyChange: (busy: boolean) => void
}) {
  const authorId = report.targetUser?.id ?? null
  const [rows, setRows] = useState<AuthorMessage[]>([])
  const [total, setTotal] = useState(0)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  /**
   * 오류를 <b>두 칸으로 나눈다</b>. 하나로 두면 가림 뒤 재조회가 방금 띄운 실패 문구를 지워
   * "일부 실패"가 조용히 사라진다 — 운영자는 전부 가려진 줄 안다. 목록을 못 읽은 것과
   * 조치가 일부 실패한 것은 서로 다른 사실이라, 한쪽이 다른 쪽을 덮으면 안 된다.
   */
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  /**
   * 경합 가드 — 조회 두 개가 <b>이 신고 안에서</b> 겹칠 수 있다. 일괄 가림 뒤의 재조회와,
   * 그 가림으로 신고된 줄의 실황이 바뀌어 아래 효과가 거는 재조회가 그렇다. 늦게 도착한 쪽이
   * 먼저 나간 응답을 덮으면 방금 가린 줄이 목록에 '표시 중'으로 되살아난다.
   * {@code alive}는 언마운트(모달 닫힘) 뒤 상태 갱신을 막는다.
   */
  const seq = useRef(0)
  const alive = useRef(true)
  /**
   * 진행 중인 일괄 가림을 끊는 손잡이.
   *
   * <p>이게 없으면 잠금의 최악 시간이 <b>요청 하나의 상한이 아니라 그 상한 × 물결 수</b>가 된다.
   * 서버가 응답을 안 하면 40건 = 7물결 × 15초 ≈ 105초 동안 모달이 닫히지도, 다른 조치가 되지도
   * 않는다(200건이면 8분). 자동 상한을 더 촘촘히 잡는 대신 <b>운영자에게 손잡이를 준다</b> —
   * 정상적으로 오래 걸리는 배치를 성급히 죽이지 않으면서, 갇히는 경우는 없앤다.
   */
  const canceller = useRef<AbortController | null>(null)
  /** 미리 체크는 <b>처음 한 번</b>만 한다 — 그 뒤 재조회는 운영자의 선택을 건드리지 않는다. */
  const seeded = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  /**
   * 언마운트되면 진행 중인 배치를 <b>끊는다</b>.
   *
   * <p>모달은 운영자가 닫는 길(백드롭·Esc·✕)만 막혀 있고, <b>암묵적으로도</b> 사라진다 —
   * 앞선 조치의 큐 재조회가 늦게 커밋돼 그 신고가 열림 목록에서 빠지면 모달이 통째로 없어진다.
   * 그때 배치를 그냥 두면 <b>화면 없는 쓰기</b>가 남는다: 진행 표시도 취소 손잡이도 없고,
   * 부모 잠금은 이미 풀렸으므로 운영자는 다른 신고를 열어 <b>같은 작성자에게 두 번째 배치</b>를
   * 걸 수 있다(묶음 ×N은 큐가 오히려 강조하는 경우다). 두 배치가 같은 msgId에 겹치면 감사에
   * 중복 BLIND 행이 쌓인다. 알릴 화면이 사라진 배치는 계속해 봐야 얻는 것이 없다.
   */
  useEffect(() => () => canceller.current?.abort(), [])

  /**
   * 목록을 다시 읽는다. <b>반환값은 "화면이 갱신됐는가"</b>다 — {@code 'ok'}만이 커밋을 뜻한다.
   *
   * <p>이 값을 안 돌려주던 동안 실제 결함이 있었다: 이 함수는 오류를 안에서 삼켜 <b>절대
   * reject하지 않으므로</b>, 부르는 쪽의 `await load()` 뒤 잠금 해제가 재조회 실패에도 그대로
   * 돌았다. 그 결과 <b>낡은 목록 위에서 버튼이 다시 열려</b>, 방금 서버에 닿은 건에 또 요청이
   * 나가고 감사에 중복 BLIND 행이 쌓일 수 있었다(2026-08-12 독립 리뷰 blocker).
   */
  const load = useCallback(async (): Promise<'ok' | 'failed' | 'stale'> => {
    if (authorId === null) return 'stale'
    const mine = ++seq.current
    setLoading(true)
    setLoadError(null)
    try {
      const page = await listAuthorMessages(report.episodeId, authorId, report.msgId)
      if (!alive.current || mine !== seq.current) return 'stale'
      setRows(page.rows)
      setTotal(page.total)
      const blindable = new Set(page.rows.filter((r) => canBlind(r.status)).map((r) => r.msgId))
      const onPage = new Set(page.rows.map((r) => r.msgId))
      // 상한에 잘렸는가. BE는 재생 시각 오름차순의 <b>마지막 limit개</b>를 준다(꼬리 창) —
      // 도배가 계속되면 창이 밀려, 앞쪽에 고른 줄이 <b>여전히 살아 있는데도</b> 목록에서 빠진다.
      const truncated = page.total > page.rows.length
      if (seeded.current) {
        // 재조회는 운영자가 고른 것을 지우지 않는다. 빼는 것은 <b>없어진 것이 확실한 것</b>뿐이다 —
        // 이미 가려졌거나(가릴 수 없음), 잘리지 않은 목록에서 사라진 것. 잘린 목록에서 안 보이는
        // 것은 "없어졌다"가 아니라 "판정할 수 없다"라 그대로 둔다(창 밖 선택은 아래 안내로 밝힌다).
        setPicked((prev) => new Set([...prev].filter(
            (id) => blindable.has(id) || (truncated && !onPage.has(id)))))
      } else if (page.rows.length > 0) {
        // 처음 읽었을 때만 신고로 올라온 줄을 미리 고른다(실패 후 재시도로 처음 성공해도 여기).
        // 빈 목록으로는 씨를 뿌리지 않는다 — 일시적으로 빈 응답이 오면 그걸로 미리 체크가
        // 영영 꺼져, 다음 조회에 줄이 와도 아무것도 안 골라진 채 열린다.
        seeded.current = true
        setPicked(new Set(blindable.has(report.msgId) ? [report.msgId] : []))
      }
      return 'ok'
    } catch (e) {
      if (!alive.current || mine !== seq.current) return 'stale'
      setLoadError(e instanceof Error ? e.message : String(e))
      return 'failed'
    } finally {
      if (alive.current && mine === seq.current) setLoading(false)
    }
    // currentStatus를 축에 넣는다 — 부모가 신고된 메시지를 가리거나 풀면 이 목록도 낡는다.
    // 이제 재조회가 선택을 지우지 않으므로(위 병합) 축을 넓게 잡아도 운영자 작업이 날아가지
    // 않는다. 그래도 이 축만 쓰는 것은 <b>정확</b>하기 때문이다 — 점수 정정처럼 이 목록과 무관한
    // 조치에까지 왕복을 걸 이유가 없다.
  }, [report.episodeId, report.msgId, report.currentStatus, authorId])

  useEffect(() => { void load() }, [load])

  const working = progress !== null
  const blocked = busy || working
  /** 고른 것 중 지금 목록 창에 없는 수 — 상한에 잘렸을 때만 0이 아니다(load의 truncated 주석). */
  const offscreenPicks = [...picked].filter(
      (id) => !rows.some((r) => r.msgId === id)).length

  // 쓰기가 도는 동안 부모의 조치 버튼도 잠근다. 언마운트에도 반드시 풀어야 부모가 갇히지 않는다.
  // 축은 progress가 아니라 <b>불리언</b>이다 — progress는 진행 눈금마다 바뀌어, 그대로 축에 두면
  // 200건짜리 배치가 부모 상태를 200번 흔든다(값은 같아 화면은 그대로지만 왕복만 쌓인다).
  useEffect(() => { onBusyChange(working) }, [working, onBusyChange])
  useEffect(() => () => onBusyChange(false), [onBusyChange])

  const toggle = (msgId: string) => setPicked((prev) => {
    const next = new Set(prev)
    if (!next.delete(msgId)) next.add(msgId)
    return next
  })

  const blindPicked = () => {
    if (picked.size === 0 || blocked) return
    const targets = [...picked]
    const controller = new AbortController()
    canceller.current = controller
    setProgress({ done: 0, total: targets.length, sending: true })
    setActionError(null)
    // 보내는 즉시 선택을 비운다 — 이걸로 "같은 건이 두 번 나가는" 창이 닫힌다.
    setPicked(new Set())

    void (async () => {
      const { failed, skipped } = await blindEach(
          report.episodeId, targets, controller.signal,
          () => { if (alive.current) setProgress((p) => (p ? { ...p, done: p.done + 1 } : p)) })
      const left = [...failed, ...skipped]
      const succeeded = targets.length - left.length
      const cancelled = controller.signal.aborted
      let refreshed: 'ok' | 'failed' | 'stale' = 'stale'

      if (alive.current) {
        // 보내는 단계는 끝났다 — 여기서부터 [취소]는 할 일이 없다(Progress.sending 주석).
        setProgress((p) => (p ? { ...p, sending: false } : p))
        // 남은 건을 <b>다시 고른 채로</b> 둔다. 건수만 알려주면 운영자는 40건 중 어느 3건이
        // 남았는지 알 길이 없어 처음부터 다시 훑어야 한다. 재조회는 가릴 수 있는 줄의 선택을
        // 유지하므로(load의 병합) 이 선택이 살아남는다.
        if (left.length > 0) setPicked(new Set(left))
        // 성공분을 화면에 반영하려면 다시 읽어야 한다(낙관적으로 고쳐 쓰면 실패분과 어긋난다).
        // 취소한 경우에도 반드시 읽는다 — 끊긴 요청이 서버에 닿았는지는 목록만이 안다.
        refreshed = await load()
        if (refreshed !== 'ok') {
          // <b>확인하지 못한 목록에 대고 버튼을 다시 무장하지 않는다.</b> 재조회가 실패하면
          // 화면의 줄들은 조치 <b>이전</b> 상태다 — 그 위에서 [가림]을 한 번 더 누르면 이미
          // 서버에 닿은 건에 또 요청이 나가고, BE는 재가림을 멱등 200으로 받으므로 감사에만
          // 중복 BLIND 행이 쌓인다(3인이 admin을 공유해 되돌림 판단의 근거가 흐려진다).
          setPicked(new Set())
        }
        // 잠금은 재조회가 <b>끝난</b> 뒤에 푼다. 먼저 풀면 목록이 아직 옛것인 채 버튼이 열린다.
        setProgress(null)
      }

      // 문구는 <b>아는 것만</b> 말한다. 재조회가 실패했으면 "목록에서 확인하세요"라고 할 수 없다 —
      // 그 목록이 바로 갱신에 실패한 그 목록이라, 운영자를 낡은 화면으로 보내는 안내가 된다.
      // 취소 문구도 마찬가지로 확정된 수만 센다: 끊긴 요청이 서버에 닿았는지는 화면이 모른다.
      const stale = refreshed === 'failed' ? ' 목록을 새로 읽지 못해 화면이 최신이 아닙니다.' : ''
      const notice = cancelled
          ? `일괄 가림을 취소했습니다 — ${succeeded}건 완료.`
            + (stale || ' 나머지는 목록에서 확인하세요.')
          : left.length > 0
            ? `${targets.length}건 중 ${left.length}건 실패했습니다.${stale}`
            : stale
              ? `${targets.length}건을 가렸습니다.${stale}`
              : undefined
      if (alive.current && notice) setActionError(notice)
      // 컨트롤러 참조를 놓아 준다(GC). 배치가 끝나 아무도 쓰지 않는다 — 가드가 아니다.
      canceller.current = null
      // 큐 재조회는 <b>언마운트와 무관하게</b> 나간다 — 갱신 대상이 사라진 이 컴포넌트가
      // 아니라 부모 페이지이기 때문이다. 가드 안에 넣으면 가림 도중 모달을 닫았을 때
      // 서버는 바뀌었는데 큐만 낡아 방금 가린 메시지가 '표시 중'으로 남는다.
      // 문구도 함께 올린다 — 이 컴포넌트가 사라져도 결과가 화면에 남게.
      onActionDone(notice)
    })()
  }

  // 배치가 도는 동안에는 이른 반환을 하지 않는다 — 잠금은 progress가 걸고 있는데 여기서
  // 화면을 비워 버리면 [취소]까지 함께 사라져, 잠긴 채 손잡이가 없는 상태가 된다(리뷰 major).
  if (authorId === null && !working) {
    return <div className="hint">작성자 정보가 없어 글을 모아 볼 수 없습니다</div>
  }

  return (
    <div className="author-msgs" aria-busy={working}>
      <h5 className="side-h">
        이 회차 이 사용자 메시지
        {total > rows.length && (
          // 조용히 자르면 "이게 전부"로 읽혀 남은 도배를 놓친다
          <span className="hint"> — {total}건 중 {rows.length}건만 표시</span>
        )}
        {/* 이미 목록이 있는 채로 다시 읽는 중이면 화면이 놀고 있는 것처럼 보인다 */}
        {loading && rows.length > 0 && <span className="hint"> · 갱신 중…</span>}
      </h5>
      {actionError && <div className="error-box" role="alert">{actionError}</div>}
      {loadError && (
        <div className="error-box" role="alert">
          {loadError}
          {/* 다시 시도할 손잡이가 없으면 여기가 막다른 길이다 — 모달을 닫았다 다시 여는 것
              말고는 이 기능을 쓸 방법이 없다. apiFetch에 시간 상한이 생긴 뒤로 조회가
              "영영 로딩 중" 대신 <b>실패로 끝나게</b> 됐으므로, 이 길이 실제로 자주 열린다. */}
          {' '}
          <button type="button" className="btn-link" disabled={blocked} onClick={() => void load()}>
            다시 시도
          </button>
        </div>
      )}
      {loading && rows.length === 0 && <div className="hint">불러오는 중…</div>}
      {!loading && rows.length === 0 && !loadError && (
        <div className="hint">이 회차에 남긴 글이 없습니다</div>
      )}
      {/* 잘린 창 밖에 있는 선택을 밝힌다. 도배가 계속되면 꼬리 창이 밀려 앞서 고른 줄이
          목록에서 안 보이게 되는데, 그 선택은 <b>살아 있고 가림 대상에 그대로 들어간다</b> —
          화면에 안 보이는 것이 골라져 있다는 사실을 안 적으면 운영자가 셈을 못 맞춘다. */}
      {offscreenPicks > 0 && (
        <div className="hint">고른 {picked.size}건 중 {offscreenPicks}건은 목록 창 밖에 있습니다 — 가림에는 함께 들어갑니다</div>
      )}
      {/* 신고된 줄이 목록에 없으면 그렇게 말한다. BE는 상한에 잘려도 그 줄을 되끼워 주지만
          (keep 파라미터), 그새 만료·삭제됐으면 되끼울 것이 없어 조용히 빠진다 — 운영자는
          '신고됨' 표가 안 보이는 이유를 알 수 없어 엉뚱한 줄을 신고된 줄로 여긴다. */}
      {rows.length > 0 && !rows.some((r) => r.msgId === report.msgId) && (
        <div className="hint">신고된 줄은 목록에 없습니다 — 이미 사라진 메시지입니다(만료·삭제)</div>
      )}
      {rows.length > 0 && (
        <ul className="msg-picks">
          {rows.map((row) => {
            const label = STATUS_LABELS[row.status]
            const blindable = canBlind(row.status)
            return (
              <li key={row.msgId} className={blindable ? undefined : 'blinded'}>
                <label>
                  <input
                      type="checkbox"
                      checked={picked.has(row.msgId)}
                      disabled={!blindable || blocked}
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
      {/* 고를 것이 없으면 조치 줄도 내린다 — 빈 목록 아래 "선택 0건 가림"과 종결 안내만 남으면
          무엇을 하라는 화면인지 알 수 없다. */}
      {/* 고를 것이 없으면 조치 줄을 내린다 — 다만 <b>배치가 도는 동안에는 반드시 남긴다</b>.
          잠금은 progress가 걸고 있어서, 재조회가 빈 목록을 들고 오면(전부 TTL 만료 등) 이 줄이
          사라지며 [취소]까지 없어져 모달이 잠긴 채 출구가 없어진다(리뷰 major). */}
      {(rows.length > 0 || working) && (
        <>
          <div className="msg-picks-acts">
            <button
                type="button" className="btn"
                disabled={picked.size === 0 || blocked}
                onClick={blindPicked}>
              {/* 단계를 라벨로 밝힌다. 종전에는 누른 뒤 화면이 <b>누르기 전과 똑같아</b> 보여
                  (목록이 이미 차 있어 스피너도 안 떴다) 운영자가 한 번 더 누르는 일이 났다. */}
              {/* 눈금은 <b>보낸 수</b>다(성공·실패 모두 센다) — "가림 12/40"이라 적으면 12건이
                  가려진 뜻이 되어, 뒤이어 뜨는 "40건 중 3건 실패"와 어긋난다. */}
              {progress === null
                ? `선택 ${picked.size}건 가림`
                : progress.sending
                  ? `처리 중… ${progress.done}/${progress.total}`
                  : '목록 갱신 중…'}
            </button>
            {/* 보내는 동안 모달이 잠기므로(결과를 알릴 화면을 지키려고) <b>빠져나갈 손잡이</b>가
                반드시 있어야 한다. 서버가 응답을 안 하면 자동 상한은 요청 하나에만 걸려, 물결 수만큼
                곱해진 시간 동안 갇힌다. 갱신 단계는 조회 한 번이라 그 상한 안에 반드시 끝난다. */}
            {progress?.sending && (
              <button
                  type="button" className="btn-link"
                  onClick={() => canceller.current?.abort()}>
                취소
              </button>
            )}
          </div>
          {/* 일괄 가림은 <b>신고를 닫지 않는다</b>. 화면에 안 적으면 운영자는 가렸으니 끝난 줄 알고
              넘어가고, 그 신고는 큐에 열린 채 남아 다음 사람이 같은 건을 또 본다. */}
          <div className="hint">가림은 신고를 종결하지 않습니다 — 아래에서 따로 종결하세요</div>
        </>
      )}
    </div>
  )
}
