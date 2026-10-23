import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRevealPickedDetail } from './revealPickedDetail'

/**
 * 목록·상세 화면(HP-699) — 좁은 화면에서는 상세가 목록 아래에 쌓여, 고른 행의 상세가 화면 밖에 그려지면 눌러도 아무 일이
 * 없는 것처럼 보였다. 상세는 고른 뒤에 불러와 그려지므로, 고른 항목의 상세가 그려진 뒤에 그 맨 위로 내려가야 한다.
 * jsdom은 배치를 계산하지 않으므로 목록·상세 자리의 위치를 정해 준다.
 */
function Page() {
  const [shown, setShown] = useState<number | null>(null)
  const reveal = useRevealPickedDetail(shown)
  const pick = (id: number) => {
    reveal.picked(id)
    window.setTimeout(() => setShown(id), 10) // 상세는 불러온 뒤에 그려진다
  }
  return (
    <div className="change-workspace" ref={reveal.workspace}>
      <div className="change-list"><table><tbody>
        {[1, 2].map((id) => (
          <tr key={id} data-testid={`row-${id}`} onClick={() => pick(id)}><td>공지 #{id}</td></tr>
        ))}
      </tbody></table></div>
      {shown === null
        ? <div className="change-empty">공지를 고르세요</div>
        : <aside className="change-detail" data-testid="detail">공지 #{shown} 상세</aside>}
      {/* 사람이 고르지 않은 바뀜 — 주소로 연 항목, 조치 뒤 다시 읽기 */}
      <button type="button" onClick={() => setShown(2)}>다른 항목 열기</button>
    </div>
  )
}

let targets: Element[]
function layout(stacked: boolean, listHeight = window.innerHeight + 300) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('change-list')) return DOMRect.fromRect({ x: 0, y: -400, width: 300, height: listHeight })
    // 좁은 화면 = 목록 바로 아래(윗부분만 화면 끝에 걸림), 넓은 화면 = 목록 옆
    return stacked
      ? DOMRect.fromRect({ x: 0, y: listHeight - 400, width: 300, height: 500 })
      : DOMRect.fromRect({ x: 320, y: -400, width: 300, height: 500 })
  })
}

beforeEach(() => {
  targets = []
  Element.prototype.scrollIntoView = function (this: Element, options?: boolean | ScrollIntoViewOptions) {
    expect(options).toEqual({ block: 'start' })
    targets.push(this)
  }
})
afterEach(() => {
  vi.restoreAllMocks()
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
})

describe('고른 항목의 상세를 화면에 들이기(HP-699)', () => {
  it('좁은 화면 — 고른 항목의 상세가 그려진 뒤 그 맨 위로 한 번 내려간다', async () => {
    layout(true)
    render(<Page />)
    fireEvent.click(screen.getByTestId('row-1'))
    expect(targets).toEqual([]) // 아직 안내 문구 — 여기서 내려가면 문서 끝에 막힌다
    const detail = await screen.findByTestId('detail')
    expect(targets).toEqual([detail])
  })

  it('이미 보이는 항목을 다시 고르면 바로 내려간다', async () => {
    layout(true)
    render(<Page />)
    fireEvent.click(screen.getByTestId('row-1'))
    const detail = await screen.findByTestId('detail')
    fireEvent.click(screen.getByTestId('row-1'))
    expect(targets).toEqual([detail, detail])
  })

  it('사람이 고르지 않은 바뀜(주소로 연 항목·다시 읽기)에는 움직이지 않는다', async () => {
    layout(true)
    render(<Page />)
    fireEvent.click(screen.getByRole('button', { name: '다른 항목 열기' }))
    await screen.findByTestId('detail')
    expect(targets).toEqual([])
  })

  it('넓은 화면 — 상세가 목록 옆에 있으면 움직이지 않는다', async () => {
    layout(false)
    render(<Page />)
    fireEvent.click(screen.getByTestId('row-1'))
    await screen.findByTestId('detail')
    expect(targets).toEqual([])
  })

  it('배치가 없으면(목록 높이 0) 움직이지 않는다', async () => {
    layout(true, 0)
    render(<Page />)
    fireEvent.click(screen.getByTestId('row-1'))
    await screen.findByTestId('detail')
    expect(targets).toEqual([])
  })
})
