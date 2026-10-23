import type { KeyboardEvent, MouseEvent } from 'react'

/** 상세를 불러와 그리는 동안 다시 맞추는 시간. 관리 API는 정상이면 수백 ms 안에 답한다. */
const REVEAL_SETTLE_MS = 1500
/**
 * 사람이 화면을 직접 움직이기 시작했다는 입력 — 그 뒤로는 다시 맞추지 않는다. 스크롤 위치로 가르지 않는 것은 넓은
 * 틀(761~900px)에서는 문서가 아니라 안쪽 칸이 스크롤되기 때문이다. 코드가 낸 스크롤은 이런 입력을 내지 않는다.
 */
const USER_INPUT = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

/**
 * 고른 행의 상세 자리를 화면에 들인다(HP-699). 좁은 화면에서는 목록과 상세가 위아래로 쌓여, 고른 행의 상세가 목록 아래
 * 화면 밖이나 끝자락에 그려지면 눌러도 아무 일이 없는 것처럼 보였다. 상세가 목록 아래에 쌓였을 때만 상세 맨 위로
 * 내려간다 — 넓은 화면에서는 상세가 목록 옆에 있어 움직이지 않는다.
 *
 * <p>상세는 고른 뒤에 불러와 그려진다. 고르는 순간의 자리(.change-workspace에서 목록이 아닌 칸)는 짧은 안내라 문서 끝에
 * 막혀 다 내려가지 못하므로, 잠시 동안 자리가 바뀌면 다시 맞춘다. 그 사이 사람이 화면을 직접 움직이면 그만둔다.
 */
function revealDetail(row: HTMLElement) {
  const list = row.closest('.change-list')
  const workspace = row.closest('.change-workspace')
  if (!list || !workspace) return
  const reveal = () => {
    const slot = [...workspace.children].find((child) => child !== list)
    const listBox = list.getBoundingClientRect()
    if (!(slot instanceof HTMLElement) || listBox.height === 0) return false // 배치가 없다(숨은 목록)
    if (slot.getBoundingClientRect().top < listBox.bottom - 1) return false // 목록 옆 칸(넓은 화면)
    slot.scrollIntoView({ block: 'start' })
    return true
  }
  if (!reveal()) return
  const observer = new MutationObserver(() => { reveal() })
  const stop = () => {
    observer.disconnect()
    for (const type of USER_INPUT) window.removeEventListener(type, stop, { capture: true })
  }
  observer.observe(workspace, { childList: true, subtree: true })
  for (const type of USER_INPUT) window.addEventListener(type, stop, { capture: true, passive: true })
  window.setTimeout(stop, REVEAL_SETTLE_MS)
}

/**
 * 표의 행을 키보드로도 고르게 한다(HP-527) — Tab으로 행에 닿고 Enter·Space로 고른다. 나중 화면의 행은 마우스로만
 * 고를 수 있었다(초기 화면의 신고 큐는 키보드로 옮겨 다닌다).
 */
export function selectableRow(select: () => void) {
  return {
    tabIndex: 0,
    onClick: (event: MouseEvent<HTMLElement>) => {
      select()
      revealDetail(event.currentTarget)
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return // 행 안의 버튼·링크 키는 그 요소의 것이다
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        select()
        revealDetail(event.currentTarget)
      }
    },
  }
}
