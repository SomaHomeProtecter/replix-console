import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { selectableRow } from './selectableRow'

function Row({ select }: { select: () => void }) {
  return (
    <table><tbody>
      <tr data-testid="row" {...selectableRow(select)}><td>정책 후보 A <button type="button">안쪽 버튼</button></td></tr>
    </tbody></table>
  )
}

describe('키보드로 행 고르기(HP-527)', () => {
  it('Tab으로 닿고 Enter·Space로 고른다', () => {
    const select = vi.fn()
    render(<Row select={select} />)
    const row = screen.getByTestId('row')
    expect(row).toHaveAttribute('tabindex', '0')
    fireEvent.keyDown(row, { key: 'Enter' })
    fireEvent.keyDown(row, { key: ' ' })
    expect(select).toHaveBeenCalledTimes(2)
  })

  it('행 안의 버튼에서 누른 키는 그 버튼의 것이다', () => {
    const select = vi.fn()
    render(<Row select={select} />)
    fireEvent.keyDown(screen.getByRole('button', { name: '안쪽 버튼' }), { key: 'Enter' })
    expect(select).not.toHaveBeenCalled()
  })
})

/**
 * 좁은 화면에서는 목록과 상세가 위아래로 쌓여, 고른 행의 상세가 목록 아래 화면 밖에 그려지면 눌러도 아무 일이 없는
 * 것처럼 보였다(HP-699). jsdom은 배치를 계산하지 않으므로 상세 자리의 위치를 정해 준다.
 */
describe('고른 행의 상세를 화면에 들이기(HP-699)', () => {
  function Workspace({ select }: { select: () => void }) {
    return (
      <div className="change-workspace">
        <div className="change-list"><table><tbody>
          <tr data-testid="row" {...selectableRow(select)}><td>변경 세트 #55</td></tr>
        </tbody></table></div>
        <aside className="change-detail" data-testid="detail">상세</aside>
      </div>
    )
  }

  /** 목록 칸과 상세 자리의 위치를 정한다 — 좁은 화면은 상세가 목록 아래에, 넓은 화면은 목록 옆에 놓인다. */
  function place(list: { top: number; height: number }, detailTop: number) {
    const listBox = screen.getByTestId('row').closest('.change-list') as HTMLElement
    listBox.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: list.top, width: 300, height: list.height })
    const detail = screen.getByTestId('detail')
    detail.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: detailTop, width: 300, height: 400 })
    const scroll = vi.fn()
    detail.scrollIntoView = scroll
    return scroll
  }

  it('상세가 목록 아래에 쌓였으면 고를 때 상세 맨 위로 내려간다 — 클릭과 Enter 모두, 상세가 화면 끝자락에 보여도', () => {
    const select = vi.fn()
    render(<Workspace select={select} />)
    // 목록이 화면 아래까지 이어지고, 상세는 목록 바로 아래 — 윗부분 100px만 화면 끝에 걸린 경우
    const scroll = place({ top: -400, height: window.innerHeight + 300 }, window.innerHeight - 100)
    fireEvent.click(screen.getByTestId('row'))
    fireEvent.keyDown(screen.getByTestId('row'), { key: 'Enter' })
    expect(select).toHaveBeenCalledTimes(2)
    expect(scroll).toHaveBeenCalledTimes(2)
    expect(scroll).toHaveBeenCalledWith({ block: 'start' })
  })

  it('상세가 목록 옆에 있으면(넓은 화면) 움직이지 않는다 — 상세가 화면 아래로 길어도', () => {
    render(<Workspace select={vi.fn()} />)
    const scroll = place({ top: 120, height: window.innerHeight * 2 }, 120)
    fireEvent.click(screen.getByTestId('row'))
    expect(scroll).not.toHaveBeenCalled()
  })

  it('배치가 없으면(목록 높이 0) 아무것도 하지 않는다', () => {
    render(<Workspace select={vi.fn()} />)
    const scroll = place({ top: 0, height: 0 }, 0)
    fireEvent.click(screen.getByTestId('row'))
    expect(scroll).not.toHaveBeenCalled()
  })
})

/**
 * 상세는 고른 뒤 불러와 그려진다(HP-699). 고르는 순간의 자리는 짧은 안내라 문서 끝에 막혀 다 내려가지 못하므로, 상세가
 * 그려지면 그 맨 위로 다시 맞춘다. 그 사이 사람이 직접 스크롤했으면 다시 맞추지 않는다.
 */
describe('불러온 뒤 그려지는 상세(HP-699)', () => {
  function AsyncWorkspace() {
    const [loaded, setLoaded] = useState(false)
    return (
      <div className="change-workspace">
        <div className="change-list"><table><tbody>
          <tr data-testid="row" {...selectableRow(() => { window.setTimeout(() => setLoaded(true), 10) })}><td>공지 #41</td></tr>
        </tbody></table></div>
        {loaded
          ? <aside className="change-detail" data-testid="detail">상세</aside>
          : <div className="change-empty" data-testid="empty">공지를 고르세요</div>}
      </div>
    )
  }

  let targets: Element[]
  beforeEach(() => {
    targets = []
    // 좁은 화면 배치 — 목록은 화면을 넘게 길고, 그 아래에 상세 자리가 쌓인다
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.classList.contains('change-list')
        ? DOMRect.fromRect({ x: 0, y: -400, width: 300, height: window.innerHeight + 300 })
        : DOMRect.fromRect({ x: 0, y: window.innerHeight - 100, width: 300, height: 80 })
    })
    Element.prototype.scrollIntoView = function (this: Element) { targets.push(this) }
  })
  afterEach(() => {
    vi.restoreAllMocks()
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })

  it('상세가 그려지면 그 맨 위로 다시 내려간다', async () => {
    render(<AsyncWorkspace />)
    fireEvent.click(screen.getByTestId('row'))
    expect(targets).toEqual([screen.getByTestId('empty')])
    const detail = await screen.findByTestId('detail')
    await waitFor(() => expect(targets).toContain(detail))
  })

  // 사람이 손대면(휠·터치·키·누름) 그만둔다 — 넓은 틀에서는 문서가 아니라 안쪽 칸이 스크롤돼 위치로는 알 수 없다
  it('그 사이 사람이 직접 스크롤을 시작했으면 다시 맞추지 않는다', async () => {
    render(<AsyncWorkspace />)
    fireEvent.click(screen.getByTestId('row'))
    fireEvent.wheel(window)
    await screen.findByTestId('detail')
    await new Promise((resolve) => window.setTimeout(resolve, 30))
    expect(targets).toHaveLength(1)
  })
})
