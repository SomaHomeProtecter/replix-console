/** 콘솔 환경(.env.local) — 누락 검증을 부트스트랩 시점에 끝내 런타임 미스터리를 없앤다. */
function required(name: string): string {
  const value = import.meta.env[name] as string | undefined
  if (!value) {
    throw new Error(`${name} 값이 없습니다 — admin-ui/.env.local 을 확인하세요 (.env.example 참조)`)
  }
  return value
}

/**
 * 선택 값 — 없으면 그 기능만 화면에서 빠진다.
 *
 * <p><b>required()에 넣지 않는다</b>: env 검증은 부트스트랩 시점에 throw 하므로, 값을 안 채운
 * 팀원의 콘솔이 <b>통째로 뜨지 않는다</b>. Grafana 링크 하나 때문에 콘솔을 못 쓰는 것은
 * 바꾸려던 것보다 나쁘다.
 */
function optional(name: string): string | null {
  const value = import.meta.env[name] as string | undefined
  return value ? value : null
}

export const env = {
  apiBaseUrl: required('VITE_API_BASE_URL').replace(/\/$/, ''),
  kcUrl: required('VITE_KC_URL'),
  kcRealm: required('VITE_KC_REALM'),
  kcClientId: required('VITE_KC_CLIENT_ID'),
  /** 모더레이션 대시보드(HP-297). 콘솔은 차트를 그리지 않고 있는 곳으로 보낸다. */
  grafanaUrl: optional('VITE_GRAFANA_URL'),
}
