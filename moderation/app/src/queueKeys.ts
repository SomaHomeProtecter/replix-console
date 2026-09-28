/** 큐 단축키(HP-295)의 DOM 경계 판정. */

export type QueueCommand = { key: 'b' | 'n' | 'x' | 's'; sequence: number }

/** 글자를 받는 input 종류 — 라디오·체크박스는 글자를 입력하지 않는다. */
const TEXT_INPUT_TYPES = new Set([
  'text', 'search', 'email', 'url', 'tel', 'password', 'number',
])

/**
 * 지금 포커스가 글자를 받는 자리인가.
 *
 * 처리 메모에 b/n/x/s를 입력할 때 조치가 실행되면 안 된다. input 전체를 막지 않는 이유는
 * 점수 라디오 같은 비문자 컨트롤의 기본 키보드 동작을 유지하기 위해서다.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.tagName === 'TEXTAREA') return true
  if (target.tagName === 'INPUT') {
    return TEXT_INPUT_TYPES.has((target as HTMLInputElement).type)
  }
  return target.isContentEditable === true
}

/**
 * 논리 문자 단축키. IME 조합 중에는 호출부가 무시한다.
 *
 * 물리 키인 `code`를 쓰면 Dvorak 등 다른 배열에서 화면의 X와 실제 기각 키가 달라진다.
 * 운영자가 입력 배열에서 실제로 만든 문자를 기준으로 판정한다.
 */
export function shortcutKey(key: string): string | null {
  if (key.length !== 1) return null
  const normalized = key.toLowerCase()
  return /^[a-z]$/.test(normalized) ? normalized : null
}
