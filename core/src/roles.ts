/*
 * 콘솔 역할과 그 역할로 할 수 있는 일(HP-337 역할 분리) — BE SecurityConfig와 같은 집합이다. 화면 판정은 안내용이지
 * 보안 경계가 아니다(서버가 같은 역할을 다시 검사한다). 종전에는 공용 틀·권한 없음 화면·시딩·조치 화면 6곳에 따로
 * 적혀 있어 하나를 고치면 나머지가 어긋날 수 있었다(HP-523).
 */
export const CONSOLE_ROLES = [
  'admin', 'admin_console_viewer', 'moderation_operator', 'feature_flag_operator', 'prod_change_approver',
] as const
export type ConsoleRole = (typeof CONSOLE_ROLES)[number]

/** 할 수 있는 일 → 그 일을 허락하는 역할. 권한 없음 화면의 표도 이 순서·문구를 그대로 보인다. */
export const CAPABILITIES = {
  view: { label: '시딩과 조치 보기', roles: ['admin', 'moderation_operator', 'admin_console_viewer'] },
  moderate: { label: '채팅 넣기, 신고와 계정 조치', roles: ['admin', 'moderation_operator'] },
  operateFeatures: { label: '기능 제어', roles: ['admin', 'feature_flag_operator'] },
  approveProd: { label: 'PROD 고위험 변경 승인', roles: ['admin', 'prod_change_approver'] },
  /** 인시던트 메모 — 조치·기능 제어·승인 역할 모두 남길 수 있다. 표에는 보이지 않는다. */
  note: { label: '인시던트 메모', roles: ['admin', 'moderation_operator', 'feature_flag_operator', 'prod_change_approver'] },
} as const satisfies Record<string, { label: string; roles: readonly ConsoleRole[] }>
export type Capability = keyof typeof CAPABILITIES

/** 권한 없음 화면에 보이는 할 일 — 순서가 곧 표의 순서다. */
export const SHOWN_CAPABILITIES: readonly Capability[] = ['view', 'moderate', 'operateFeatures', 'approveProd']

/** 콘솔에 들어올 수 있는가 — 콘솔 역할이 하나라도 있으면 들어온다(없으면 권한 없음 화면, HP-506). */
export function hasConsoleRole(roles: readonly string[]): boolean {
  return roles.some((role) => (CONSOLE_ROLES as readonly string[]).includes(role))
}

/** 이 역할들로 그 일을 할 수 있는가. */
export function can(roles: readonly string[], capability: Capability): boolean {
  return (CAPABILITIES[capability].roles as readonly string[]).some((role) => roles.includes(role))
}

/** 'a 또는 b', 'a, b 또는 c' — 역할 이름을 안내 문장에 넣는다. */
function joinOr(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} 또는 ${items[items.length - 1]}`
}

/**
 * 그 일을 할 수 없는 이유 — 할 수 있으면 null(HP-529). 권한이 없는 계정에 버튼을 켜 두면 눌러 본 뒤에야 서버가 거절해,
 * 무엇이 막혔는지 알기 어렵다. 버튼을 끄고 이 문장을 보여 준다.
 */
export function deniedReason(roles: readonly string[], capability: Capability, action: string): string | null {
  if (can(roles, capability)) return null
  return `${action} 권한이 없습니다 — ${joinOr(CAPABILITIES[capability].roles)} 역할이 필요합니다`
}
