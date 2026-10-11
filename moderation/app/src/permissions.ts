import { realmRoles } from '@core/auth'
import { deniedReason } from '@core/roles'

/**
 * 신고·메시지·계정·정책·피드백·운영 협업 쓰기를 못 하는 이유 — 할 수 있으면 null(HP-529). 서버는 이 쓰기(admin 아래
 * control이 아닌 경로)를 admin·moderation_operator에게만 허락한다(BE SecurityConfig). 화면 판정은 안내용이다 —
 * 서버가 같은 역할을 다시 검사한다.
 */
export function moderateDenied(): string | null {
  return deniedReason(realmRoles(), 'moderate', '조치')
}
