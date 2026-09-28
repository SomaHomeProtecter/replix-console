import { render, screen } from '@testing-library/react'
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

  it('Esc로 닫고 여는 버튼으로 초점을 돌려준다', async () => {
    const user = userEvent.setup()
    render(<ConsoleSwitcher disabled={false} />)
    const toggle = screen.getByRole('button', { name: /조치 콘솔/ })

    await user.click(toggle)
    await user.tab()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('navigation', { name: '운영 콘솔 도구' })).not.toBeInTheDocument()
    expect(toggle).toHaveFocus()
  })

  it('바깥을 누르면 닫는다', async () => {
    const user = userEvent.setup()
    render(<div><ConsoleSwitcher disabled={false} /><p>본문</p></div>)

    await user.click(screen.getByRole('button', { name: /조치 콘솔/ }))
    await user.click(screen.getByText('본문'))

    expect(screen.queryByRole('navigation', { name: '운영 콘솔 도구' })).not.toBeInTheDocument()
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
