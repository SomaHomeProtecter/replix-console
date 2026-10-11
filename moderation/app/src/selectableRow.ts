import type { KeyboardEvent } from 'react'

/**
 * 표의 행을 키보드로도 고르게 한다(HP-527) — Tab으로 행에 닿고 Enter·Space로 고른다. 나중 화면의 행은 마우스로만
 * 고를 수 있었다(초기 화면의 신고 큐는 키보드로 옮겨 다닌다).
 */
export function selectableRow(select: () => void) {
  return {
    tabIndex: 0,
    onClick: select,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return // 행 안의 버튼·링크 키는 그 요소의 것이다
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        select()
      }
    },
  }
}
