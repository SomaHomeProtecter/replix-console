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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken()
  const res = await fetch(`${env.apiBaseUrl}${path}`, {
    ...init,
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
