/* 운영 콘솔 공용 틀(shell/app, HP-506) 연결. 공용 틀 안에서 돌 때는 로그인과 PROD 쓰기 확인을 틀에서 받는다.
   틀은 콘솔을 열 때 Keycloak에 한 번 로그인하고, 시딩은 그 토큰을 빌려 쓴다 — 메뉴를 옮길 때마다 시딩이 따로
   로그인하던 것(HP-435의 자체 로그인)을 없애는 자리다. 단독 개발 서버(npm run dev)에서는 연결이 없으므로
   auth.ts의 자체 로그인을 그대로 쓴다. */

export type HostUser = { name: string; sub: string; roles: string[] }

/** PROD 쓰기 최종 확인에 보일 내용 — 조치 콘솔의 'PROD' 입력 확인 창과 같은 칸이다. */
export type ProductionWriteSummary = { target: string; change: string; reason: string }

export type SeedingHost = {
  user: HostUser
  /** 지금 쓸 수 있는 접근 토큰. 만료가 가까우면 틀이 갱신해서 준다. */
  token: () => Promise<string | null>
  logout: () => void
  /** 'PROD'를 입력해야 넘어가는 확인 창. 취소하면 reject 한다. */
  confirmProductionWrite: (summary: ProductionWriteSummary) => Promise<void>
}

let bound: SeedingHost | null = null

/** 공용 틀이 부팅을 마친 뒤, 시딩 화면을 그리기 전에 한 번 부른다. */
export function bindHost(host: SeedingHost) { bound = host }

export function seedingHost(): SeedingHost | null { return bound }
