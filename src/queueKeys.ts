import type { ReportItem } from './api/types'

/**
 * 큐 단축키(HP-295)의 순수 판정들 — 화면에서 떼어내 경계 조건을 테스트로 고정한다.
 */

/**
 * 조치로 신고를 닫은 뒤 <b>이어서 처리할 다음 건</b>.
 *
 * <p>이 함수가 따로 있는 이유는 <b>호출 시점</b> 때문이다. 조치 후 목록을 다시 읽으면 필터가
 * OPEN인 한 방금 처리한 건이 목록에서 빠지고, 그때는 "다음이 무엇이었는지"를 알 방법이 없다.
 * 그래서 재조회 <b>전에</b> 이 계산을 끝내 둔다.
 *
 * <p>뒤로만 본다 — 큐는 위에서부터 내려가는 동선이라 앞으로 되감으면 이미 지나친 건을 다시 집어
 * 맴돈다. 뒤에 열림 건이 없으면 {@code null}이고, 그건 "모달을 닫으라"는 뜻이다.
 */
export function nextOpenId(items: ReportItem[], currentId: number): number | null {
  const at = items.findIndex((item) => item.id === currentId)
  if (at < 0) return null
  for (let i = at + 1; i < items.length; i++) {
    if (items[i].status === 'OPEN') return items[i].id
  }
  return null
}

/** 글자를 받는 input 종류 — 라디오·체크박스는 여기 없다(글자를 받지 않는다). */
const TEXT_INPUT_TYPES = new Set([
  'text', 'search', 'email', 'url', 'tel', 'password', 'number',
])

/**
 * 지금 포커스가 <b>글자를 받는 자리</b>인가 — 그렇다면 단축키를 전부 죽인다(HP-295 함정 ③).
 *
 * <p>이게 없으면 처리 메모에 "b"를 치는 순간 메시지가 가려진다. 반대로 점수 칩(라디오)에 포커스가
 * 있을 때는 단축키가 살아 있어야 하므로, input을 뭉뚱그리지 않고 <b>타입으로</b> 가른다.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'TEXTAREA') return true
  if (tag === 'INPUT') return TEXT_INPUT_TYPES.has((target as HTMLInputElement).type)
  // === true로 좁힌다: contentEditable을 구현하지 않는 환경(jsdom 등)에서 undefined가 새어
  // 나가면 호출부의 `if (isTypingTarget(...))`은 통과하지만 반환 타입 계약은 이미 깨진 뒤다.
  return target.isContentEditable === true
}
