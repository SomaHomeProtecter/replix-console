import { getToken } from '../auth'
import { env } from '../env'

/** BE ApiError(code·message)를 상태와 함께 실어 나른다 — 403은 서버 판정을 그대로 화면에 드러낸다(DoD). */
export class ApiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiHttpError'
  }
}

const STATUS_FALLBACKS: Record<number, string> = {
  401: '인증이 만료되었습니다 — 페이지를 새로고침해 다시 로그인하세요',
  403: '관리자 권한이 없습니다 — 서버가 요청을 거부했습니다',
}

/**
 * 요청 하나가 응답 없이 매달릴 수 있는 최대 시간.
 *
 * <p><b>왜 필요한가</b>: 조치 콘솔은 "처리 중" 잠금으로 중복 조치를 막는다 — 감사는 2xx 쓰기
 * 1건당 1행이라(AdminAction) 같은 조치가 두 번 나가면 되돌림 판단의 근거가 흐려진다. 그런데
 * 끊는 장치가 없으면 그 잠금이 <b>영영 풀리지 않아</b> 화면이 죽는다. 그래서 HP-298 리뷰는
 * 두 라운드를 "잠그면 얼고, 안 잠그면 중복" 사이에서 왕복했다. 상한이 있어야 <b>잠그되 반드시
 * 풀린다</b>가 성립하고, 그제서야 잠금을 안전하게 쓸 수 있다.
 *
 * <p>15초: 관리 API는 Redis·Postgres 단발 조회/쓰기라 정상 응답은 수백 ms다. 사람이 화면 앞에서
 * "멈췄다"고 느끼는 구간이면서, 일시적 지연을 성급히 죽이지는 않는 선이다.
 */
export const API_TIMEOUT_MS = 15_000

/** 시간 안에 응답이 없어 <b>클라이언트가</b> 끊었다는 뜻 — HTTP 응답이 없으므로 status는 0이다. */
export const TIMEOUT_CODE = 'TIMEOUT'

/**
 * 끊을 수 없는 작업을 <b>기다리는 쪽</b>만이라도 풀어 준다.
 *
 * <p>{@code getToken}은 keycloak-js의 토큰 갱신이라 취소 수단이 없다 — 갱신 요청이 멎으면
 * 그 자리에서 무기한 기다린다. 그 대기는 {@code fetch}보다 <b>앞</b>이라 signal이 닿지 않아,
 * 시간 상한을 걸어 둬도 여기서 새면 "잠금은 반드시 풀린다"가 거짓이 된다. 밑의 작업은 계속
 * 돌지만(멈출 방법이 없다) 호출자는 상한 안에 반드시 결과를 받는다 — 화면 잠금을 푸는 데는
 * 그것으로 충분하다.
 */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason as Error)
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason as Error)
    signal.addEventListener('abort', onAbort, { once: true })
    work.then(resolve, reject).finally(
        () => signal.removeEventListener('abort', onAbort))
  })
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, API_TIMEOUT_MS)
  // 호출자가 준 signal도 같은 컨트롤러로 모은다 — 둘 중 먼저 끊는 쪽이 이긴다.
  const relayAbort = () => controller.abort()
  if (init?.signal?.aborted) controller.abort()
  else init?.signal?.addEventListener('abort', relayAbort, { once: true })

  try {
    // 토큰 갱신도 상한 안에 둔다 — 여기가 새면 아래 signal이 아무리 촘촘해도 소용없다.
    const token = await untilAborted(getToken(), controller.signal)
    const res = await fetch(`${env.apiBaseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
    if (!res.ok) {
      let code = `HTTP_${res.status}`
      let message = STATUS_FALLBACKS[res.status] ?? `요청 실패 (HTTP ${res.status})`
      try {
        const body = (await res.json()) as { code?: string; message?: string }
        if (body.code) code = body.code
        if (body.message) message = body.message
      } catch {
        // 본문 없는 오류(401 등) — 상태 코드 폴백 문구를 유지한다
      }
      throw new ApiHttpError(res.status, code, message)
    }
    return (await res.json()) as T
  } catch (e) {
    // <b>우리가</b> 끊은 것만 TIMEOUT으로 바꾼다. 호출자가 끊은 것(화면 이탈 등)까지 타임아웃이라
    // 부르면 화면이 "서버가 느리다"고 거짓말하고, 운영자가 없는 장애를 쫓는다.
    if (timedOut) {
      throw new ApiHttpError(0, TIMEOUT_CODE,
          `서버가 ${API_TIMEOUT_MS / 1000}초 안에 응답하지 않아 요청을 취소했습니다`)
    }
    throw e
  } finally {
    // 끝난 요청의 타이머를 남기면 나중에 깨어나 <b>다음</b> 일과 무관하게 abort를 때린다.
    clearTimeout(timer)
    init?.signal?.removeEventListener('abort', relayAbort)
  }
}

/** 쿼리스트링 조립 — 빈 값(null·undefined·'')은 파라미터 자체를 뺀다(BE의 "미지정 = 전체"와 맞춤). */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      search.set(key, String(value))
    }
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}
