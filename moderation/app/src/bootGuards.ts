/**
 * 다른 사이트의 프레임 안인가(HP-456).
 *
 * <p>GitHub Pages는 X-Frame-Options·CSP 헤더를 붙일 수 없다. Keycloak 세션이 살아 있으면 프레임 안에서도
 * 화면 없이 리다이렉트만으로 로그인이 끝나, 정지 같은 조치 버튼이 남의 페이지에 실린다. 그래서 헤더 대신
 * 부팅 첫 단계에서 멈춘다. 최상위 창을 읽을 수 없으면 프레임 안으로 본다.
 */
export function isFramed(win: { top: Window | null; self: Window }): boolean {
  return win.top !== win.self
}

/** index.html 머리의 error 리스너가 첫 예외를 남기는 전역 이름. */
export const BOOT_ERROR_KEY = '__replixBootError'

/**
 * 부팅 실패를 알릴 원인 — index.html이 남긴 첫 예외를 앞세운다(HP-456).
 *
 * <p>싱글파일 빌드는 동적 import까지 한 파일로 합쳐 즉시 평가한다. 그래서 env.ts가 모듈 평가 중 던진
 * 진짜 원인(예: 지원하지 않는 ?environment= 값)은 boot()의 catch에 닿지 않고, 이어서 boot()가 초기화되지
 * 못한 변수를 건드려 ReferenceError로 실패한다. catch한 예외만 보이면 운영자는 엉뚱한 원인을 읽는다.
 */
export function bootFailureCause(win: object, caught: unknown): unknown {
  return (win as Record<string, unknown>)[BOOT_ERROR_KEY] ?? caught
}

/** Vite base('/moderation/')에서 라우터 basename('/moderation')을 만든다. */
export function routerBasename(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '')
}
