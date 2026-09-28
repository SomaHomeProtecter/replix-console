import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import ConsoleSwitcher from './ConsoleSwitcher'

describe('운영 콘솔 도구 전환(HP-456)', () => {
  it('브랜드는 콘솔 홈으로, 목록은 다른 도구로 페이지를 옮긴다', async () => {
    const user = userEvent.setup()
    render(<ConsoleSwitcher disabled={false} />)

    expect(screen.getByRole('link', { name: /^Re\s*plix$/ })).toHaveAttribute('href', '/')
    const toggle = screen.getByRole('button', { name: /조치 콘솔/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: '운영 콘솔 도구' })).not.toBeInTheDocument()

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const tools = screen.getByRole('navigation', { name: '운영 콘솔 도구' })
    expect(tools).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /운영 콘솔 홈/ })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /시딩 도구/ })).toHaveAttribute('href', '/seeding/')
    // 지금 도구는 링크가 아니라 현재 위치 표시다 — 누르면 같은 앱을 통째로 다시 불러올 뿐이다.
    expect(tools.querySelector('[aria-current="page"]')).toHaveTextContent('조치 콘솔')
  })

  // 시딩 도구는 console.replix.tv에서 늘 운영 서버에 붙는다 — 조치 콘솔이 DEV여도 그렇다(코드 리뷰 지적).
  it('시딩 도구가 늘 운영 서버에 붙는다는 것을 목록에서 밝힌다', async () => {
    const user = userEvent.setup()
    render(<ConsoleSwitcher disabled={false} />)
    await user.click(screen.getByRole('button', { name: /조치 콘솔/ }))
    expect(screen.getByRole('navigation', { name: '운영 콘솔 도구' }))
        .toHaveTextContent('시딩 도구는 늘 운영 서버에 붙습니다')
  })

  it('목록 안에서 Esc를 누르면 닫고 여는 버튼으로 초점을 돌려준다', async () => {
    const user = userEvent.setup()
    render(<ConsoleSwitcher disabled={false} />)
    const toggle = screen.getByRole('button', { name: /조치 콘솔/ })

    await user.click(toggle)
    await user.tab()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('navigation', { name: '운영 콘솔 도구' })).not.toBeInTheDocument()
    expect(toggle).toHaveFocus()
  })

  // Safari는 버튼을 눌러도 초점을 주지 않아 메뉴를 마우스로 열면 초점이 body에 남는다 — 그때도 Esc로 닫혀야
  // 한다. 감싼 요소의 keydown만 받으면 이 경우를 놓친다(재검토 지적, WebKit으로 재현).
  it('초점이 body에 남은 채(Safari 마우스 열기) Esc를 눌러도 닫는다', () => {
    render(<ConsoleSwitcher disabled={false} />)
    fireEvent.click(screen.getByRole('button', { name: /조치 콘솔/ })) // 초점을 옮기지 않는 클릭
    expect(document.activeElement).toBe(document.body)

    fireEvent.keyDown(document.body, { key: 'Escape' })

    expect(screen.queryByRole('navigation', { name: '운영 콘솔 도구' })).not.toBeInTheDocument()
  })

  // 목록이 열린 채 남으면 다른 곳의 Esc(검색창 지우기·대화상자 닫기)까지 가로채 초점을 빼앗았다(코드 리뷰 지적).
  it('초점이 목록 밖으로 나가면 닫고, 밖에서 누른 Esc는 가로채지 않는다', async () => {
    const user = userEvent.setup()
    render(<div><ConsoleSwitcher disabled={false} /><input aria-label="사용자 검색" /></div>)
    const toggle = screen.getByRole('button', { name: /조치 콘솔/ })

    await user.click(toggle)
    await user.click(screen.getByLabelText('사용자 검색'))

    expect(screen.queryByRole('navigation', { name: '운영 콘솔 도구' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByLabelText('사용자 검색')).toHaveFocus()
  })

  // 조치 처리 중 이탈 차단(HP-300)은 종전 브랜드 링크가 지던 책임이라 이 자리가 그대로 잇는다.
  it('조치를 처리하는 동안에는 이동 수단을 모두 잠근다', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ConsoleSwitcher disabled={false} />)
    await user.click(screen.getByRole('button', { name: /조치 콘솔/ }))

    rerender(<ConsoleSwitcher disabled disabledTitle="처리 중" />)

    expect(screen.queryByRole('navigation', { name: '운영 콘솔 도구' })).not.toBeInTheDocument()
    const brand = screen.getByRole('link', { name: /^Re\s*plix$/ })
    expect(brand).toHaveAttribute('aria-disabled', 'true')
    expect(brand).toHaveAttribute('title', '처리 중')
    expect(screen.getByRole('button', { name: /조치 콘솔/ })).toBeDisabled()

    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    brand.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
  })
})
