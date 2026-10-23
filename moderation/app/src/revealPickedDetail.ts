import { useEffect, useRef } from 'react'
import { selectableRow } from './selectableRow'

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
 * @returns workspace는 .change-workspace에 단다. rowProps(key, select)는 행에 펼쳐 단다 — 키보드로 고르기(selectableRow)를
 *     겸하고, 고르는 동작보다 먼저 무엇을 골랐는지 적는다.
 */
export function useRevealPickedDetail(shownKey: Key | null | undefined) {
  const workspace = useRef<HTMLDivElement>(null)
  const pending = useRef<Key | null>(null)
  useEffect(() => {
    if (shownKey == null) return // 아직 그려진 상세가 없다 — 기다린다
    // 상세가 바뀌면 기다림은 끝난다. 고른 항목이 그려지지 못한 채(불러오기 실패) 남겨 두면, 나중에 그 항목이 다른 길로
    // 열릴 때 엉뚱하게 내려간다.
    const wanted = pending.current
    pending.current = null
    if (wanted === shownKey) revealIfStacked(workspace.current)
  }, [shownKey])
  const rowProps = (key: Key, select: () => void) => selectableRow(() => {
    if (key === shownKey) {
      // 이미 그려진 항목 — 상세가 바뀌지 않으니 기다릴 것이 없다. 앞서 고르고 기다리던 것은 잊는다.
      pending.current = null
      select()
      revealIfStacked(workspace.current)
    } else {
      pending.current = key
      select()
    }
  })
  return { workspace, rowProps }
}
