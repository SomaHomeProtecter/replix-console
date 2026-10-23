import { useEffect, useRef } from 'react'

type Key = string | number

/** 상세 자리가 목록 아래에 쌓였을 때만(좁은 화면) 그 맨 위로 내려간다. 목록 옆이면(넓은 화면) 이미 보인다. */
function revealIfStacked(workspace: HTMLElement | null) {
  if (!workspace) return
  const children = [...workspace.children]
  const list = children.find((child) => child.classList.contains('change-list'))
  const slot = children.find((child) => child !== list)
  if (!list || !(slot instanceof HTMLElement)) return
  const listBox = list.getBoundingClientRect()
  if (listBox.height === 0) return // 배치가 없다(숨은 목록)
  if (slot.getBoundingClientRect().top < listBox.bottom - 1) return
  slot.scrollIntoView({ block: 'start' })
}

/**
 * 목록·상세 화면(.change-workspace)에서 사람이 고른 항목의 상세를 화면에 들인다(HP-699). 좁은 화면에서는 상세가 목록
 * 아래에 쌓여, 고른 행의 상세가 화면 밖에 그려지면 눌러도 아무 일이 없는 것처럼 보였다.
 *
 * <p>상세는 고른 뒤에 불러와 그려진다 — 고르는 순간의 자리는 짧은 안내라 거기로 내려가면 문서 끝에 막힌다. 그래서 고른
 * 항목의 상세가 그려진 렌더 뒤에 한 번 내려간다. 주소로 연 항목이나 조치 뒤 다시 읽기처럼 사람이 고르지 않은 바뀜에는
 * 움직이지 않는다.
 *
 * @param shownKey 지금 상세에 그려진 항목의 키(없으면 null)
 * @returns workspace는 .change-workspace에 단다. picked(key)는 행을 고를 때 부른다.
 */
export function useRevealPickedDetail(shownKey: Key | null | undefined) {
  const workspace = useRef<HTMLDivElement>(null)
  const pending = useRef<Key | null>(null)
  useEffect(() => {
    if (pending.current === null || pending.current !== shownKey) return
    pending.current = null
    revealIfStacked(workspace.current)
  }, [shownKey])
  const picked = (key: Key) => {
    // 이미 그려진 항목을 다시 고르면 상세가 바뀌지 않아 렌더를 기다릴 것이 없다
    if (key === shownKey) revealIfStacked(workspace.current)
    else pending.current = key
  }
  return { workspace, picked }
}
