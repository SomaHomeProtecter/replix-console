import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import ProductionWriteGuard from './ProductionWriteGuard'
import { confirmProductionWrite } from './prodWriteConfirmation'

function Harness() {
  const [result, setResult] = useState('대기')
  return (
    <>
      <button type="button" onClick={() => {
        void confirmProductionWrite({
          target: '사용자 #9', change: 'ACTIVE → SUSPENDED', reason: '반복 도배',
        }).then(() => setResult('승인'), () => setResult('취소'))
      }}>변경 요청</button>
      <output>{result}</output>
    </>
  )
}

describe('PROD 변경 최종 확인', () => {
  it('환경·대상·변경·사유를 보여주고 PROD 직접 입력 전에는 적용할 수 없다', async () => {
    const user = userEvent.setup()
    render(<ProductionWriteGuard><Harness /></ProductionWriteGuard>)

    await user.click(screen.getByRole('button', { name: '변경 요청' }))
    const dialog = screen.getByRole('dialog', { name: 'PROD 변경 최종 확인' })
    expect(dialog).toHaveTextContent('PROD')
    expect(dialog).toHaveTextContent('사용자 #9')
    expect(dialog).toHaveTextContent('ACTIVE → SUSPENDED')
    expect(dialog).toHaveTextContent('반복 도배')

    const apply = screen.getByRole('button', { name: 'PROD에 적용' })
    expect(apply).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'PROD 확인 입력' }), 'PROD')
    expect(apply).toBeEnabled()
    await user.click(apply)
    expect(screen.getByText('승인')).toBeInTheDocument()
  })

  it('취소하면 원 요청을 거부한다', async () => {
    const user = userEvent.setup()
    render(<ProductionWriteGuard><Harness /></ProductionWriteGuard>)
    await user.click(screen.getByRole('button', { name: '변경 요청' }))
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.getByText('취소')).toBeInTheDocument()
  })

  it('키보드 포커스가 확인 겹 밖으로 빠지지 않고 닫힌 뒤 요청 버튼으로 돌아온다', async () => {
    const user = userEvent.setup()
    render(<ProductionWriteGuard><Harness /></ProductionWriteGuard>)
    const opener = screen.getByRole('button', { name: '변경 요청' })
    opener.focus()
    await user.click(opener)

    const input = screen.getByRole('textbox', { name: 'PROD 확인 입력' })
    input.focus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: '취소' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(opener).toHaveFocus()
  })
})
