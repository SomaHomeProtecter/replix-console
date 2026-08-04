/** 콘솔 환경(.env.local) — 누락 검증을 부트스트랩 시점에 끝내 런타임 미스터리를 없앤다. */
function required(name: string): string {
  const value = import.meta.env[name] as string | undefined
  if (!value) {
    throw new Error(`${name} 값이 없습니다 — admin-ui/.env.local 을 확인하세요 (.env.example 참조)`)
  }
  return value
}

export const env = {
  apiBaseUrl: required('VITE_API_BASE_URL').replace(/\/$/, ''),
  kcUrl: required('VITE_KC_URL'),
  kcRealm: required('VITE_KC_REALM'),
  kcClientId: required('VITE_KC_CLIENT_ID'),
}
