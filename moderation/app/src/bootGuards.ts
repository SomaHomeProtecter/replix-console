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
